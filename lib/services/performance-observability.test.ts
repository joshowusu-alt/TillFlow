import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
}));

vi.mock('next/headers', () => ({
  headers: () => new Map([['x-request-id', 'req-test']]),
}));

import { measureServerOperation } from '../observability';

function read(path: string) {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

function parseConsolePayload(spy: ReturnType<typeof vi.spyOn>) {
  const line = String(spy.mock.calls.at(-1)?.[0] ?? '{}');
  return JSON.parse(line);
}

describe('Phase C3: performance observability baseline', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('returns callback results unchanged', async () => {
    vi.stubEnv('PERFORMANCE_LOGS', 'true');
    const result = await measureServerOperation(
      'test.operation',
      async () => ({ ok: true, value: 42 }),
      { businessId: 'biz-1', route: '/reports/dashboard' },
      { thresholdMs: 999_999, operationType: 'report' },
    );

    expect(result).toEqual({ ok: true, value: 42 });
  });

  it('rethrows callback errors and logs a safe error category', async () => {
    await expect(
      measureServerOperation(
        'test.error',
        async () => {
          throw new TypeError('boom');
        },
        { businessId: 'biz-1', route: '/reports/dashboard' },
        { thresholdMs: 1, operationType: 'report' },
      ),
    ).rejects.toThrow('boom');

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const payload = parseConsolePayload(errorSpy);
    expect(payload.message).toBe('performance.operation.error');
    expect(payload.operation).toBe('test.error');
    expect(payload.status).toBe('error');
    expect(payload.resultCategory).toBe('TypeError');
    expect(JSON.stringify(payload)).not.toMatch(/boom|customer|phone|token/i);
  });

  it('does not log fast operations unless performance logs are enabled', async () => {
    await measureServerOperation(
      'test.fast',
      async () => 'ok',
      { businessId: 'biz-1', route: '/pos' },
      { thresholdMs: 999_999, operationType: 'route' },
    );

    expect(logSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('logs slow operations in production and supports custom thresholds', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    await measureServerOperation(
      'test.slow',
      async () => 'ok',
      { businessId: 'biz-1', route: '/reports/dashboard' },
      { thresholdMs: 0, operationType: 'report' },
    );

    expect(warnSpy).toHaveBeenCalledTimes(1);
    const payload = parseConsolePayload(warnSpy);
    expect(payload.message).toBe('performance.operation');
    expect(payload.operation).toBe('test.slow');
    expect(payload.status).toBe('ok');
    expect(payload.thresholdMs).toBe(0);
    expect(payload.requestId).toBe('req-test');
  });

  it('logs all timings when PERFORMANCE_LOGS is enabled', async () => {
    vi.stubEnv('PERFORMANCE_LOGS', 'true');
    await measureServerOperation(
      'test.verbose',
      async () => 'ok',
      { businessId: 'biz-1', route: '/products' },
      { thresholdMs: 999_999, operationType: 'route' },
    );

    expect(logSpy).toHaveBeenCalledTimes(1);
    const payload = parseConsolePayload(logSpy);
    expect(payload.operation).toBe('test.verbose');
    expect(payload.thresholdBucket).toBe('normal');
  });

  it('drops sensitive metadata keys from performance logs', async () => {
    vi.stubEnv('PERFORMANCE_LOGS', 'true');
    await measureServerOperation(
      'test.privacy',
      async () => 'ok',
      {
        businessId: 'biz-1',
        route: '/customers',
        customerName: 'Private Person',
        supplierName: 'Private Supplier',
        phone: '0244000000',
        email: 'owner@example.com',
        token: 'secret-token',
        requestBody: { anything: true },
      },
      { thresholdMs: 999_999, operationType: 'route' },
    );

    const line = String(logSpy.mock.calls.at(-1)?.[0] ?? '');
    expect(line).toContain('test.privacy');
    expect(line).toContain('biz-1');
    expect(line).not.toMatch(/Private|0244000000|owner@example.com|secret-token|requestBody/);
  });

  it('instruments key cached and uncached report loaders', () => {
    const ownerDashboard = read('lib/reports/owner-dashboard.ts');
    const todayKpis = read('lib/reports/today-kpis.ts');
    const tradingDashboard = read('app/(protected)/reports/dashboard/page.tsx');
    const forecast = read('lib/reports/forecast.ts');
    const financials = read('lib/reports/financials.ts');

    expect(ownerDashboard).toContain('report.owner-dashboard.snapshot');
    expect(ownerDashboard).toContain("cacheState: 'cached-wrapper'");
    expect(todayKpis).toContain('report.today-kpis.snapshot');
    expect(tradingDashboard).toContain('report.trading-dashboard.snapshot');
    expect(tradingDashboard).toContain('report.trading-dashboard.live-pulse');
    expect(tradingDashboard).toContain("cacheState: 'uncached-live-pulse'");
    expect(forecast).toContain('report.cashflow-forecast.snapshot');
    expect(financials).toContain('report.income-statement.snapshot');
    expect(financials).toContain('report.balance-sheet.snapshot');
    expect(financials).toContain('report.cashflow.snapshot');
  });

  it('instruments priority operational pages', () => {
    const files = [
      ['app/(protected)/pos/page.tsx', 'page.pos.initial-data-load'],
      ['app/(protected)/products/page.tsx', 'page.products.load'],
      ['app/(protected)/inventory/page.tsx', 'page.inventory.load'],
      ['app/(protected)/customers/page.tsx', 'page.customers.load'],
      ['app/(protected)/suppliers/page.tsx', 'page.suppliers.load'],
      ['app/(protected)/payments/customer-receipts/page.tsx', 'page.customer-receipts.load'],
      ['app/(protected)/payments/supplier-payments/page.tsx', 'page.supplier-payments.load'],
      ['app/(protected)/payments/supplier-aging/page.tsx', 'page.supplier-aging.load'],
      ['app/(protected)/reports/cash-drawer/page.tsx', 'report.cash-drawer.rows'],
      ['app/(protected)/reports/stock-movements/page.tsx', 'report.stock-movements.load'],
      ['app/(protected)/reports/reorder-suggestions/page.tsx', 'report.reorder-suggestions.load'],
    ];

    for (const [path, marker] of files) {
      expect(read(path)).toContain(marker);
    }
  });

  it('instruments priority write actions through service entry points', () => {
    const sources = [
      read('lib/services/sales.ts'),
      read('lib/services/payments.ts'),
      read('lib/services/purchases.ts'),
      read('lib/services/expenses.ts'),
      read('lib/services/inventory.ts'),
      read('lib/services/shifts.ts'),
      read('lib/services/returns.ts'),
      read('lib/services/mobile-money.ts'),
      read('lib/services/products.ts'),
      read('app/actions/shifts.ts'),
    ].join('\n');

    [
      'action.checkout.create-sale',
      'action.customer-receipt.record',
      'action.supplier-payment.record',
      'action.purchase.create',
      'action.expense.create',
      'action.stock-adjustment.create',
      'action.shift.open',
      'action.shift.close',
      'action.shift.add-cash',
      'action.sales-return.create',
      'action.purchase-return.create',
      'action.mobile-money.initiate',
      'action.mobile-money.status',
      'action.mobile-money.reconcile',
      'action.product.create',
      'action.product.update',
      'action.product.quick-create',
    ].forEach((marker) => expect(sources).toContain(marker));
  });

  it('keeps cache TTLs and keys unchanged for Phase A/B caches', () => {
    const ownerDashboard = read('lib/reports/owner-dashboard.ts');
    const todayKpis = read('lib/reports/today-kpis.ts');
    const tradingDashboard = read('app/(protected)/reports/dashboard/page.tsx');
    const pos = read('app/(protected)/pos/page.tsx');

    expect(ownerDashboard).toContain("['report-owner-dashboard']");
    expect(ownerDashboard).toContain("{ revalidate: 60, tags: ['owner-dashboard'] }");
    expect(todayKpis).toContain("['report-today-kpis']");
    expect(todayKpis).toContain("{ revalidate: 30, tags: ['reports'] }");
    expect(tradingDashboard).toContain("['report-trading-dashboard']");
    expect(tradingDashboard).toContain("{ revalidate: 60, tags: ['reports', 'trading-dashboard'] }");
    expect(pos).toContain("{ revalidate: 60, tags: ['pos-products'] }");
    expect(pos).toContain("{ revalidate: 30, tags: ['pos-inventory'] }");
    expect(pos).toContain("{ revalidate: 10, tags: ['pos-shifts'] }");
  });

  it('keeps routes, action signatures, schemas, providers, and migrations untouched', () => {
    expect(read('app/actions/sales.ts')).toContain('export async function completeSaleAction(data: {');
    expect(read('app/actions/payments.ts')).toContain('export async function recordCustomerPaymentAction(formData: FormData): Promise<void>');
    expect(read('app/actions/payments.ts')).toContain('export async function recordSupplierPaymentAction(formData: FormData): Promise<void>');
    expect(read('app/actions/purchases.ts')).toContain('export async function createPurchaseAction(formData: FormData): Promise<void>');
    expect(read('app/actions/inventory.ts')).toContain('export async function createStockAdjustmentAction(formData: FormData): Promise<void>');
    expect(read('app/actions/shifts.ts')).toContain('export async function openShiftAction(');
    expect(read('app/actions/shifts.ts')).toContain('export async function closeShiftAction(');

    expect(read('prisma/schema.prisma')).toMatch(/provider\s+=\s+"sqlite"/);
    expect(read('prisma/schema.postgres.prisma')).toMatch(/provider\s+=\s+"postgresql"/);
    expect(read('prisma/migrations/migration_lock.toml')).toMatch(/provider\s+=\s+"postgresql"/);
    expect(readdirSync(join(process.cwd(), 'prisma/migrations')).length).toBeGreaterThan(0);
    expect(existsSync(join(process.cwd(), 'prisma/migrations'))).toBe(true);
  });

  it('adds a minimal Postgres smoke lane without replacing SQLite tests', () => {
    const workflow = read('.github/workflows/postgres-smoke.yml');
    const packageJson = read('package.json');

    expect(workflow).toContain('postgres:16');
    expect(workflow).toContain('prisma/schema.postgres.prisma');
    expect(workflow).toContain('prisma migrate status');
    expect(packageJson).toContain('"db:prepare:ci": "prisma generate --schema=prisma/schema.prisma');
    expect(packageJson).toContain('"test": "vitest run --reporter=dot"');
  });
});
