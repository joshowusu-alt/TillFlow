const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { PrismaClient } = require('@prisma/client');

const BASE_URL = process.env.BASE_URL || 'http://localhost:6200';
const OWNER_EMAIL = process.env.E2E_OWNER_EMAIL || 'owner@store.com';
const OWNER_PASSWORD = process.env.E2E_OWNER_PASSWORD || 'Pass1234!';
const prisma = new PrismaClient();

async function login(page, email, password) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await Promise.race([
    page.waitForURL(/\/pos/, { timeout: 30000 }),
    page.waitForURL(/\/onboarding/, { timeout: 30000 })
  ]);
  if (/\/onboarding/.test(page.url())) {
    await page.goto(`${BASE_URL}/pos`, { waitUntil: 'networkidle' });
  }
}

async function addProductFromSearch(page, query) {
  const searchInput = page.getByPlaceholder(/type product name/i);
  await searchInput.fill(query);
  await page.getByRole('button', { name: new RegExp(query, 'i') }).first().click();
}

async function completePaidSale(page) {
  await page.getByRole('button', { name: /^Exact$/ }).click();
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
    await login(page, OWNER_EMAIL, OWNER_PASSWORD);
    report.loginOwner = true;

    const stamp = Date.now();
    const e2eUserEmail = `e2e-user-${stamp}@store.com`;
    report.users.createdEmail = e2eUserEmail;

    // Users: create -> edit -> deactivate
    await page.goto(`${BASE_URL}/users`, { waitUntil: 'networkidle' });
    await page.locator('input[name="name"]').fill(`E2E User ${stamp}`);
    await page.locator('input[name="email"]').fill(e2eUserEmail);
    await page.locator('input[name="password"]').fill('Pass1234!');
    await page.locator('select[name="role"]').selectOption('CASHIER');
    await page.getByRole('button', { name: /Create User/i }).click();
    await page.waitForURL(/\/users\?success=created/, { timeout: 30000 });
    await page.getByText(e2eUserEmail).waitFor({ timeout: 15000 });
    report.users.create = true;

    const createdUserRow = page.locator('tr', { hasText: e2eUserEmail }).first();
    await createdUserRow.getByRole('link', { name: /Edit/i }).click();
    await page.waitForURL(/\/users\?edit=/, { timeout: 15000 });
    await page.locator('input[name="name"]').fill(`E2E User Updated ${stamp}`);
    await page.locator('select[name="role"]').selectOption('MANAGER');
    await page.getByRole('button', { name: /Update User/i }).click();
    await page.waitForURL(/\/users\?success=updated/, { timeout: 30000 });
    report.users.edit = true;

    const updatedUserRow = page.locator('tr', { hasText: e2eUserEmail }).first();
    await updatedUserRow.getByRole('button', { name: /Deactivate/i }).click();
    await page.waitForURL(/\/users/, { timeout: 30000 });
    await page.locator('tr', { hasText: e2eUserEmail }).getByText(/Inactive/i).waitFor({ timeout: 15000 });
    report.users.deactivate = true;

    // Purchases: create one then return it
    await page.goto(`${BASE_URL}/purchases`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /^Add line$/i }).click();
    await page.getByRole('button', { name: /Receive Purchase/i }).click();
    await page.waitForURL(/\/purchases/, { timeout: 30000 });
    const purchaseReturnHref = await page.locator('a[href^="/purchases/return/"]').first().getAttribute('href');
    if (!purchaseReturnHref) throw new Error('Could not find purchase return link after creating purchase');
    report.purchases.create = true;
    report.purchases.returnPath = purchaseReturnHref;

    await page.goto(`${BASE_URL}${purchaseReturnHref}`, { waitUntil: 'networkidle' });
    const purchaseReturnButton = page.getByRole('button', { name: /Process Return|Void Purchase/i });
    await purchaseReturnButton.click();
    await page.waitForURL(/\/purchases/, { timeout: 30000 });
    report.purchases.return = true;

    // Create unpaid purchase for supplier payment test
    await page.goto(`${BASE_URL}/purchases`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /^Add line$/i }).click();
    await page.locator('select[name="paymentStatus"]').selectOption('UNPAID');
    await page.getByRole('button', { name: /Receive Purchase/i }).click();
    await page.waitForURL(/\/purchases/, { timeout: 30000 });

    // Sales (paid, multi-line) -> receipt open -> amend
    await page.goto(`${BASE_URL}/pos`, { waitUntil: 'networkidle' });
    await addProductFromSearch(page, 'Coca');
    await addProductFromSearch(page, 'Fanta');
    const paidSale = await completePaidSale(page);
    report.sales.createPaid = true;
    report.sales.amendedInvoiceId = paidSale.invoiceId;

    const receiptPage = await context.newPage();
    await receiptPage.goto(`${BASE_URL}${paidSale.receiptHref}`, { waitUntil: 'networkidle' });
    if (!/\/receipts\/.+/.test(receiptPage.url())) {
      throw new Error(`Receipt page did not open correctly: ${receiptPage.url()}`);
    }
    report.sales.receiptOpen = true;
    await receiptPage.close();

    await page.goto(`${BASE_URL}/sales`, { waitUntil: 'networkidle' });
    const amendRow = page.locator('tr', { hasText: paidSale.invoiceId.slice(0, 8) }).first();
    await amendRow.getByRole('link', { name: /Amend/i }).click();
    await page.waitForURL(/\/sales\/amend\//, { timeout: 30000 });
    await page.getByRole('button', { name: /^Remove$/i }).first().click();
    await page.getByRole('button', { name: /Review & Confirm Amendment/i }).click();
    await page.getByRole('button', { name: /^Confirm Amendment$/i }).click();
    await page.waitForURL(/\/sales/, { timeout: 30000 });
    report.sales.amend = true;

    // Sales (unpaid, single-line) -> return
    await page.goto(`${BASE_URL}/pos`, { waitUntil: 'networkidle' });
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
    await page.getByRole('button', { name: /Void Sale|Process Return/i }).click();
    await page.getByRole('button', { name: /Confirm Return|Void Sale/i }).last().click();
    await page.waitForURL(/\/sales/, { timeout: 30000 });
    report.sales.return = true;

    // Customer payment (create part-paid sale first)
    await page.goto(`${BASE_URL}/pos`, { waitUntil: 'networkidle' });
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
    const customerPayRow = page.locator('tbody tr').first();
    await customerPayRow.locator('input[name="amount"]').fill('0.10');
    await customerPayRow.getByRole('button', { name: /Record payment/i }).click();
    await page.waitForURL(/\/payments\/customer-receipts/, { timeout: 30000 });
    report.payments.customerReceipt = true;

    // Supplier payment
    await page.goto(`${BASE_URL}/payments/supplier-payments`, { waitUntil: 'networkidle' });
    const supplierPayRow = page.locator('tbody tr').first();
    await supplierPayRow.locator('input[name="amount"]').fill('0.10');
    await supplierPayRow.getByRole('button', { name: /Record payment/i }).click();
    await page.waitForURL(/\/payments\/supplier-payments/, { timeout: 30000 });
    report.payments.supplierPayment = true;

    // Expense payment (create unpaid expense first)
    await page.goto(`${BASE_URL}/expenses`, { waitUntil: 'networkidle' });
    await page.locator('input[name="amount"]').fill('12.34');
    await page.locator('select[name="paymentStatus"]').selectOption('UNPAID');
    await page.locator('input[name="vendorName"]').fill('E2E Vendor');
    await page.getByRole('button', { name: /Record expense/i }).click();
    await page.waitForURL(/\/expenses/, { timeout: 30000 });

    await page.goto(`${BASE_URL}/payments/expense-payments`, { waitUntil: 'networkidle' });
    if ((await page.locator('tbody tr').count()) === 0) {
      await seedUnpaidExpense();
      await page.goto(`${BASE_URL}/payments/expense-payments`, { waitUntil: 'networkidle' });
    }
    const expensePayRow = page.locator('tbody tr').first();
    await expensePayRow.locator('input[name="amount"]').fill('0.10');
    await expensePayRow.getByRole('button', { name: /Record payment/i }).click();
    await page.waitForURL(/\/payments\/expense-payments/, { timeout: 30000 });
    report.payments.expensePayment = true;

    // Backup export + restore (run at end because restore invalidates sessions/passwords)
    await page.goto(`${BASE_URL}/settings/backup`, { waitUntil: 'networkidle' });
    const downloadDir = path.join(process.cwd(), '.playwright-mcp');
    fs.mkdirSync(downloadDir, { recursive: true });
    const backupPath = path.join(downloadDir, `backup-e2e-${Date.now()}.json`);
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

    // Re-seed the owner password so any subsequent tests can still log in
    const bcrypt = require('bcryptjs');
    const freshHash = await bcrypt.hash(OWNER_PASSWORD, 10);
    await prisma.user.updateMany({
      where: { email: OWNER_EMAIL },
      data: { passwordHash: freshHash }
    });

    console.log(JSON.stringify({ success: true, report }, null, 2));
  } catch (error) {
    console.error(
      JSON.stringify(
        { success: false, report, error: error instanceof Error ? error.message : String(error) },
        null,
        2
      )
    );
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
    await context.close();
    await browser.close();
  }
}

run();
