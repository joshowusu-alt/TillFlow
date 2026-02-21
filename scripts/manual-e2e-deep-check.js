const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { PrismaClient } = require('@prisma/client');

const BASE_URL = process.env.BASE_URL || 'http://localhost:6200';
const OWNER_EMAIL = process.env.E2E_OWNER_EMAIL || 'owner@store.com';
const OWNER_PASSWORD = process.env.E2E_OWNER_PASSWORD || 'Pass1234!';
const ARTIFACT_DIR = path.join(process.cwd(), '.playwright-mcp');
const prisma = new PrismaClient();

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

async function login(page, email, password) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
  // Wait for hydration before interacting with the form
  await page.waitForTimeout(5000);
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

async function addProductFromSearch(page, query) {
  const searchInput = page.getByPlaceholder(/type product name/i);
  await searchInput.fill(query);
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: new RegExp(query, 'i') }).first().click();

  // Products with multiple units now stage for unit selection.
  // Race between the staging "Add to Cart" button (multi-unit) and the
  // "Exact" qty button (single-unit, product already in cart).
  const addToCartBtn = page.getByRole('button', { name: /Add to Cart/i });
  const exactBtn = page.getByRole('button', { name: /^Exact$/ });
  const outcome = await Promise.race([
    addToCartBtn.waitFor({ state: 'visible', timeout: 5000 }).then(() => 'staged'),
    exactBtn.waitFor({ state: 'visible', timeout: 5000 }).then(() => 'direct'),
  ]).catch(() => 'timeout');

  if (outcome === 'staged') {
    await addToCartBtn.click();
  }
  await page.waitForTimeout(300);
}

async function completePaidSale(page) {
  await page.getByRole('button', { name: /^Exact$/ }).click();
  await page.waitForTimeout(300);
  const completeSaleButton = page.getByRole('button', { name: /Complete Sale/i });
  await completeSaleButton.click();
  await page.getByText(/Sale Complete!/i).waitFor({ timeout: 30000 });
  const receiptHref = await page.getByRole('link', { name: /Reprint last receipt/i }).getAttribute('href');
  if (!receiptHref) throw new Error('Missing receipt link after sale');
  const invoiceId = receiptHref.split('/').filter(Boolean).pop();
  if (!invoiceId) throw new Error('Could not parse invoice id from receipt URL');
  return { receiptHref, invoiceId };
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
  const context = await browser.newContext({ acceptDownloads: true });
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
    await page.getByText(e2eUserEmail).waitFor({ timeout: 30000 });
    report.users.create = true;
    step('2/12 Create user OK');

    step('3/12 Edit user');
    const createdUserRow = page.locator('tr', { hasText: e2eUserEmail }).first();
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
    await page.getByRole('button', { name: /^Add line$/i }).click();
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: /Receive Purchase/i }).click();
    // Wait for the return link to appear (means purchase was created and page re-rendered)
    await page.locator('a[href^="/purchases/return/"]').first().waitFor({ timeout: 30000 });
    const purchaseReturnHref = await page.locator('a[href^="/purchases/return/"]').first().getAttribute('href');
    if (!purchaseReturnHref) {
      await screenshotStep(page, '05-purchase-no-return-link');
      throw new Error('Could not find purchase return link after creating purchase');
    }
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
    await page.getByRole('button', { name: /^Add line$/i }).click();
    await page.waitForTimeout(500);
    await page.locator('select[name="paymentStatus"]').selectOption('UNPAID');
    await page.getByRole('button', { name: /Receive Purchase/i }).click();
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
    await page.goto(`${BASE_URL}/sales`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    const amendRow = page.locator('tr', { hasText: paidSale.invoiceId.slice(0, 8) }).first();
    await amendRow.getByRole('link', { name: /Amend/i }).click();
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
    const unpaidSaleButton = page.getByRole('button', { name: /Complete Sale/i });
    await unpaidSaleButton.click();
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
    await page.locator('input[placeholder=\"Enter manager PIN\"]').fill('1234');
    await page.getByRole('button', { name: /Void Sale|Process Return/i }).click();
    await page.waitForTimeout(1000);
    await page.getByRole('button', { name: /Confirm Return|Void Sale/i }).last().click();
    await page.waitForTimeout(5000);
    report.sales.return = true;
    step('9/12 Create unpaid sale + return OK');

    // Customer payment (create part-paid sale first)
    step('10/12 Customer payment');
    await page.goto(`${BASE_URL}/pos`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await addProductFromSearch(page, 'Coca');
    await page.locator('select[name="paymentStatus"]').selectOption('PART_PAID');
    await page.locator('select[name="customerId"]').selectOption({ index: 1 });
    await page
      .locator('label:has-text("Cash Tendered")')
      .locator('xpath=following-sibling::input[1]')
      .fill('0.50');
    await page.getByRole('button', { name: /Complete Sale/i }).click();
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
