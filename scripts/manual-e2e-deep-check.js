const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { PrismaClient } = require('@prisma/client');

const BASE_URL = process.env.BASE_URL || 'http://localhost:6200';
const OWNER_EMAIL = process.env.E2E_OWNER_EMAIL || 'owner@store.com';
const OWNER_PASSWORD = process.env.E2E_OWNER_PASSWORD || 'Pass1234!';
const ARTIFACT_DIR = path.join(process.cwd(), 'playwright', 'test-results', 'deep-owner-flow');
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

async function fillVisiblePaymentForm(page, amount) {
  const record = page.getByRole('button', { name: /Record payment/i }).first();
  await record.waitFor({ state: 'visible', timeout: 20000 });
  const form = record.locator('xpath=ancestor::form[1]');
  if ((await form.count()) === 0) {
    await record.click();
    const dialogForm = page.locator('form').filter({ has: page.locator('input[name="amount"]') }).last();
    await dialogForm.locator('input[name="amount"]').waitFor({ state: 'visible', timeout: 20000 });
    await dialogForm.locator('input[name="amount"]').fill(amount);
    await dialogForm.getByRole('button', { name: /Record payment/i }).click();
    return;
  }
  await form.locator('input[name="amount"]').fill(amount);
  await record.click();
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
  const readyHint = page.getByText(/✓ Ready —|Ready to complete •/i).first();
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

async function attachPurchaseEvidence(page) {
  await page.locator('#record-purchase-form input[type="file"]').setInputFiles({
    name: 'synthetic-supplier-invoice.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4\nSynthetic CI supplier invoice\n%%EOF'),
  });
  await page.waitForFunction(() => {
    const input = document.querySelector('#record-purchase-form input[name="purchaseDocumentsJson"]');
    return input && JSON.parse(input.value || '[]').length === 1;
  });
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
    await page.locator('select[name="supplierId"]').selectOption({ index: 1 });
    await attachPurchaseEvidence(page);
    await page.locator('#record-purchase-form').getByRole('button', { name: /Record purchase|Receive Purchase/i }).click();
    // On success, createPurchaseAction redirects to the invoice detail page
    // (/purchases/{id}?created=1), not back to the list page, so wait for
    // that navigation and derive the return link from the invoice id rather
    // than looking for a return link element (the detail page doesn't render
    // one - only the /purchases list page does).
    await page.waitForURL(/\/purchases\/[^/?]+(\?|$)/, { timeout: 30000 });
    const createdInvoiceId = new URL(page.url()).pathname.split('/').pop();
    const amountHeaders = page.getByRole('columnheader', { name: /^(Unit Cost|Line Total)$/i });
    await amountHeaders.first().waitFor({ state: 'visible', timeout: 10000 });
    if (await amountHeaders.count() !== 2) throw new Error('Purchase amount headings are missing');
    const alignment = await amountHeaders.evaluateAll(headers => headers.map(header => {
      const index = Array.from(header.parentElement.children).indexOf(header);
      const cell = header.closest('table').querySelector('tbody tr').children[index];
      const headingText = document.createRange(), amountText = document.createRange();
      headingText.selectNodeContents(header); amountText.selectNodeContents(cell);
      return { label: header.textContent, difference: Math.abs(headingText.getBoundingClientRect().right - amountText.getBoundingClientRect().right) };
    }));
    if (alignment.some(column => column.difference > 2)) throw new Error(`Purchase column alignment: ${JSON.stringify(alignment)}`);
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
    await page.locator('select[name="supplierId"]').selectOption({ index: 1 });
    await attachPurchaseEvidence(page);
    await page.locator('#record-purchase-form').getByRole('button', { name: /Record purchase|Receive Purchase/i }).click();
    await page.waitForURL(/\/purchases\/[^/?]+(\?|$)/, { timeout: 30000 });
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
      .getByText(/✓ Ready —|Ready to complete •/i)
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
      .getByText(/✓ Ready —|Ready to complete •/i)
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
    await fillVisiblePaymentForm(page, '0.10');
    await page.waitForTimeout(3000);
    report.payments.customerReceipt = true;
    step('10/12 Customer payment OK');

    // Supplier payment
    step('11/12 Supplier payment');
    await page.goto(`${BASE_URL}/payments/supplier-payments`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await fillVisiblePaymentForm(page, '0.10');
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
    await fillVisiblePaymentForm(page, '0.10');
    await page.waitForTimeout(3000);
    report.payments.expensePayment = true;
    step('12/12 Expense payment OK');

    step('BONUS Income Statement supporting records');
    const reportOwner = await prisma.user.findUnique({ where: { email: OWNER_EMAIL }, select: { businessId: true } });
    const originalPlan = await prisma.business.findUniqueOrThrow({ where: { id: reportOwner.businessId }, select: { plan: true, selectedPlan: true } });
    // CI seeds Starter. This Growth report needs an entitled synthetic fixture;
    // never change a hosted business or relax the application's report policy.
    const needsReportFixture = originalPlan.plan === 'STARTER';
    if (!['localhost', '127.0.0.1'].includes(new URL(BASE_URL).hostname) || !String(process.env.DATABASE_URL).startsWith('file:')) {
      throw new Error('Report and label fixtures require a local SQLite test business.');
    }
    if (needsReportFixture) await prisma.business.update({ where: { id: reportOwner.businessId }, data: { plan: 'GROWTH', selectedPlan: 'GROWTH' } });
    try {
    await page.goto(`${BASE_URL}/reports/income-statement`, { waitUntil: 'networkidle' });
    const revenueRecords = page.getByRole('link', { name: /^View Revenue supporting records:/ }).first();
    await revenueRecords.waitFor({ state: 'visible' });
    const detailUrl = new URL(await revenueRecords.getAttribute('href'), BASE_URL);
    await revenueRecords.click();
    await page.waitForURL(url => url.pathname === '/reports/income-statement/entries' && url.searchParams.get('metric') === 'revenue');
    await page.getByRole('heading', { name: 'Revenue — supporting records', exact: true }).waitFor();
    await page.locator('a[href^="/sales/"]').first().waitFor({ state: 'visible' });
    await page.getByRole('link', { name: '← Income Statement', exact: true }).click();
    await page.waitForURL(url => url.pathname === '/reports/income-statement' && ['from', 'to'].every(key => url.searchParams.get(key) === detailUrl.searchParams.get(key)));
    step('BONUS Income Statement supporting records OK');
    step('BONUS Classification assignment and analytics');
    await page.goto(`${BASE_URL}/products?tab=categories`, { waitUntil: 'networkidle' });
    await page.getByRole('link', { name: 'Classification', exact: true }).waitFor();
    const classificationSetup = page.getByRole('region', { name: 'Classification setup' });
    const setupCategories = classificationSetup.getByRole('region', { name: 'Categories', exact: true });
    if (await setupCategories.getByRole('list').getByRole('button').count() > 5) throw new Error('Classification initially renders more than five category choices');
    const moreCategories = setupCategories.getByRole('button', { name: /^Show more/ });
    if (await moreCategories.count()) {
      await moreCategories.click();
      await setupCategories.getByRole('button', { name: 'Show fewer', exact: true }).click();
    }
    const classificationCategoryName = `CI catalogue ${stamp}`;
    const divisionName = `CI division ${stamp}`, groupName = `CI group ${stamp}`;
    await classificationSetup.getByRole('button', { name: 'Add category', exact: true }).click();
    await classificationSetup.getByLabel('Category name', { exact: true }).fill(classificationCategoryName);
    await classificationSetup.getByRole('button', { name: 'Save category', exact: true }).click();
    await classificationSetup.getByLabel('Division name', { exact: true }).waitFor();
    const savedCategory = await prisma.category.findFirstOrThrow({ where: { businessId: reportOwner.businessId, name: classificationCategoryName } });
    const classificationCategoryId = savedCategory.id;
    await classificationSetup.getByLabel('Division name', { exact: true }).fill(divisionName);
    await classificationSetup.getByRole('button', { name: 'Save division', exact: true }).click();
    await classificationSetup.getByLabel('Group name', { exact: true }).waitFor();
    const savedDivision = await prisma.productDivision.findFirstOrThrow({ where: { businessId: reportOwner.businessId, categoryId: classificationCategoryId, name: divisionName } });
    const classificationDivisionId = savedDivision.id;
    await classificationSetup.getByLabel('Group name', { exact: true }).fill(groupName);
    await classificationSetup.getByRole('button', { name: 'Save group', exact: true }).click();
    const setupGroupProducts = classificationSetup.getByRole('link', { name: 'View products in this group', exact: true });
    await setupGroupProducts.waitFor();
    const classificationGroup = await prisma.productGroup.findFirstOrThrow({ where: { businessId: reportOwner.businessId, divisionId: classificationDivisionId, name: groupName } });
    const setupPath = new URL(await setupGroupProducts.getAttribute('href'), BASE_URL);
    if (setupPath.searchParams.get('category') !== classificationCategoryId || setupPath.searchParams.get('division') !== classificationDivisionId || setupPath.searchParams.get('group') !== classificationGroup.id) throw new Error('Classification setup product link has incorrect ancestry');
    await classificationSetup.getByRole('searchbox', { name: 'Search categories', exact: true }).fill(classificationCategoryName.toUpperCase());
    await classificationSetup.getByRole('searchbox', { name: 'Search divisions', exact: true }).fill(divisionName);
    await classificationSetup.getByRole('searchbox', { name: 'Search groups', exact: true }).fill(groupName);
    for (const label of ['Categories', 'Divisions', 'Groups']) {
      if (await classificationSetup.getByRole('list', { name: `${label} choices`, exact: true }).getByRole('button').count() !== 1) throw new Error(`Classification ${label} search did not narrow to the saved entry`);
    }
    const setupGroups = classificationSetup.getByRole('region', { name: 'Groups', exact: true });
    await setupGroups.getByRole('searchbox').fill('no matching CI group');
    await setupGroups.getByText(/No matching groups/).waitFor();
    if (await setupGroupProducts.getAttribute('href') !== `${setupPath.pathname}${setupPath.search}`) throw new Error('Searching cleared the selected classification');
    await setupGroups.getByRole('button', { name: 'Clear search', exact: true }).click();
    for (const width of [320, 390, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error(`Classification setup overflows at ${width}px`);
      await screenshotStep(page, `classification-setup-${width}`);
    }
    step('BONUS Classification setup three-level creation and parent links OK');
    const classifiedSale = await prisma.salesInvoice.findFirstOrThrow({ where: { businessId: reportOwner.businessId, paymentStatus: 'PAID', lines: { some: {} } }, select: { lines: { take: 1, select: { productId: true } } } });
    const classifiedProduct = await prisma.product.findUniqueOrThrow({ where: { id: classifiedSale.lines[0].productId }, select: { id: true, name: true } });
    // Fictional CI product: exercise generating a missing barcode through the UI.
    await prisma.product.update({ where: { id: classifiedProduct.id }, data: { barcode: null } });
    await page.goto(`${BASE_URL}/products/${classifiedProduct.id}`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Generate', exact: true }).click();
    await page.getByRole('link', { name: 'Barcode saved — print this product’s label' }).waitFor();
    await page.goto(`${BASE_URL}/products/${classifiedProduct.id}`, { waitUntil: 'networkidle' });
    await page.getByRole('link', { name: 'Barcode saved — print this product’s label' }).waitFor();
    await page.getByLabel('Category', { exact: true }).selectOption(classificationCategoryId);
    const productClassification = page.locator('details').filter({ has: page.getByText('Division and group (optional)', { exact: true }) });
    if (!await productClassification.evaluate(element => element.open)) await productClassification.locator('summary').click();
    await page.getByLabel('Division', { exact: true }).selectOption(classificationDivisionId);
    await page.getByLabel('Group', { exact: true }).selectOption(classificationGroup.id);
    await Promise.all([
      page.waitForResponse(response => response.request().method() === 'POST' && response.url().includes(`/products/${classifiedProduct.id}`) && response.status() < 400),
      page.getByRole('button', { name: 'Save changes', exact: true }).click(),
    ]);
    const storedClassification = await prisma.product.findUniqueOrThrow({ where: { id: classifiedProduct.id }, select: { categoryId: true, groupId: true, barcode: true } });
    if (storedClassification.groupId !== classificationGroup.id || storedClassification.categoryId !== classificationCategoryId || !storedClassification.barcode) throw new Error('Product classification/barcode was not saved');
    step('BONUS Cascading catalogue navigation');
    await page.setViewportSize({ width: 390, height: 900 });
    const cascadeSearch = encodeURIComponent(classifiedProduct.name);
    await page.goto(`${BASE_URL}/products?q=${cascadeSearch}&page=4`, { waitUntil: 'networkidle' });
    const catalogueNav = page.getByRole('navigation', { name: 'Browse catalogue classification', exact: true });
    await catalogueNav.getByRole('link').filter({ hasText: classificationCategoryName.trim() }).click();
    await page.waitForURL(url => url.searchParams.get('category') === classificationCategoryId && !url.searchParams.has('page'));
    await catalogueNav.getByRole('link').filter({ hasText: divisionName }).click();
    await page.waitForURL(url => url.searchParams.get('division') === classificationDivisionId);
    await catalogueNav.getByRole('link').filter({ hasText: groupName }).click();
    await page.waitForURL(url => url.searchParams.get('group') === classificationGroup.id);
    if (new URL(page.url()).searchParams.get('q') !== classifiedProduct.name) throw new Error('Catalogue hierarchy lost search');
    const catalogueGroupLink = catalogueNav.getByRole('link').filter({ hasText: groupName });
    const expectedCatalogueCount = await prisma.product.count({ where: { businessId: reportOwner.businessId, active: true, categoryId: classificationCategoryId, groupId: classificationGroup.id } });
    const displayedCatalogueCount = Number(await catalogueGroupLink.locator('[aria-label$=" products"]').textContent());
    if (displayedCatalogueCount !== expectedCatalogueCount) throw new Error('Catalogue group count differs from stored products');
    for (const width of [320, 390, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error(`Catalogue hierarchy overflows at ${width}px`);
      await screenshotStep(page, `catalogue-hierarchy-${width}`);
    }
    await catalogueNav.getByRole('link', { name: /^All categories/ }).click();
    await page.waitForURL(url => !url.searchParams.has('category') && !url.searchParams.has('division') && !url.searchParams.has('group'));
    await page.goBack();
    await page.waitForURL(url => url.searchParams.get('group') === classificationGroup.id);
    step('BONUS Cascading catalogue navigation OK');
    await page.goto(`${BASE_URL}/reports/analytics`, { waitUntil: 'networkidle' });
    await page.locator('[data-classification-disclosure] > summary').click();
    const classification = page.locator('#classification-performance');
    await classification.getByRole('button', { name: `${classificationCategoryName} →`, exact: true }).click();
    await classification.getByRole('button', { name: `${divisionName} →`, exact: true }).click();
    await classification.getByRole('button', { name: `${groupName} →`, exact: true }).click();
    await classification.getByRole('link', { name: classifiedProduct.name, exact: true }).waitFor();
    fs.mkdirSync(path.join(process.cwd(), 'tmp', 'ui-programme-evidence'), { recursive: true });
    await page.screenshot({ path: path.join(process.cwd(), 'tmp', 'ui-programme-evidence', 'classification-performance-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)) throw new Error('Classification report overflows the phone viewport');
    await page.screenshot({ path: path.join(process.cwd(), 'tmp', 'ui-programme-evidence', 'classification-performance-mobile.png'), fullPage: true });
    await page.setViewportSize({ width: 1280, height: 720 });
    step('BONUS Classification assignment and analytics OK');
    await context.addInitScript(() => {
      window.__labelPrintRequested = false;
      window.print = () => { window.__labelPrintRequested = true; };
      const nativeOpen = window.open;
      window.open = function (...args) {
        const popup = nativeOpen.apply(window, args);
        if (popup) popup.print = () => { popup.__labelPrintRequested = true; };
        return popup;
      };
    });
    await page.goto(`${BASE_URL}/products/labels?select=${classifiedProduct.id}`, { waitUntil: 'networkidle' });
    await page.getByText('Ready to print', { exact: true }).waitFor();
    const [printPage] = await Promise.all([context.waitForEvent('page'), page.getByRole('button', { name: 'Print Labels', exact: true }).first().click()]);
    await printPage.waitForFunction(name => document.body.textContent.includes(name), classifiedProduct.name);
    await printPage.waitForFunction(() => window.__labelPrintRequested === true);
    const readableValue = printPage.locator('[data-barcode-value]').first();
    await readableValue.waitFor({ state: 'visible' });
    if ((await readableValue.textContent()).trim() !== storedClassification.barcode) throw new Error('Printed readable barcode does not match saved value');
    await printPage.screenshot({ path: path.join(process.cwd(), 'playwright', 'test-results', 'generated-barcode-label.png'), fullPage: true });
    await printPage.close();
    step('BONUS Generated barcode to selected label and print request OK');
    for (const width of [390, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${BASE_URL}/reports/sales-by-supplier`, { waitUntil: 'networkidle' });
      const viewProducts = page.getByRole('link', { name: /^View products for / }).first();
      await viewProducts.waitFor({ state: 'visible' });
      const geometry = await viewProducts.evaluate(el => {
        const box = el.getBoundingClientRect(), shell = el.closest('.responsive-table-shell').getBoundingClientRect();
        const canvas = el.closest('[data-reports-canvas]').getBoundingClientRect();
        const main = document.querySelector('.app-main-shell'), style = getComputedStyle(main);
        return { left: box.left, right: box.right, shellLeft: shell.left, shellRight: shell.right,
          canvasWidth: canvas.width, available: main.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
          pageWidth: document.documentElement.scrollWidth, viewport: window.innerWidth };
      });
      if (geometry.left < geometry.shellLeft - 1 || geometry.right > geometry.shellRight + 1 || geometry.pageWidth > geometry.viewport || Math.abs(geometry.canvasWidth - geometry.available) > 2) {
        throw new Error(`Supplier responsive layout: ${JSON.stringify(geometry)}`);
      }
    }
    await page.setViewportSize({ width: 1280, height: 720 });
    step('BONUS Supplier action and fluid report widths OK');
    step('BONUS Product history and compact supplier account');
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${BASE_URL}/products/${classifiedProduct.id}`, { waitUntil: 'networkidle' });
      await page.getByRole('link', { name: 'View history', exact: true }).click();
      await page.getByRole('heading', { name: 'Product history', exact: true }).waitFor();
      const history = page.locator('[data-product-history-store]');
      const historyStoreId = await history.getAttribute('data-product-history-store');
      const [balance, recorded] = await Promise.all([
        prisma.inventoryBalance.findUnique({ where: { storeId_productId: { storeId: historyStoreId, productId: classifiedProduct.id } } }),
        prisma.stockMovement.aggregate({ where: { productId: classifiedProduct.id, storeId: historyStoreId }, _sum: { qtyBase: true } }),
      ]);
      if (Number(await history.getAttribute('data-history-current-quantity')) !== (balance?.qtyOnHandBase ?? 0)) throw new Error('Product history current quantity differs from stored balance');
      if (Number(await history.getAttribute('data-history-recorded-quantity')) !== (recorded._sum.qtyBase ?? 0)) throw new Error('Product history movement quantity differs from stored movements');
      await page.locator('#supplier-costs summary').click();
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error('Product history overflows viewport');
      await screenshotStep(page, `product-history-${width}`);
    }
    const historySupplier = await prisma.supplier.findFirstOrThrow({ where: { businessId: reportOwner.businessId }, select: { id: true } });
    await page.goto(`${BASE_URL}/suppliers/${historySupplier.id}`, { waitUntil: 'networkidle' });
    for (const id of ['purchase-history', 'supplier-statement', 'products-supplied']) {
      if (await page.locator(`#${id}`).evaluate(el => el.open)) throw new Error(`Supplier ${id} starts expanded`);
    }
    await screenshotStep(page, 'supplier-account-collapsed');
    await page.locator('#purchase-history summary').click();
    await page.locator('#purchase-history form button').filter({ hasText: 'Filter' }).click();
    await page.waitForURL(url => url.searchParams.get('historyPage') === '1');
    if (!await page.locator('#purchase-history').evaluate(el => el.open)) throw new Error('Supplier history closes after filtering');
    await page.getByRole('link', { name: /View linked products|Link products/, exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#products-supplied').open);
    await screenshotStep(page, 'supplier-account-expanded');
    step('BONUS Product history and compact supplier account OK');
    step('BONUS Bulk pricing preview, stale guard and audited apply');
    async function confirmBulkPriceUpdate() {
      await page.getByRole('button', { name: 'Confirm price update', exact: true }).click();
      // An earlier alert may remain briefly during a server-action response.
      // Finish this mutation before inspecting the DB or removing a failure trigger.
      await page.locator('[data-bulk-pricing][aria-busy="false"]').waitFor();
    }
    // Isolated local fixtures only; this block shares the localhost/SQLite guard above.
    const bulkBaseUnit = await prisma.unit.create({ data: { name: `CI copy ${stamp}`, pluralName: 'copies' } });
    const bulkPackUnit = await prisma.unit.create({ data: { name: `CI pack ${stamp}`, pluralName: 'packs' } });
    const bulkInheritedUnit = await prisma.unit.create({ data: { name: `CI pair ${stamp}`, pluralName: 'pairs' } });
    const bulkName = `CI pricing ${stamp}`;
    const bulkProducts = [];
    for (const suffix of ['A', 'B']) bulkProducts.push(await prisma.product.create({ data: {
      businessId: reportOwner.businessId, name: `${bulkName} ${suffix}`, categoryId: classificationCategoryId, groupId: classificationGroup.id,
      sellingPriceBasePence: 1000, defaultCostBasePence: 600,
      productUnits: { create: [
        { unitId: bulkBaseUnit.id, conversionToBase: 1, isBaseUnit: true, sellingPricePence: 1000 },
        { unitId: bulkPackUnit.id, conversionToBase: 3, sellingPricePence: 2700 },
        { unitId: bulkInheritedUnit.id, conversionToBase: 2 },
      ] },
    } }));
    await page.goto(`${BASE_URL}/products/bulk-pricing`, { waitUntil: 'networkidle' });
    await page.getByRole('combobox', { name: 'Category', exact: true }).selectOption(classificationCategoryId);
    await page.getByRole('combobox', { name: 'Division', exact: true }).selectOption(classificationDivisionId);
    await page.getByRole('combobox', { name: 'Group', exact: true }).selectOption(classificationGroup.id);
    await page.getByRole('textbox', { name: 'Search', exact: true }).fill(bulkName);
    await page.getByRole('spinbutton', { name: 'Percentage (%)', exact: true }).fill('20');
    await page.getByRole('button', { name: 'Preview prices', exact: true }).click();
    await page.getByText(`${bulkName} A`, { exact: true }).waitFor();
    for (const width of [320, 390, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error(`Bulk pricing overflows at ${width}px`);
      await screenshotStep(page, `bulk-pricing-preview-${width}`);
    }
    // An edit after review must reject the whole selected batch, including the unchanged first product.
    await prisma.product.update({ where: { id: bulkProducts[1].id }, data: { defaultCostBasePence: 650 } });
    await page.getByRole('textbox', { name: 'Reason for change', exact: true }).fill('CI stale preview check');
    await page.getByRole('button', { name: 'Review update for 2 products', exact: true }).click();
    await confirmBulkPriceUpdate();
    await page.getByRole('alert').filter({ hasText: 'Products changed since this preview' }).waitFor();
    const untouched = await prisma.product.findMany({ where: { id: { in: bulkProducts.map(p => p.id) } } });
    if (untouched.some(p => p.sellingPriceBasePence !== 1000)) throw new Error('Stale pricing batch partially applied');
    // Force the second write to fail in the isolated CI database: first write and audit must roll back.
    const blockedProductId = bulkProducts[1].id;
    if (!/^[a-z0-9]+$/.test(blockedProductId)) throw new Error('Unexpected CI product ID');
    await prisma.$executeRawUnsafe(`CREATE TRIGGER "ci_bulk_price_rollback" BEFORE UPDATE OF "sellingPriceBasePence" ON "Product" WHEN NEW."id" = '${blockedProductId}' AND NEW."sellingPriceBasePence" <> OLD."sellingPriceBasePence" BEGIN SELECT RAISE(ABORT, 'CI forced bulk failure'); END`);
    try {
      await page.getByRole('button', { name: 'Preview prices', exact: true }).click();
      await page.getByText(`${bulkName} A`, { exact: true }).waitFor();
      await page.getByRole('textbox', { name: 'Reason for change', exact: true }).fill('CI rollback check');
      await page.getByRole('button', { name: 'Review update for 2 products', exact: true }).click();
      await confirmBulkPriceUpdate();
      await page.locator('[data-bulk-pricing-error]').waitFor();
      const rolledBack = await prisma.product.findMany({ where: { id: { in: bulkProducts.map(p => p.id) } }, include: { productUnits: true } });
      if (rolledBack.some(p => p.sellingPriceBasePence !== 1000 || p.productUnits.find(u => u.unitId === bulkBaseUnit.id).sellingPricePence !== 1000)) throw new Error('Failed bulk batch did not roll back all prices');
      if (await prisma.auditLog.count({ where: { businessId: reportOwner.businessId, action: 'PRICE_CHANGE', entityId: { in: bulkProducts.map(p => p.id) } } })) throw new Error('Failed bulk batch left successful audit entries');
    } finally {
      await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS "ci_bulk_price_rollback"');
    }
    await page.getByRole('button', { name: 'Preview prices', exact: true }).click();
    await page.getByText(`${bulkName} A`, { exact: true }).waitFor();
    await page.getByRole('textbox', { name: 'Reason for change', exact: true }).fill('CI reviewed supplier increase');
    await page.getByRole('button', { name: 'Review update for 2 products', exact: true }).click();
    await confirmBulkPriceUpdate();
    const bulkUpdated = await prisma.product.findMany({ where: { id: { in: bulkProducts.map(p => p.id) } }, include: { productUnits: true } });
    for (const p of bulkUpdated) {
      if (p.sellingPriceBasePence !== 1200 || p.productUnits.find(u => u.unitId === bulkBaseUnit.id).sellingPricePence !== 1200 || p.productUnits.find(u => u.unitId === bulkPackUnit.id).sellingPricePence !== 2700 || p.productUnits.find(u => u.unitId === bulkInheritedUnit.id).sellingPricePence !== null) throw new Error('Bulk base/pack pricing is inconsistent');
    }
    const priceAudits = await prisma.auditLog.findMany({ where: { businessId: reportOwner.businessId, action: 'PRICE_CHANGE', entityId: { in: bulkProducts.map(p => p.id) } } });
    if (priceAudits.length !== 2 || priceAudits.some(a => a.reason !== 'CI reviewed supplier increase' || JSON.parse(a.beforeState).sellingPriceBasePence !== 1000 || JSON.parse(a.afterState).sellingPriceBasePence !== 1200)) throw new Error('Bulk price audit is missing before/after evidence');
    step('BONUS Bulk pricing database prices and audit OK');
    const savedBatchId = JSON.parse(priceAudits[0].details).batchId;
    await page.waitForURL(url => url.searchParams.get('batch') === savedBatchId);
    await page.getByRole('status').filter({ hasText: 'Updated 2 products' }).waitFor();
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByRole('status').filter({ hasText: 'Updated 2 products' }).waitFor();
    await page.getByRole('status').filter({ hasText: 'CI reviewed supplier increase' }).waitFor();
    step('BONUS Bulk pricing preview, stale guard and audited apply OK');
    } finally {
      if (needsReportFixture) await prisma.business.update({ where: { id: reportOwner.businessId }, data: originalPlan });
    }

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
    if (['localhost', '127.0.0.1'].includes(new URL(BASE_URL).hostname)) step(`Failure surface: ${(await page.locator('body').innerText().catch(() => 'unavailable')).slice(-6000)}`);
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
