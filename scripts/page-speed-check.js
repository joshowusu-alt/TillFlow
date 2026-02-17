const { chromium } = require('playwright');

const BASE_URL = process.env.BASE_URL || 'http://localhost:6200';
const OWNER_EMAIL = process.env.E2E_OWNER_EMAIL || 'owner@store.com';
const OWNER_PASSWORD = process.env.E2E_OWNER_PASSWORD || 'Pass1234!';

const ROUTES = [
  '/pos',
  '/sales',
  '/purchases',
  '/products',
  '/inventory',
  '/inventory/adjustments',
  '/customers',
  '/suppliers',
  '/expenses',
  '/payments/customer-receipts',
  '/payments/supplier-payments',
  '/payments/expense-payments',
  '/reports/dashboard',
  '/reports/analytics',
  '/reports/margins',
  '/reports/reorder-suggestions',
  '/reports/income-statement',
  '/reports/balance-sheet',
  '/reports/cashflow',
  '/reports/audit-log',
  '/reports/exports',
  '/shifts',
  '/settings',
  '/settings/backup',
  '/settings/receipt-design',
  '/users'
];

async function ensureOwnerPassword() {
  try {
    const { PrismaClient } = require('@prisma/client');
    const bcrypt = require('bcryptjs');
    const prisma = new PrismaClient();
    const hash = await bcrypt.hash(OWNER_PASSWORD, 10);
    await prisma.user.updateMany({ where: { email: OWNER_EMAIL }, data: { passwordHash: hash } });
    await prisma.$disconnect();
  } catch (_) { /* best-effort */ }
}

async function login(page) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.locator('input[name="email"]').fill(OWNER_EMAIL);
  await page.locator('input[name="password"]').fill(OWNER_PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();
  await Promise.race([
    page.waitForURL(/\/pos/, { timeout: 30000 }),
    page.waitForURL(/\/onboarding/, { timeout: 30000 })
  ]);
  if (/\/onboarding/.test(page.url())) {
    await page.goto(`${BASE_URL}/pos`, { waitUntil: 'networkidle' });
  }
}

async function measureRoute(page, route) {
  const startedAt = Date.now();
  const response = await page.goto(`${BASE_URL}${route}`, {
    waitUntil: 'domcontentloaded',
    timeout: 60000
  });

  const nav = await page.evaluate(() => {
    const entry = performance.getEntriesByType('navigation')[0];
    if (!entry) return null;
    return {
      ttfbMs: Math.round(entry.responseStart),
      domContentLoadedMs: Math.round(entry.domContentLoadedEventEnd),
      loadMs: Math.round(entry.loadEventEnd || 0)
    };
  });

  return {
    route,
    status: response ? response.status() : null,
    wallMs: Date.now() - startedAt,
    ttfbMs: nav?.ttfbMs ?? null,
    domContentLoadedMs: nav?.domContentLoadedMs ?? null,
    loadMs: nav?.loadMs ?? null
  };
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const report = {
    success: false,
    routeCount: ROUTES.length,
    results: [],
    summary: null,
    error: null
  };

  try {
    await ensureOwnerPassword();
    await login(page);

    for (const route of ROUTES) {
      const result = await measureRoute(page, route);
      report.results.push(result);
    }

    const wallValues = report.results.map((r) => r.wallMs);
    const domValues = report.results.map((r) => r.domContentLoadedMs ?? 0);
    const maxWallMs = Math.max(...wallValues);
    const avgWallMs = Math.round(wallValues.reduce((sum, v) => sum + v, 0) / wallValues.length);
    const avgDomContentLoadedMs = Math.round(
      domValues.reduce((sum, v) => sum + v, 0) / domValues.length
    );
    const slowRoutes = report.results.filter((r) => r.wallMs > 2000).map((r) => ({
      route: r.route,
      wallMs: r.wallMs,
      domContentLoadedMs: r.domContentLoadedMs
    }));

    report.summary = {
      maxWallMs,
      avgWallMs,
      avgDomContentLoadedMs,
      slowRoutes
    };
    report.success = true;

    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    report.error = error instanceof Error ? error.message : String(error);
    console.error(JSON.stringify(report, null, 2));
    process.exitCode = 1;
  } finally {
    await context.close();
    await browser.close();
  }
}

run();
