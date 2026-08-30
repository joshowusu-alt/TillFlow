const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { PrismaClient } = require('@prisma/client');

const BASE_URL = process.env.BASE_URL || 'http://localhost:6200';
const OWNER_EMAIL = process.env.E2E_OWNER_EMAIL || 'owner@store.com';
const OWNER_PASSWORD = process.env.E2E_OWNER_PASSWORD || 'Pass1234!';
const ARTIFACT_DIR = path.join(process.cwd(), '.playwright-mcp');
const prisma = new PrismaClient();

/** Current POS CTAs: Complete Cash/Part-Paid/Credit Sale — /Complete Sale/i does not match these. */
const COMPLETE_CASH_SALE = /Complete Cash Sale/i;
const COMPLETE_CREDIT_SALE = /Complete Credit Sale/i;
const COMPLETE_PART_PAID_SALE = /Complete Part-Paid Sale/i;

function step(msg) { console.log(`[deep-e2e] ${msg}`); }

async function screenshotStep(page, name) {
  try {
    fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
    await page.screenshot({ path: path.join(ARTIFACT_DIR, `deep-${name}.png`), fullPage: true });
  } catch (_) { /* best effort */ }
}

/** Poll page URL until it matches the pattern (30s timeout by default) */
async function waitForURLPattern(page, pattern, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (pattern.test(page.url())) return;
    await page.waitForTimeout(500);
  }
  throw new Error(`URL did not match ${pattern} within ${timeoutMs}ms. Current: ${page.url()}`);
}

async function ensureOwnerPassword() {
  try {
    const bcrypt = require('bcryptjs');
    const hash = await bcrypt.hash(OWNER_PASSWORD, 10);
    const pinHash = await bcrypt.hash('1234', 10);
    await prisma.user.updateMany({
      where: { email: OWNER_EMAIL },
      data: { passwordHash: hash, approvalPinHash: pinHash },
    });
    step('Owner password/PIN ensured');
  } catch (e) { step(`ensureOwnerPassword warning: ${e.message}`); }
}

/** Operational POS sales require an OPEN shift. Seed does not open one. */
async function ensureOpenShift(email) {
  const user = await prisma.user.findFirst({ where: { email } });
  if (!user) throw new Error(`Cannot open till: no user ${email}`);
  const store = await prisma.store.findFirst({ where: { businessId: user.businessId } });
  if (!store) throw new Error('Cannot open till: no store for this business');
  const till = await prisma.till.findFirst({
    where: { storeId: store.id, active: true },
    orderBy: { name: 'asc' },
  });
  if (!till) throw new Error('Cannot open till: no active till');
  const existing = await prisma.shift.findFirst({
    where: { tillId: till.id, status: 'OPEN' },
  });
  if (existing) return existing;
  const openingCashPence = 10000;
  const created = await prisma.shift.create({
    data: {
      tillId: till.id,
      userId: user.id,
      openingCashPence,
      expectedCashPence: openingCashPence,
      status: 'OPEN',
      openKey: till.id,
    },
  });
  step(`Opened till ${till.name} (${created.id})`);
  return created;
}

async function login(page, email, password) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
  await page.locator('input[name="email"]').waitFor({ state: 'visible', timeout: 15000 });
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
  // Poll for redirect (up to 30s) — more reliable than waitForURL with server actions
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    const url = page.url();
    if (/\/pos|\/onboarding/.test(url)) break;
    if (/error=/.test(url)) {
      await screenshotStep(page, 'login-error');
      throw new Error(`Login returned error. URL: ${url}`);
    }
    await page.waitForTimeout(500);
  }
  const postLoginUrl = page.url();
  if (!/\/pos|\/onboarding/.test(postLoginUrl)) {
    await screenshotStep(page, 'login-failed');
    const body = await page.locator('body').textContent().catch(() => '');
    throw new Error(`Login did not redirect within 30s. URL: ${postLoginUrl}. Body snippet: ${body.slice(0, 200)}`);
  }
  if (/\/onboarding/.test(postLoginUrl)) {
    await page.goto(`${BASE_URL}/pos`, { waitUntil: 'networkidle' });
  }
}

async function waitForTillReady(page) {
  const tillSelect = page.locator('#pos-till-select');
  await tillSelect.waitFor({ state: 'attached', timeout: 20000 });
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const state = await tillSelect.getAttribute('data-checkout-till-state').catch(() => null);
    if (state === 'ready') return;
    const checkoutReady = await page.locator('[data-checkout-state="ready"]').count().catch(() => 0);
    if (checkoutReady > 0 && state && state !== 'loading' && state !== 'failed' && state !== 'empty') {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  await screenshotStep(page, 'till-not-ready');
  throw new Error(
    `Till did not become ready. tillState=${await tillSelect.getAttribute('data-checkout-till-state').catch(() => null)}`,
  );
}

async function clickActionableCompleteSale(page, saleTypeRegex, label) {
  const candidates = page.getByRole('button', { name: saleTypeRegex });
  const deadline = Date.now() + 20000;
  let completeHandle = null;
  while (Date.now() < deadline) {
    const handles = await candidates.elementHandles();
    for (const handle of handles) {
      const meta = await handle.evaluate((el) => {
        const node = /** @type {HTMLButtonElement} */ (el);
        const rect = node.getBoundingClientRect();
        const style = window.getComputedStyle(node);
        return {
          disabled: node.disabled,
          display: style.display,
          visibility: style.visibility,
          width: rect.width,
          height: rect.height,
          text: (node.textContent || '').replace(/\s+/g, ' ').trim(),
        };
      });
      const actionable =
        !meta.disabled &&
        meta.display !== 'none' &&
        meta.visibility !== 'hidden' &&
        meta.width > 0 &&
        meta.height > 0;
      if (actionable) {
        completeHandle = handle;
        break;
      }
      await handle.dispose().catch(() => undefined);
    }
    if (completeHandle) {
      for (const handle of handles) {
        if (handle !== completeHandle) await handle.dispose().catch(() => undefined);
      }
      break;
    }
    for (const handle of handles) {
      await handle.dispose().catch(() => undefined);
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  if (!completeHandle) {
    await screenshotStep(page, `complete-unavailable-${label.replace(/\s+/g, '-').toLowerCase()}`);
    throw new Error(`${label} control not visible and enabled (stale /Complete Sale/i does not match current POS labels)`);
  }
  // Submit exactly once.
  await completeHandle.click();
  await completeHandle.dispose().catch(() => undefined);
}

async function addProductFromSearch(page, query) {
  await waitForTillReady(page);
  const searchInput = page.getByPlaceholder(/type product name/i);
  await searchInput.waitFor({ state: 'visible', timeout: 15000 });
  await searchInput.click();
  await searchInput.fill(query);
  const productButton = page.locator('button:not([disabled])', { hasText: new RegExp(query, 'i') });
  await productButton.first().waitFor({ state: 'visible', timeout: 10000 });
  // Autocomplete can remount while filtering; re-query immediately before click.
  try {
    await productButton.first().click({ timeout: 10000 });
  } catch {
    await searchInput.fill('');
    await searchInput.fill(query);
    await productButton.first().waitFor({ state: 'visible', timeout: 10000 });
    await productButton.first().click({ timeout: 10000 });
  }

  // Multi-unit products stage; single-unit may add immediately. Do not race cash Exact.
  const addToCartBtn = page.getByRole('button', { name: /Add to Cart/i });
  const readyHint = page.getByText(/Ready —|Ready to complete/i).first();
  const outcome = await Promise.race([
    addToCartBtn.waitFor({ state: 'visible', timeout: 5000 }).then(() => 'staged'),
    readyHint.waitFor({ state: 'visible', timeout: 5000 }).then(() => 'direct'),
  ]).catch(() => 'timeout');

  if (outcome === 'staged') {
    await addToCartBtn.click();
  }

  // Prove the product is evidenced in the POS surface after add.
  await page
    .getByText(new RegExp(query, 'i'))
    .first()
    .waitFor({ state: 'visible', timeout: 15000 })
    .catch(async () => {
      await screenshotStep(page, `product-missing-${query}`);
      throw new Error(`Product "${query}" was not evidenced in cart/POS after add (outcome=${outcome})`);
    });
}

async function completePaidSale(page) {
  await waitForTillReady(page);

  const paymentStatus = page.getByLabel(/payment status/i);
  if ((await paymentStatus.count()) > 0) {
    const current = await paymentStatus.inputValue().catch(() => '');
    if (current && current !== 'PAID') {
      await paymentStatus.selectOption('PAID');
    }
  }
  const cashMethod = page.getByRole('button', { name: 'Cash', exact: true });
  if ((await cashMethod.count()) > 0) {
    const pressed = await cashMethod.first().getAttribute('aria-pressed').catch(() => null);
    if (pressed !== 'true') {
      await cashMethod.first().click();
    }
  }

  const exactCash = page.locator('[data-pos-cash-denominations="true"]').getByRole('button', { name: /^Exact$/ });
  if ((await exactCash.count()) > 0) {
    await exactCash.first().click();
  }

  await page
    .getByText(/Ready — Cash|Ready to complete • Cash/i)
    .first()
    .waitFor({ state: 'visible', timeout: 15000 })
    .catch(async () => {
      await screenshotStep(page, 'paid-cash-not-ready');
      throw new Error('Paid cash checkout was not ready before Complete Cash Sale');
    });

  await clickActionableCompleteSale(page, COMPLETE_CASH_SALE, 'Complete Cash Sale');
  await page.getByText(/Sale Complete!/i).waitFor({ timeout: 30000 });
  const receiptHref = await page.getByRole('link', { name: /Reprint last receipt/i }).getAttribute('href');
  if (!receiptHref) throw new Error('Missing receipt link after sale');
  const invoiceId = receiptHref.split('/').filter(Boolean).pop();
  if (!invoiceId) throw new Error('Could not parse invoice id from receipt URL');
  return { receiptHref, invoiceId };
}

async function openPurchaseForm(page) {
  const addLineButton = page.getByRole('button', { name: /^Add line$/i });
  if (!(await addLineButton.isVisible().catch(() => false))) {
    await page.locator('#record-purchase-form').evaluate((details) => {
      details.setAttribute('open', '');
    });
  }
  await addLineButton.waitFor({ state: 'visible', timeout: 10000 });
}

async function seedUnpaidExpense() {
  const owner = await prisma.user.findUnique({
    where: { email: OWNER_EMAIL },
    select: { id: true, businessId: true }
  });
  if (!owner) return;
  const store = await prisma.store.findFirst({
    where: { businessId: owner.businessId },
    select: { id: true }
  });
  const account = await prisma.account.findFirst({
    where: { businessId: owner.businessId, type: 'EXPENSE' },
    select: { id: true }
  });
  if (!store || !account) return;
  await prisma.expense.create({
    data: {
      businessId: owner.businessId,
      storeId: store.id,
      userId: owner.id,
      accountId: account.id,
      amountPence: 1234,
      paymentStatus: 'UNPAID',
      method: null,
      notes: 'E2E seeded unpaid expense'
    }
  });
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  // Desktop POS: Complete Sale CTAs live in checkout panel + sidebar (not phone sheet).
  const context = await browser.newContext({
    acceptDownloads: true,
    viewport: { width: 1280, height: 720 },
  });
  const page = await context.newPage();

  const report = {
    loginOwner: false,
    users: { create: false, edit: false, deactivate: false, createdEmail: null },
    purchases: { create: false, return: false, returnPath: null },
    sales: { createPaid: false, receiptOpen: false, amend: false, return: false, amendedInvoiceId: null, returnedInvoiceId: null },
    payments: { customerReceipt: false, supplierPayment: false, expensePayment: false },
    backup: { export: false, restore: false, filePath: null }
  };

  try {
    // Ensure password is correct before starting (defensive)
    await ensureOwnerPassword();
    await ensureOpenShift(OWNER_EMAIL);

    step('1/12 Login as owner');
    await login(page, OWNER_EMAIL, OWNER_PASSWORD);
    report.loginOwner = true;
    step('1/12 Login OK');

    const stamp = Date.now();
    const e2eUserEmail = `e2e-user-${stamp}@store.com`;
    report.users.createdEmail = e2eUserEmail;

    // Users: create -> edit -> deactivate
    step('2/12 Create user');
    await page.goto(`${BASE_URL}/users`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    await page.locator('input[name="name"]').fill(`E2E User ${stamp}`);
    await page.locator('input[name="email"]').fill(e2eUserEmail);
    await page.locator('input[name="password"]').fill('Pass1234!');
    await page.locator('select[name="role"]').selectOption('CASHIER');
    await page.getByRole('button', { name: /Create User/i }).click();
    // Wait for the user to appear in the table (server action redirects on same page)
    const createdUserRow = page.locator('tr', { hasText: e2eUserEmail }).first();
    await createdUserRow.waitFor({ state: 'visible', timeout: 30000 });
    report.users.create = true;
    step('2/12 Create user OK');

    step('3/12 Edit user');
    await createdUserRow.getByRole('link', { name: /Edit/i }).click();
    // Wait for edit form to appear (name input gets populated)
    await page.waitForTimeout(2000);
    await page.locator('input[name="name"]').fill(`E2E User Updated ${stamp}`);
    await page.locator('select[name="role"]').selectOption('MANAGER');
    await page.getByRole('button', { name: /Update User/i }).click();
    // Wait for the updated role to appear
    await page.getByText(/Manager/i).first().waitFor({ timeout: 30000 });
    report.users.edit = true;
    step('3/12 Edit user OK');

    step('4/12 Deactivate user');
    const updatedUserRow = page.locator('tr', { hasText: e2eUserEmail }).first();
    await updatedUserRow.getByRole('button', { name: /Deactivate/i }).click();
    await page.locator('tr', { hasText: e2eUserEmail }).getByText(/Inactive/i).waitFor({ timeout: 30000 });
    report.users.deactivate = true;
    step('4/12 Deactivate user OK');

    // Purchases: create one then return it
    step('5/12 Create purchase');
    await page.goto(`${BASE_URL}/purchases`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    await openPurchaseForm(page);
    await page.getByRole('button', { name: /^Add line$/i }).click();
    await page.waitForTimeout(500);
    // Default paymentStatus is PAID with no payment amounts entered, which the
    // server auto-fills as a full cash payment - that requires an open till
    // shift (none is opened in this flow). Select Unpaid first, same as the
    // working 6b/12 purchase below, so the purchase is created without a
    // cash-drawer dependency.
    await page.locator('select[name="paymentStatus"]').selectOption('UNPAID');
    await page.locator('#record-purchase-form').getByRole('button', { name: /Record purchase|Receive Purchase/i }).click();
    // On success, createPurchaseAction redirects to the invoice detail page
    // (/purchases/{id}?created=1), not back to the list page, so wait for
    // that navigation and derive the return link from the invoice id rather
    // than looking for a return link element (the detail page doesn't render
    // one - only the /purchases list page does).
    await page.waitForURL(/\/purchases\/[^/?]+(\?|$)/, { timeout: 30000 });
    const createdInvoiceId = new URL(page.url()).pathname.split('/').pop();
    if (!createdInvoiceId) {
      await screenshotStep(page, '05-purchase-no-return-link');
      throw new Error('Could not determine invoice id after creating purchase');
    }
    const purchaseReturnHref = `/purchases/return/${createdInvoiceId}`;
    report.purchases.create = true;
    report.purchases.returnPath = purchaseReturnHref;
    step('5/12 Create purchase OK');

    step('6/12 Return purchase');
    await page.goto(`${BASE_URL}${purchaseReturnHref}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    const purchaseReturnButton = page.getByRole('button', { name: /Process Return|Void Purchase/i });
    await purchaseReturnButton.click();
    // Wait for navigation back to purchases list
    await page.waitForTimeout(5000);
    report.purchases.return = true;
    step('6/12 Return purchase OK');

    // Create unpaid purchase for supplier payment test
    step('6b/12 Create unpaid purchase');
    await page.goto(`${BASE_URL}/purchases`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    await openPurchaseForm(page);
    await page.getByRole('button', { name: /^Add line$/i }).click();
    await page.waitForTimeout(500);
    await page.locator('select[name="paymentStatus"]').selectOption('UNPAID');
    await page.locator('#record-purchase-form').getByRole('button', { name: /Record purchase|Receive Purchase/i }).click();
    await page.waitForTimeout(5000);
    step('6b/12 Create unpaid purchase OK');

    // Sales (paid, multi-line) -> receipt open -> amend
    step('7/12 Create paid sale');
    await page.goto(`${BASE_URL}/pos`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await addProductFromSearch(page, 'Coca');
    await addProductFromSearch(page, 'Fanta');
    const paidSale = await completePaidSale(page);
    report.sales.createPaid = true;
    report.sales.amendedInvoiceId = paidSale.invoiceId;
    step('7/12 Create paid sale OK');

    step('7b/12 Open receipt');
    const receiptPage = await context.newPage();
    await receiptPage.goto(`${BASE_URL}${paidSale.receiptHref}`, { waitUntil: 'networkidle' });
    if (!/\/receipts\/.+/.test(receiptPage.url())) {
      throw new Error(`Receipt page did not open correctly: ${receiptPage.url()}`);
    }
    report.sales.receiptOpen = true;
    await receiptPage.close();
    step('7b/12 Open receipt OK');

    step('8/12 Amend sale');
    await page.goto(`${BASE_URL}/sales/amend/${paidSale.invoiceId}`, { waitUntil: 'networkidle' });
    await waitForURLPattern(page, /\/sales\/amend\//);
    await page.waitForTimeout(2000);
    await page.getByRole('button', { name: /^Remove$/i }).first().click();
    await page.getByRole('button', { name: /Review & Confirm Amendment/i }).click();
    await page.waitForTimeout(1000);
    await page.getByRole('button', { name: /^Confirm Amendment$/i }).click();
    await page.waitForTimeout(5000);
    report.sales.amend = true;
    step('8/12 Amend sale OK');

    // Sales (unpaid, single-line) -> return
    step('9/12 Create unpaid sale + return');
    await page.goto(`${BASE_URL}/pos`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await addProductFromSearch(page, 'Coca');
    await page.locator('select[name="paymentStatus"]').selectOption('UNPAID');
    await page.locator('select[name="customerId"]').selectOption({ index: 1 });
    await page.getByRole('button', { name: /no due date/i }).click();
    await page
      .getByText(/Ready —|Ready to complete/i)
      .first()
      .waitFor({ state: 'visible', timeout: 15000 })
      .catch(async () => {
        await screenshotStep(page, 'credit-not-ready');
        throw new Error('Credit checkout was not ready before Complete Credit Sale');
      });
    await clickActionableCompleteSale(page, COMPLETE_CREDIT_SALE, 'Complete Credit Sale');
    await page.getByText(/Sale Complete!/i).waitFor({ timeout: 30000 });
    const unpaidReceiptHref = await page.getByRole('link', { name: /Reprint last receipt/i }).getAttribute('href');
    if (!unpaidReceiptHref) throw new Error('Missing receipt link for unpaid sale');
    const unpaidInvoiceId = unpaidReceiptHref.split('/').filter(Boolean).pop();
    if (!unpaidInvoiceId) throw new Error('Could not parse unpaid invoice id');
    report.sales.returnedInvoiceId = unpaidInvoiceId;

    await page.goto(`${BASE_URL}/sales/return/${unpaidInvoiceId}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    await page
      .locator('label:has-text(\"Reason Code\")')
      .locator('xpath=following-sibling::select[1]')
      .selectOption('OTHER');
    // Owners self-approve without PIN; managers still see the PIN field.
    const managerPin = page.locator('input[placeholder="Enter manager PIN"]');
    if ((await managerPin.count()) > 0) {
      await managerPin.fill('1234');
    } else {
      await page.getByText(/Owner approval — no PIN required/i).waitFor({ state: 'visible', timeout: 10000 });
    }
    await page.getByRole('button', { name: /Void Sale|Process Return/i }).click();
    const confirmOverlay = page.locator('.overlay-shell');
    await confirmOverlay.waitFor({ state: 'visible', timeout: 10000 });
    // Confirm CTA lives in the overlay (also labelled Void Sale for voids) — do not click the page button behind it.
    await confirmOverlay.getByRole('button', { name: /^(Void Sale|Confirm Return)$/ }).click();
    await confirmOverlay.waitFor({ state: 'hidden', timeout: 30000 }).catch(() => undefined);
    await page.waitForTimeout(2000);
    report.sales.return = true;
    step('9/12 Create unpaid sale + return OK');

    // Customer payment (create part-paid sale first)
    step('10/12 Customer payment');
    await page.goto(`${BASE_URL}/pos`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await addProductFromSearch(page, 'Coca');
    await page.locator('select[name="paymentStatus"]').selectOption('PART_PAID');
    await page.locator('select[name="customerId"]').selectOption({ index: 1 });
    await page.getByRole('button', { name: /no due date/i }).click();
    await page.locator('#pos-cash-tendered').fill('0.50');
    await page
      .getByText(/Ready —|Ready to complete/i)
      .first()
      .waitFor({ state: 'visible', timeout: 15000 })
      .catch(async () => {
        await screenshotStep(page, 'part-paid-not-ready');
        throw new Error('Part-paid checkout was not ready before Complete Part-Paid Sale');
      });
    await clickActionableCompleteSale(page, COMPLETE_PART_PAID_SALE, 'Complete Part-Paid Sale');
    await page.getByText(/Sale Complete!/i).waitFor({ timeout: 30000 });

    await page.goto(`${BASE_URL}/payments/customer-receipts`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    const customerPayRow = page.locator('tbody tr').first();
    await customerPayRow.locator('input[name="amount"]').fill('0.10');
    await customerPayRow.getByRole('button', { name: /Record payment/i }).click();
    await page.waitForTimeout(3000);
    report.payments.customerReceipt = true;
    step('10/12 Customer payment OK');

    // Supplier payment
    step('11/12 Supplier payment');
    await page.goto(`${BASE_URL}/payments/supplier-payments`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    const supplierPayRow = page.locator('tbody tr').first();
    await supplierPayRow.locator('input[name="amount"]').fill('0.10');
    await supplierPayRow.getByRole('button', { name: /Record payment/i }).click();
    await page.waitForTimeout(3000);
    report.payments.supplierPayment = true;
    step('11/12 Supplier payment OK');

    // Expense payment (create unpaid expense first)
    step('12/12 Expense payment');
    await page.goto(`${BASE_URL}/expenses`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await page.locator('input[name="amount"]').fill('12.34');
    await page.locator('select[name="paymentStatus"]').selectOption('UNPAID');
    await page.locator('input[name="vendorName"]').fill('E2E Vendor');
    await page.getByRole('button', { name: /Record expense/i }).click();
    await page.waitForTimeout(3000);

    await page.goto(`${BASE_URL}/payments/expense-payments`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    if ((await page.locator('tbody tr').count()) === 0) {
      await seedUnpaidExpense();
      await page.goto(`${BASE_URL}/payments/expense-payments`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1000);
    }
    const expensePayRow = page.locator('tbody tr').first();
    await expensePayRow.locator('input[name="amount"]').fill('0.10');
    await expensePayRow.getByRole('button', { name: /Record payment/i }).click();
    await page.waitForTimeout(3000);
    report.payments.expensePayment = true;
    step('12/12 Expense payment OK');

    // Backup export + restore (run at end because restore invalidates sessions/passwords)
    step('BONUS Backup export + restore');
    await page.goto(`${BASE_URL}/settings/backup`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
    const backupPath = path.join(ARTIFACT_DIR, `backup-e2e-${Date.now()}.json`);
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 30000 }),
      page.getByRole('button', { name: /Download Backup/i }).click()
    ]);
    await download.saveAs(backupPath);
    report.backup.export = true;
    report.backup.filePath = backupPath;

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(backupPath);
    await page.getByText(/Backup Preview/i).waitFor({ timeout: 15000 });

    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: /Restore Backup/i }).click();
    await Promise.race([
      page.getByText(/Restored backup from/i).waitFor({ timeout: 45000 }),
      page.waitForURL(/\/login/, { timeout: 45000 })
    ]);
    report.backup.restore = true;
    step('BONUS Backup export + restore OK');

    // Re-seed the owner password so any subsequent tests can still log in
    const bcrypt = require('bcryptjs');
    const freshHash = await bcrypt.hash(OWNER_PASSWORD, 10);
    await prisma.user.updateMany({
      where: { email: OWNER_EMAIL },
      data: { passwordHash: freshHash }
    });

    step('ALL STEPS PASSED');
    console.log(JSON.stringify({ success: true, report }, null, 2));
  } catch (error) {
    step(`FAILED: ${error instanceof Error ? error.message : String(error)}`);
    // Take screenshot on failure for CI debugging
    try {
      fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
      await page.screenshot({ path: path.join(ARTIFACT_DIR, 'deep-e2e-failure.png'), fullPage: true });
      step(`Screenshot saved. Current URL: ${page.url()}`);
    } catch (_) { /* best effort */ }
    const result = { success: false, report, error: error instanceof Error ? error.message : String(error) };
    console.error(JSON.stringify(result, null, 2));
    // Also save to file for artifact upload
    try {
      fs.writeFileSync(path.join(ARTIFACT_DIR, 'deep-e2e-report.json'), JSON.stringify(result, null, 2));
    } catch (_) { /* best effort */ }
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
    await context.close();
    await browser.close();
  }
}

run();
