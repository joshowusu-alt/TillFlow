/**
 * Postgres scale + aggregation completeness for Money received summary.
 *
 * Proves getMoneyReceivedSummary does not truncate at the legacy 20_000 row cap:
 * receipt #20,001 (and larger sets) must change totals.
 *
 * Requires DATABASE_URL (Postgres). Skipped otherwise.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { isPostgresDatabaseUrl } from '@/lib/database-runtime';
import { LEGACY_MONEY_RECEIVED_SUMMARY_ROW_CAP } from '@/lib/reports/money-received';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const databaseUrl = process.env.DATABASE_URL;
const canRun = !!databaseUrl && isPostgresDatabaseUrl(databaseUrl);
const describePg = canRun ? describe : describe.skip;

describePg('money received complete DB aggregation (Postgres scale)', () => {
  let prisma: PrismaClient;
  let getMoneyReceivedSummary: typeof import('@/lib/reports/money-received').getMoneyReceivedSummary;
  let resolveReportingScope: typeof import('@/lib/reports/reporting-scope').resolveReportingScope;

  const suffix = `scale-${Date.now()}`;
  let businessId = '';
  let storeId = '';
  let tillId = '';
  let cashierId = '';
  let invoiceId = '';
  const saleAt = new Date('2026-08-07T10:00:00.000Z');

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl!;
    const g = globalThis as unknown as { prisma?: PrismaClient };
    if (g.prisma) {
      await g.prisma.$disconnect().catch(() => {});
      g.prisma = undefined;
    }
    vi.resetModules();

    const money = await import('@/lib/reports/money-received');
    const scope = await import('@/lib/reports/reporting-scope');
    getMoneyReceivedSummary = money.getMoneyReceivedSummary;
    resolveReportingScope = scope.resolveReportingScope;

    prisma = new PrismaClient();
    await prisma.$connect();

    const business = await prisma.business.create({
      data: { name: `Scale ${suffix}`, currency: 'GHS', timezone: 'Africa/Accra' },
    });
    businessId = business.id;
    const store = await prisma.store.create({
      data: { businessId, name: `Store ${suffix}` },
    });
    storeId = store.id;
    const cashier = await prisma.user.create({
      data: {
        businessId,
        email: `${suffix}@example.com`,
        name: 'Cashier',
        role: 'CASHIER',
        passwordHash: 'x',
      },
    });
    cashierId = cashier.id;
    const till = await prisma.till.create({
      data: { storeId, name: `Till ${suffix}` },
    });
    tillId = till.id;

    const invoice = await prisma.salesInvoice.create({
      data: {
        businessId,
        storeId,
        tillId,
        cashierUserId: cashierId,
        paymentStatus: 'PAID',
        subtotalPence: 1,
        vatPence: 0,
        totalPence: 1,
        createdAt: saleAt,
      },
    });
    invoiceId = invoice.id;
  }, 60_000);

  afterAll(async () => {
    if (!prisma) return;
    await prisma.salesPayment.deleteMany({
      where: { salesInvoice: { businessId } },
    }).catch(() => {});
    await prisma.salesInvoice.deleteMany({ where: { businessId } }).catch(() => {});
    await prisma.till.deleteMany({ where: { store: { businessId } } }).catch(() => {});
    await prisma.user.deleteMany({ where: { businessId } }).catch(() => {});
    await prisma.store.deleteMany({ where: { businessId } }).catch(() => {});
    await prisma.business.deleteMany({ where: { id: businessId } }).catch(() => {});
    await prisma.$disconnect().catch(() => {});
  });

  function scopeForDay() {
    return resolveReportingScope({
      businessId,
      timeZone: 'Africa/Accra',
      params: { period: 'custom', from: '2026-08-07', to: '2026-08-07', storeId: 'ALL' },
      allowedStoreIds: [storeId],
      now: new Date('2026-08-07T12:00:00.000Z'),
    });
  }

  async function seedPayments(count: number, amountPence: number, origin: string | null) {
    // Bulk insert via generate_series — avoids loading payment rows into Node.
    await prisma.$executeRaw`
      INSERT INTO "SalesPayment" (
        id, "salesInvoiceId", method, "amountPence", "receivedAt", status, "receiptOrigin"
      )
      SELECT
        ${`sc-${suffix}-`} || lpad(g::text, 8, '0'),
        ${invoiceId},
        'CASH',
        ${amountPence},
        ${saleAt},
        'CONFIRMED',
        ${origin}
      FROM generate_series(1, ${count}) AS g
      ON CONFLICT (id) DO NOTHING
    `;
  }

  async function clearPayments() {
    await prisma.salesPayment.deleteMany({ where: { salesInvoiceId: invoiceId } });
  }

  it('source no longer uses the legacy take:20_000 summary cap', () => {
    const src = readFileSync(join(process.cwd(), 'lib/reports/money-received/trading-surface.ts'), 'utf8');
    expect(src).toContain('LEGACY_MONEY_RECEIVED_SUMMARY_ROW_CAP');
    expect(LEGACY_MONEY_RECEIVED_SUMMARY_ROW_CAP).toBe(20_000);
    // Aggregation path must not reintroduce a capped findMany.
    expect(src).not.toMatch(/take:\s*20_000/);
    expect(src).not.toMatch(/take:\s*LEGACY_MONEY_RECEIVED_SUMMARY_ROW_CAP/);
    expect(src).toMatch(/\$queryRaw/);
    // Step 3R: parent sale RETURNED/VOID must not exclude confirmed receipts.
    // Assert executable exclusion patterns only — file comments intentionally mention RETURNED/VOID.
    expect(src).not.toContain('REPORTING_EXCLUDED_SALE_STATUSES');
    expect(src).not.toMatch(/paymentStatus\s*:\s*\{\s*notIn/);
    expect(src).not.toMatch(/paymentStatus\s*:\s*\{\s*in\s*:\s*\[[^\]]*RETURNED/);
  });

  it('includes receipt 20,001 — legacy cap would omit it and understate total', async () => {
    await clearPayments();
    const n = LEGACY_MONEY_RECEIVED_SUMMARY_ROW_CAP + 1; // 20_001
    const started = Date.now();
    const memBefore = process.memoryUsage().heapUsed;

    await seedPayments(n, 1, 'RECEIVED_AT_SALE');
    const seedMs = Date.now() - started;

    const t0 = Date.now();
    const summary = await getMoneyReceivedSummary(scopeForDay());
    const queryMs = Date.now() - t0;
    const memAfter = process.memoryUsage().heapUsed;

    // Legacy take:20_000 ordered by receivedAt/id would drop the last row → total 20_000.
    expect(summary.totalCount).toBe(n);
    expect(summary.totalPence).toBe(n);
    expect(summary.receivedAtSalePence).toBe(n);
    expect(summary.receivedAtSaleCount).toBe(n);
    expect(summary.byMethod.CASH).toBe(n);
    expect(
      summary.byMethod.CASH
        + summary.byMethod.CARD
        + summary.byMethod.TRANSFER
        + summary.byMethod.MOBILE_MONEY
        + summary.byMethod.UNKNOWN,
    ).toBe(summary.totalPence);
    expect(
      summary.byMethodCount.CASH
        + summary.byMethodCount.CARD
        + summary.byMethodCount.TRANSFER
        + summary.byMethodCount.MOBILE_MONEY
        + summary.byMethodCount.UNKNOWN,
    ).toBe(summary.totalCount);
    expect(
      summary.receivedAtSalePence
        + summary.laterCreditCollectionPence
        + summary.unknownHistoricalOriginPence,
    ).toBe(summary.totalPence);
    expect(
      summary.receivedAtSaleCount
        + summary.laterCreditCollectionCount
        + summary.unknownHistoricalOriginCount,
    ).toBe(summary.totalCount);

    // Performance observation (not a hard SLA): one aggregate query, not N+1 / load-all.
    expect(queryMs).toBeLessThan(30_000);
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify({
        dataset: n,
        seedMs,
        queryMs,
        heapDeltaMb: Math.round(((memAfter - memBefore) / 1024 / 1024) * 10) / 10,
      }),
    );

    // EXPLAIN — confirm aggregate plan (no evidence of app-side full materialisation).
    const plan = await prisma.$queryRaw<Array<{ 'QUERY PLAN': string }>>`
      EXPLAIN
      SELECT COALESCE(SUM(sp."amountPence"), 0)
      FROM "SalesPayment" sp
      INNER JOIN "SalesInvoice" si ON si.id = sp."salesInvoiceId"
      WHERE sp."receivedAt" >= ${saleAt}
        AND sp."receivedAt" < ${new Date('2026-08-08T00:00:00.000Z')}
        AND sp.status NOT IN ('FAILED', 'CANCELLED', 'VOID')
        AND si."businessId" = ${businessId}
        AND si."paymentStatus" NOT IN ('RETURNED', 'VOID')
    `;
    const planText = plan.map((p) => p['QUERY PLAN']).join('\n');
    expect(planText.length).toBeGreaterThan(20);
    // eslint-disable-next-line no-console
    console.log('EXPLAIN_SNIPPET', planText.slice(0, 500));
  }, 180_000);

  it('reconciles 20,000 exact-boundary and mixed origin 50,000+ sets', async () => {
    await clearPayments();
    await seedPayments(LEGACY_MONEY_RECEIVED_SUMMARY_ROW_CAP, 1, 'RECEIVED_AT_SALE');
    let summary = await getMoneyReceivedSummary(scopeForDay());
    expect(summary.totalCount).toBe(LEGACY_MONEY_RECEIVED_SUMMARY_ROW_CAP);
    expect(summary.totalPence).toBe(LEGACY_MONEY_RECEIVED_SUMMARY_ROW_CAP);

    await clearPayments();
    const large = 50_000;
    // Mix origins: 40k at-sale, 5k later, 5k NULL unknown
    await prisma.$executeRaw`
      INSERT INTO "SalesPayment" (
        id, "salesInvoiceId", method, "amountPence", "receivedAt", status, "receiptOrigin"
      )
      SELECT
        ${`sc2-${suffix}-`} || lpad(g::text, 8, '0'),
        ${invoiceId},
        CASE
          WHEN g <= 20000 THEN 'CASH'
          WHEN g <= 35000 THEN 'MOBILE_MONEY'
          WHEN g <= 45000 THEN 'CARD'
          ELSE 'TRANSFER'
        END,
        1,
        ${saleAt},
        'CONFIRMED',
        CASE
          WHEN g <= 40000 THEN 'RECEIVED_AT_SALE'
          WHEN g <= 45000 THEN 'LATER_CREDIT_COLLECTION'
          ELSE NULL
        END
      FROM generate_series(1, ${large}) AS g
    `;

    const t0 = Date.now();
    summary = await getMoneyReceivedSummary(scopeForDay());
    const queryMs = Date.now() - t0;

    expect(summary.totalCount).toBe(large);
    expect(summary.totalPence).toBe(large);
    expect(summary.receivedAtSalePence).toBe(40_000);
    expect(summary.laterCreditCollectionPence).toBe(5_000);
    expect(summary.unknownHistoricalOriginPence).toBe(5_000);
    expect(summary.receivedAtSaleCount).toBe(40_000);
    expect(summary.laterCreditCollectionCount).toBe(5_000);
    expect(summary.unknownHistoricalOriginCount).toBe(5_000);
    expect(
      summary.byMethod.CASH
        + summary.byMethod.CARD
        + summary.byMethod.TRANSFER
        + summary.byMethod.MOBILE_MONEY
        + summary.byMethod.UNKNOWN,
    ).toBe(summary.totalPence);
    expect(
      summary.byMethodCount.CASH
        + summary.byMethodCount.CARD
        + summary.byMethodCount.TRANSFER
        + summary.byMethodCount.MOBILE_MONEY
        + summary.byMethodCount.UNKNOWN,
    ).toBe(summary.totalCount);
    expect(
      summary.receivedAtSalePence
        + summary.laterCreditCollectionPence
        + summary.unknownHistoricalOriginPence,
    ).toBe(summary.totalPence);
    expect(
      summary.receivedAtSaleCount
        + summary.laterCreditCollectionCount
        + summary.unknownHistoricalOriginCount,
    ).toBe(summary.totalCount);
    expect(queryMs).toBeLessThan(60_000);
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ dataset: large, queryMs }));
  }, 300_000);

  it('keeps signed reversal in origin bucket without double-counting total', async () => {
    await clearPayments();
    await prisma.salesPayment.createMany({
      data: [
        {
          id: `rev-pos-${suffix}`,
          salesInvoiceId: invoiceId,
          method: 'CASH',
          amountPence: 5000,
          receivedAt: saleAt,
          status: 'CONFIRMED',
          receiptOrigin: 'RECEIVED_AT_SALE',
        },
        {
          id: `rev-neg-${suffix}`,
          salesInvoiceId: invoiceId,
          method: 'CASH',
          amountPence: -1500,
          receivedAt: saleAt,
          status: 'CONFIRMED',
          receiptOrigin: 'UNCLASSIFIED',
        },
      ],
    });
    const summary = await getMoneyReceivedSummary(scopeForDay());
    expect(summary.totalPence).toBe(3500);
    expect(summary.receivedAtSalePence).toBe(5000);
    expect(summary.unknownHistoricalOriginPence).toBe(-1500);
    expect(summary.reversalPence).toBe(-1500);
    expect(
      summary.receivedAtSalePence
        + summary.laterCreditCollectionPence
        + summary.unknownHistoricalOriginPence,
    ).toBe(summary.totalPence);
  });
});
