const { chromium } = require('playwright');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const { randomBytes } = require('crypto');

const RAW_BASE_URL = process.env.BASE_URL || 'http://localhost:6200';
const BASE_URL = (() => {
  try {
    const url = new URL(RAW_BASE_URL);
    if (url.hostname === '127.0.0.1' || url.hostname === '0.0.0.0') {
      url.hostname = 'localhost';
    }
    return url.toString().replace(/\/$/, '');
  } catch {
    return RAW_BASE_URL;
  }
})();
const CASHIER_EMAIL = process.env.E2E_CASHIER_EMAIL || 'cashier@store.com';
const CASHIER_PASSWORD = process.env.E2E_CASHIER_PASSWORD || 'Pass1234!';
const OWNER_EMAIL = process.env.E2E_OWNER_EMAIL || 'owner@store.com';
const OWNER_PASSWORD = process.env.E2E_OWNER_PASSWORD || 'Pass1234!';
const ACTIVE_BUSINESS_COOKIE = 'pos_active_business';
const SESSION_COOKIE_PREFIX = 'pos_session_';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const prisma = new PrismaClient();

async function ensureUserPassword(email, password) {
  try {
    const hash = await bcrypt.hash(password, 10);
    await prisma.user.updateMany({
      where: { email },
      data: { passwordHash: hash },
    });
  } catch {
    // best effort
  }
}

async function seedSellableProductIfNeeded() {
  const business = await prisma.business.findFirst({ select: { id: true } });
  if (!business) return;

  const store = await prisma.store.findFirst({
    where: { businessId: business.id },
    select: { id: true },
  });
  if (!store) return;

  const product = await prisma.product.findFirst({
    where: { businessId: business.id, active: true },
    select: { id: true, defaultCostBasePence: true },
    orderBy: { createdAt: 'asc' },
  });
  if (!product) return;

  const existing = await prisma.inventoryBalance.findUnique({
    where: { storeId_productId: { storeId: store.id, productId: product.id } },
    select: { qtyOnHandBase: true, avgCostBasePence: true },
  });

  if ((existing?.qtyOnHandBase ?? 0) > 0) return;

  await prisma.inventoryBalance.upsert({
    where: { storeId_productId: { storeId: store.id, productId: product.id } },
    update: {
      qtyOnHandBase: 20,
      avgCostBasePence: existing?.avgCostBasePence ?? product.defaultCostBasePence ?? 100,
    },
    create: {
      storeId: store.id,
      productId: product.id,
      qtyOnHandBase: 20,
      avgCostBasePence: product.defaultCostBasePence ?? 100,
    },
  });
}

function attachConsoleTracker(page, key, report) {
  const messages = [];
  page.on('console', (message) => {
    const entry = {
      type: message.type(),
      text: message.text(),
      location: message.location(),
    };
    messages.push(entry);
  });
  report.console[key] = messages;
  return messages;
}

function assertNoConsoleProblems(messages, routeLabel) {
  const noisyMessages = messages.filter((entry) => entry.type === 'error' || entry.type === 'warning');
  if (noisyMessages.length > 0) {
    const formatted = noisyMessages
      .map((entry) => `${entry.type}: ${entry.text}`)
      .slice(0, 5)
      .join(' | ');
    throw new Error(`${routeLabel} emitted console problems: ${formatted}`);
  }
}

async function establishSession(context) {
  const probePage = await context.newPage();
  const browserUserAgent = await probePage.evaluate(() => navigator.userAgent);
  await probePage.close();

  const candidates = [
    { label: 'cashier', email: CASHIER_EMAIL, password: CASHIER_PASSWORD },
    { label: 'owner', email: OWNER_EMAIL, password: OWNER_PASSWORD },
  ];

  for (const candidate of candidates) {
    const user = await prisma.user.findUnique({
      where: { email: candidate.email.toLowerCase() },
      select: {
        id: true,
        businessId: true,
        active: true,
      },
    });

    if (!user || !user.active) {
      continue;
    }

    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    await prisma.session.create({
      data: {
        token,
        userId: user.id,
        ipAddress: '127.0.0.1',
        userAgent: browserUserAgent,
        expiresAt,
      },
    });

    await context.addCookies([
      {
        name: `${SESSION_COOKIE_PREFIX}${user.businessId}`,
        value: token,
        url: BASE_URL,
        expires: Math.floor(expiresAt.getTime() / 1000),
        sameSite: 'Lax',
      },
      {
        name: ACTIVE_BUSINESS_COOKIE,
        value: user.businessId,
        url: BASE_URL,
        expires: Math.floor(expiresAt.getTime() / 1000),
        sameSite: 'Lax',
      },
    ]);

    return { label: candidate.label, businessId: user.businessId };
  }

  throw new Error('Unable to establish an authenticated session with cashier or owner credentials.');
}

async function chooseSellableProduct(businessId) {
  const baseWhere = {
    businessId,
    active: true,
    inventoryBalances: { some: { qtyOnHandBase: { gt: 0 } } },
    productUnits: { some: {} },
  };

  const preferredTerms = ['Coca', 'Fanta', 'Milk'];

  for (const term of preferredTerms) {
    const preferredProduct = await prisma.product.findFirst({
      where: {
        ...baseWhere,
        name: { contains: term },
      },
      select: { name: true },
      orderBy: { createdAt: 'asc' },
    });

    if (preferredProduct?.name) {
      return preferredProduct.name;
    }
  }

  let product = await prisma.product.findFirst({
    where: baseWhere,
    select: { name: true },
    orderBy: { createdAt: 'asc' },
  });

  if (!product) {
    await seedSellableProductIfNeeded();
    product = await prisma.product.findFirst({
      where: baseWhere,
      select: { name: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  if (!product?.name) {
    throw new Error('Could not find a sellable stocked product for the POS smoke run');
  }

  return product.name;
}

async function addProductToCart(page, productName) {
  const productSearch = page.getByPlaceholder(/type product name/i);
  await productSearch.waitFor({ state: 'visible', timeout: 60000 });
  await productSearch.click();
  await productSearch.fill(String(productName).slice(0, 8) || 'a');

  const productButton = page.locator('button', { hasText: productName });
  await productButton.first().waitFor({ state: 'visible', timeout: 10000 });
  await productButton.first().click();

  const addToCartButton = page.getByRole('button', { name: /Add to Cart/i });
  const exactButton = page.getByRole('button', { name: /^Exact$/ });
  const outcome = await Promise.race([
    addToCartButton.waitFor({ state: 'visible', timeout: 5000 }).then(() => 'staged'),
    exactButton.waitFor({ state: 'visible', timeout: 5000 }).then(() => 'direct'),
  ]).catch(() => 'timeout');

  if (outcome === 'staged') {
    await addToCartButton.click();
  }

  await exactButton.waitFor({ state: 'visible', timeout: 5000 });
}

async function fundSaleWithCash(page, amount) {
  const cashInput = page
    .locator('label:has-text("Cash Tendered")')
    .locator('xpath=following-sibling::input[1]');
  await cashInput.waitFor({ state: 'visible', timeout: 10000 });
  await cashInput.fill(String(amount));

  await page.getByText(/ready to complete|payment and till checks are clear/i).first().waitFor({
    state: 'visible',
    timeout: 15000,
  });
}

async function completeSale(page) {
  const completeSaleButton = page.getByRole('button', { name: /Complete Sale/i }).first();
  await completeSaleButton.waitFor({ state: 'visible', timeout: 15000 });
  await completeSaleButton.click();
  await page.getByText(/Sale Complete!/i).waitFor({ timeout: 20000 });

  const popupPromise = page.context().waitForEvent('page', { timeout: 15000 });
  await page.getByRole('button', { name: /Print Receipt/i }).click();
  const receiptPage = await popupPromise;
  await receiptPage.waitForLoadState('networkidle');
  const receiptUrl = receiptPage.url();
  await receiptPage.close();

  if (!/\/receipts\//.test(receiptUrl)) {
    throw new Error(`Receipt popup did not open a receipt URL: ${receiptUrl}`);
  }

  return new URL(receiptUrl).pathname;
}

async function run() {
  const report = {
    welcome: false,
    demoPos: false,
    login: false,
    loginRole: null,
    pos: false,
    sale: false,
    receipt: false,
    console: {
      welcome: [],
      demoPos: [],
      pos: [],
      receipt: [],
    },
  };

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    extraHTTPHeaders: {
      origin: BASE_URL,
    },
  });

  try {
    await ensureUserPassword(CASHIER_EMAIL, CASHIER_PASSWORD);
    await ensureUserPassword(OWNER_EMAIL, OWNER_PASSWORD);

    const welcomePage = await context.newPage();
    const welcomeMessages = attachConsoleTracker(welcomePage, 'welcome', report);
    await welcomePage.goto(`${BASE_URL}/welcome`, { waitUntil: 'networkidle' });
    await welcomePage.getByText(/TillFlow/i).first().waitFor({ timeout: 15000 });
    assertNoConsoleProblems(welcomeMessages, '/welcome');
    report.welcome = true;
    await welcomePage.close();

    const demoPage = await context.newPage();
    const demoMessages = attachConsoleTracker(demoPage, 'demoPos', report);
    await demoPage.goto(`${BASE_URL}/demo/pos`, { waitUntil: 'networkidle' });
    await demoPage.getByText(/demo/i).first().waitFor({ timeout: 15000 });
    assertNoConsoleProblems(demoMessages, '/demo/pos');
    report.demoPos = true;
    await demoPage.close();

    const posPage = await context.newPage();
    const posMessages = attachConsoleTracker(posPage, 'pos', report);
    const session = await establishSession(context);
    report.loginRole = session.label;
    report.login = true;

    await posPage.goto(`${BASE_URL}/pos`, { waitUntil: 'networkidle' });
    await Promise.race([
      posPage.getByPlaceholder(/type product name/i).waitFor({ state: 'visible', timeout: 60000 }),
      posPage.getByPlaceholder(/scan barcode/i).waitFor({ state: 'visible', timeout: 60000 }),
    ]);
    const saleProductName = await chooseSellableProduct(session.businessId);
    await addProductToCart(posPage, saleProductName);
    await fundSaleWithCash(posPage, 100);
    const receiptPath = await completeSale(posPage);
    assertNoConsoleProblems(posMessages, '/pos');
    report.pos = true;
    report.sale = true;

    const receiptPage = await context.newPage();
    const receiptMessages = attachConsoleTracker(receiptPage, 'receipt', report);
    await receiptPage.goto(`${BASE_URL}${receiptPath}`, { waitUntil: 'networkidle' });
    if (!/\/receipts\//.test(receiptPage.url())) {
      throw new Error(`Unexpected receipt URL: ${receiptPage.url()}`);
    }
    assertNoConsoleProblems(receiptMessages, receiptPage.url());
    report.receipt = true;
    await receiptPage.close();

    console.log(JSON.stringify({ success: true, report }, null, 2));
  } catch (error) {
    console.error(
      JSON.stringify(
        {
          success: false,
          report,
          error: error instanceof Error ? error.message : String(error),
        },
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
