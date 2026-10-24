/** Disposable PostgreSQL only. No HTTP/provider calls or production fallback. */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { Client as PgClient } from 'pg';
import { performance } from 'node:perf_hooks';
import { canRunLivePostgresTests, openTestPrismaClient, runTestTeardown } from '@/lib/test/test-prisma';
import { purchaseDocumentFixture } from '@/lib/test/purchase-document-fixture';
import { isExactStandardUnitName, selectUnitsForBusiness, SHARED_PIECE_UNIT_ID, standardUnitNameLookupValues } from '@/lib/units/selectable-units';

vi.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock('next/headers', () => ({ headers: () => new Headers() }));
vi.mock('@/lib/action-utils', () => ({ UserError: class UserError extends Error {} }));
vi.mock('@/lib/services/risk-monitor', () => ({
  detectVoidFrequencyRisk: vi.fn().mockResolvedValue(undefined),
  detectExcessiveDiscountRisk: vi.fn().mockResolvedValue(undefined),
  detectNegativeMarginRisk: vi.fn().mockResolvedValue(undefined),
  detectCashVarianceRisk: vi.fn().mockResolvedValue(undefined),
}));

type Fixture = { businessId: string; storeId: string; tillId: string; userId: string; supplierId: string; productId: string; unitId: string; shiftId: string };
const describePg = process.env.TILLFLOW_RUN_DATABASE_PILOT === '1' && canRunLivePostgresTests() ? describe : describe.skip;
const percentile = (values: number[], fraction: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] ?? 0;
};

describePg('database pilot: six concurrent cashiers, three businesses, five pool connections', () => {
  let prisma: PrismaClient;
  let observer: PgClient;
  let sales: typeof import('@/lib/services/sales');
  let purchases: typeof import('@/lib/services/purchases');
  let listUnits: typeof import('@/lib/units/list-selectable-units');
  const businessIds: string[] = [], unitIds: string[] = [], actors: Fixture[] = [];
  let phase: 'baseline' | 'fixed' | null = null;
  const queryMs: Record<string, number[]> = { baseline: [], fixed: [] };

  beforeAll(async () => {
    // Keep the observed production pool size. This benchmark does not cure errors by buying capacity.
    const target = new URL(process.env.TILLFLOW_TEST_DATABASE_URL || process.env.DATABASE_URL || '');
    // The harness owns URL selection/pinning. Tests only check the configured
    // capacity rather than rewriting URL aliases after the guard ran.
    expect(target.searchParams.get('connection_limit')).toBe('5');
    expect(target.searchParams.get('pool_timeout')).toBe('10');
    expect(target.searchParams.get('application_name')).toBe('tillflow_pilot_database');
    ({ prisma } = await openTestPrismaClient({ onQuery: e => { if (phase) queryMs[phase].push(e.durationMs); } }));
    (globalThis as unknown as { prisma: PrismaClient }).prisma = prisma;
    [sales, purchases, listUnits] = await Promise.all([import('@/lib/services/sales'), import('@/lib/services/purchases'), import('@/lib/units/list-selectable-units')]);
    const shifts = await import('@/lib/services/shifts');
    const accounting = await import('@/lib/accounting');
    const nonce = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    for (let businessIndex = 0; businessIndex < 3; businessIndex++) {
      const business = await prisma.business.create({ data: { name: `FICTIONAL pilot load ${nonce}-${businessIndex}`, currency: 'GHS', vatEnabled: false, storeMode: 'MULTI_STORE' } });
      businessIds.push(business.id);
      const owner = await prisma.user.create({ data: { businessId: business.id, name: 'Fictional owner', email: `load-owner-${nonce}-${businessIndex}@example.invalid`, role: 'OWNER', passwordHash: 'not-a-login' } });
      const supplier = await prisma.supplier.create({ data: { businessId: business.id, name: 'Fictional supplier' } });
      const product = await prisma.product.create({ data: { businessId: business.id, name: 'Fictional Rice', sellingPriceBasePence: 5000, defaultCostBasePence: 1000 } });
      const unit = await prisma.unit.create({ data: { name: `Load unit ${nonce}-${businessIndex}`, pluralName: 'Load units' } }); unitIds.push(unit.id);
      await prisma.productUnit.create({ data: { productId: product.id, unitId: unit.id, isBaseUnit: true, conversionToBase: 1 } });
      // A mini-mart catalogue, not a one-row query benchmark. Trade the first
      // item but load/search alongside 249 other fictional stocked products.
      const otherProducts = Array.from({ length: 249 }, (_, index) => ({
        id: `load-product-${nonce}-${businessIndex}-${index}`, businessId: business.id,
        name: `Fictional item ${String(index).padStart(3, '0')}`, sellingPriceBasePence: 2500, defaultCostBasePence: 1000,
      }));
      await prisma.product.createMany({ data: otherProducts });
      await prisma.productUnit.createMany({ data: otherProducts.map(row => ({ productId: row.id, unitId: unit.id, isBaseUnit: true, conversionToBase: 1 })) });
      await accounting.ensureChartOfAccounts(business.id, prisma);
      for (let storeIndex = 0; storeIndex < 2; storeIndex++) {
        const store = await prisma.store.create({ data: { businessId: business.id, name: `Fictional branch ${storeIndex}` } });
        const till = await prisma.till.create({ data: { storeId: store.id, name: `Fictional till ${storeIndex}` } });
        const user = await prisma.user.create({ data: { businessId: business.id, name: `Fictional cashier ${storeIndex}`, email: `load-cashier-${nonce}-${businessIndex}-${storeIndex}@example.invalid`, role: 'CASHIER', passwordHash: 'not-a-login' } });
        await prisma.inventoryBalance.create({ data: { storeId: store.id, productId: product.id, qtyOnHandBase: 1000, avgCostBasePence: 1000, knownValuePence: 1000000, unvaluedQtyBase: 0 } });
        await prisma.inventoryBalance.createMany({ data: otherProducts.map(row => ({ storeId: store.id, productId: row.id, qtyOnHandBase: 20, avgCostBasePence: 1000, knownValuePence: 20000, unvaluedQtyBase: 0 })) });
        const opened = await shifts.performShiftOpen({ businessId: business.id, storeId: store.id, tillId: till.id, openingCashPence: 20000, actor: { userId: user.id, userName: user.name, userRole: 'CASHIER' } });
        actors.push({ businessId: business.id, storeId: store.id, tillId: till.id, userId: user.id, supplierId: supplier.id, productId: product.id, unitId: unit.id, shiftId: opened.id });
      }
      await accounting.postJournalEntry({ businessId: business.id, description: 'Fictional fixture opening', prismaClient: prisma, lines: [{ accountCode: '1200', debitPence: 11960000 }, { accountCode: '1000', debitPence: 40000 }, { accountCode: '3000', creditPence: 12000000 }] });
      void owner;
    }
    const observerTarget = new URL(target);
    for (const key of ['connection_limit', 'pool_timeout', 'schema', 'pgbouncer']) observerTarget.searchParams.delete(key);
    observerTarget.searchParams.set('application_name', 'tillflow_pilot_observer');
    observer = new PgClient({ connectionString: observerTarget.toString() });
    await observer.connect();
    const identity = await observer.query<{ database: string }>('SELECT current_database() AS database');
    expect(identity.rows[0].database).toBe(target.pathname.slice(1));
    await observer.query('SET default_transaction_read_only = on');
  }, 60000);

  afterAll(async () => {
    phase = null;
    await observer?.end();
    const businessId = { in: businessIds }, store = { businessId };
    await runTestTeardown(prisma, [
      () => prisma.auditLog.deleteMany({ where: { businessId } }),
      () => prisma.journalEntry.deleteMany({ where: { businessId } }),
      () => prisma.salesPayment.deleteMany({ where: { salesInvoice: { businessId } } }),
      () => prisma.salesInvoice.deleteMany({ where: { businessId } }),
      () => prisma.purchaseDocument.deleteMany({ where: { purchaseInvoice: { businessId } } }),
      () => prisma.purchaseInvoice.deleteMany({ where: { businessId } }),
      () => prisma.cashDrawerEntry.deleteMany({ where: { businessId } }),
      () => prisma.moneyIdempotency.deleteMany({ where: { businessId } }),
      () => prisma.stockMovement.deleteMany({ where: { store } }),
      () => prisma.inventoryBalance.deleteMany({ where: { store } }),
      () => prisma.product.deleteMany({ where: { businessId } }),
      () => prisma.unit.deleteMany({ where: { id: { in: unitIds } } }),
      () => prisma.supplier.deleteMany({ where: { businessId } }),
      () => prisma.businessSequence.deleteMany({ where: { businessId } }),
      () => prisma.account.deleteMany({ where: { businessId } }),
      () => prisma.shift.deleteMany({ where: { till: { store } } }),
      () => prisma.till.deleteMany({ where: { store } }),
      () => prisma.store.deleteMany({ where: { businessId } }),
      () => prisma.user.deleteMany({ where: { businessId } }),
      () => prisma.business.deleteMany({ where: { id: businessId } }),
    ], { label: 'database-pilot-load' });
  }, 60000);

  // Frozen original lookup for an honest same-process/same-database comparison.
  async function baselineUnits(businessId: string) {
    const [standards, used, piece] = await Promise.all([
      prisma.unit.findMany({ where: { name: { in: standardUnitNameLookupValues() } }, select: { id: true, name: true, pluralName: true } }),
      prisma.unit.findMany({ where: { productUnits: { some: { product: { businessId } } } }, select: { id: true, name: true, pluralName: true } }),
      prisma.unit.findUnique({ where: { id: SHARED_PIECE_UNIT_ID }, select: { id: true, name: true, pluralName: true } }),
    ]);
    if (piece && isExactStandardUnitName(piece.name) && !standards.some(u => u.id === piece.id)) standards.push(piece);
    return selectUnitsForBusiness({ standardCandidates: standards, businessUnits: used }).map(u => ({ id: u.id, name: u.name, pluralName: u.pluralName?.trim() || u.name }));
  }

  it('measures original and fixed bursts, real checkout/purchase/report writes and lost-ack retries', async () => {
    // Pilot acceptance thresholds defined before execution: six simultaneous devices,
    // service-operation p95 <=2s, transaction operation p95 <=3s, no pool errors, 100% checkouts.
    const thresholds = { concurrentUsers: 6, serviceOperationP95Ms: 2000, transactionP95Ms: 3000, allowedErrors: 0, requiredCheckoutSuccessRate: 1 };
    const results: Record<string, unknown> = {};
    for (const variant of ['baseline', 'fixed'] as const) {
      const requests: number[] = [], transactions: number[] = [], failures: string[] = [];
      const connectionSamples: number[] = [];
      let checking = false, stopped = false, checkouts = 0;
      const sample = async () => {
        if (checking || stopped) return; checking = true;
        try { const rows = await observer.query<{ count: string }>("SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND application_name='tillflow_pilot_database'"); connectionSamples.push(Number(rows.rows[0].count)); }
        finally { checking = false; }
      };
      await sample(); const timer = setInterval(() => { void sample(); }, 20);
      phase = variant; const start = performance.now();
      try {
        await Promise.all(actors.map(async (actor, actorIndex) => {
          for (let round = 0; round < 4; round++) {
            const requestStart = performance.now();
            try {
              const units = variant === 'baseline' ? baselineUnits : listUnits.listSelectableUnits;
              const [lookups] = await Promise.all([
                Promise.all(Array.from({ length: 8 }, () => units(actor.businessId))),
                prisma.product.findMany({ where: { businessId: actor.businessId, active: true }, take: 25 }),
                prisma.product.count({ where: { businessId: actor.businessId, active: true } }),
                prisma.inventoryBalance.findMany({ where: { storeId: actor.storeId }, take: 25 }),
              ]);
              expect(lookups[0].some(u => u.id === actor.unitId)).toBe(true);
              const saleInput = { businessId: actor.businessId, storeId: actor.storeId, tillId: actor.tillId, cashierUserId: actor.userId, capturedShiftId: actor.shiftId, externalRef: `OFFLINE_SYNC:load-${variant}-${actor.shiftId}-${round}`, paymentStatus: 'PAID' as const, lines: [{ productId: actor.productId, unitId: actor.unitId, qtyInUnit: 1 }], payments: [{ method: 'CASH' as const, amountPence: 5000 }] };
              let txStart = performance.now(); const sale = await sales.createSale(saleInput); transactions.push(performance.now() - txStart); checkouts++;
              // Simulate a committed response lost by the caller: replay the same identity.
              const retry = await sales.createSale(saleInput); expect(retry.id).toBe(sale.id);
              expect(await prisma.salesPayment.count({ where: { salesInvoiceId: sale.id } })).toBe(1);
              txStart = performance.now();
              await purchases.createPurchase({ sourceDocuments: [purchaseDocumentFixture()], businessId: actor.businessId, storeId: actor.storeId, supplierId: actor.supplierId, userId: actor.userId, paymentStatus: 'UNPAID', payments: [], lines: [{ productId: actor.productId, unitId: actor.unitId, qtyInUnit: 1, unitCostPence: 1000 }], idempotencyKey: `load-purchase-${variant}-${actor.shiftId}-${round}` }); transactions.push(performance.now() - txStart);
              await prisma.salesInvoice.aggregate({ where: { businessId: actor.businessId, storeId: actor.storeId, paymentStatus: { notIn: ['VOID', 'RETURNED'] } }, _sum: { totalPence: true } });
            } catch (error) { failures.push(`${actorIndex}/${round}:${error instanceof Error ? error.message : String(error)}`); }
            requests.push(performance.now() - requestStart);
          }
        }));
      } finally { phase = null; stopped = true; clearInterval(timer); while (checking) await new Promise(r => setTimeout(r, 5)); }
      const result = { durationMs: performance.now() - start, attemptedCheckouts: 24, successfulCheckouts: checkouts, checkoutSuccessRate: checkouts / 24, errorCount: failures.length, errors: failures, serviceOperationP50Ms: percentile(requests, .5), serviceOperationP95Ms: percentile(requests, .95), transactionOperationP95Ms: percentile(transactions, .95), databaseQueryCount: queryMs[variant].length, databaseQueryP95Ms: percentile(queryMs[variant], .95), maxObservedConnections: Math.max(0, ...connectionSamples), connectionSamples: connectionSamples.length };
      results[variant] = result;
      console.info('PILOT_DATABASE_METRICS', JSON.stringify({ variant, thresholds, result }));
      expect(failures).toEqual([]); expect(checkouts).toBe(24);
      if (variant === 'fixed') { expect(result.serviceOperationP95Ms).toBeLessThanOrEqual(thresholds.serviceOperationP95Ms); expect(result.transactionOperationP95Ms).toBeLessThanOrEqual(thresholds.transactionP95Ms); }
    }
    expect(queryMs.fixed.length).toBeLessThan(queryMs.baseline.length);
    for (const actor of actors) {
      expect(await prisma.salesInvoice.count({ where: { businessId: actor.businessId, storeId: actor.storeId } })).toBe(8);
      expect((await prisma.inventoryBalance.findUniqueOrThrow({ where: { storeId_productId: { storeId: actor.storeId, productId: actor.productId } } })).qtyOnHandBase).toBe(1000);
      expect((await prisma.shift.findUniqueOrThrow({ where: { id: actor.shiftId } })).expectedCashPence).toBe(60000);
    }
    for (const businessId of businessIds) {
      const entries = await prisma.journalEntry.findMany({ where: { businessId }, include: { lines: true } });
      for (const entry of entries) expect(entry.lines.reduce((sum, line) => sum + line.debitPence - line.creditPence, 0)).toBe(0);
    }
    void results;
  }, 120000);

  it('completes purchases when all five pool slots belong to supplied outer transactions', async () => {
    // Reproduces import/opening-stock composition: every worker already owns a
    // connection before createPurchase starts. A root-client read here can only
    // wait for a connection held by one of these blocked transactions.
    let arrived = 0;
    let release!: () => void;
    const allHoldingConnections = new Promise<void>(resolve => { release = resolve; });
    const started = performance.now();
    const results = await Promise.allSettled(actors.slice(0, 5).map(actor => prisma.$transaction(async tx => {
      arrived++;
      if (arrived === 5) release();
      await allHoldingConnections;
      return purchases.createPurchase({ sourceDocuments: [purchaseDocumentFixture()], businessId: actor.businessId,
        storeId: actor.storeId, supplierId: actor.supplierId, userId: actor.userId, paymentStatus: 'UNPAID', payments: [],
        lines: [{ productId: actor.productId, unitId: actor.unitId, qtyInUnit: 1, unitCostPence: 1000 }],
        idempotencyKey: `outer-pool-proof-${actor.shiftId}` }, tx);
    }, { maxWait: 10000, timeout: 30000 })));
    const rejected = results.filter(result => result.status === 'rejected');
    console.info('PILOT_OUTER_TRANSACTION_METRICS', JSON.stringify({ workers: 5, poolLimit: 5,
      durationMs: performance.now() - started, success: results.length - rejected.length,
      errors: rejected.map(result => result.status === 'rejected'
        ? { code: result.reason?.code ?? null, message: String(result.reason) } : null) }));
    expect(arrived).toBe(5);
    expect(rejected).toEqual([]);
    for (const actor of actors.slice(0, 5)) {
      expect(await prisma.moneyIdempotency.count({ where: { businessId: actor.businessId, key: `outer-pool-proof-${actor.shiftId}` } })).toBe(1);
    }
  }, 60000);

  it('returns one committed sale to both overlapping requests with the same externalRef', async () => {
    const actor = actors[0];
    const externalRef = `OFFLINE_SYNC:parallel-identical-${actor.shiftId}`;
    let preflightReads = 0;
    let release!: () => void;
    const bothReadNoWinner = new Promise<void>(resolve => { release = resolve; });
    prisma.$use(async (params, next) => {
      const result = await next(params);
      if (params.model === 'SalesInvoice' && params.action === 'findFirst' &&
        !params.runInTransaction && params.args?.where?.externalRef === externalRef && !result) {
        preflightReads++;
        if (preflightReads === 2) release();
        await bothReadNoWinner;
      }
      return result;
    });
    const input = { businessId: actor.businessId, storeId: actor.storeId, tillId: actor.tillId, cashierUserId: actor.userId,
      capturedShiftId: actor.shiftId, externalRef, paymentStatus: 'PAID' as const,
      lines: [{ productId: actor.productId, unitId: actor.unitId, qtyInUnit: 1 }], payments: [{ method: 'CASH' as const, amountPence: 5000 }] };
    const beforeCash = (await prisma.shift.findUniqueOrThrow({ where: { id: actor.shiftId } })).expectedCashPence;
    const results = await Promise.all([sales.createSale(input), sales.createSale(input)]);
    expect(preflightReads).toBe(2);
    expect(results[0].id).toBe(results[1].id);
    expect(await prisma.salesInvoice.count({ where: { businessId: actor.businessId, externalRef } })).toBe(1);
    expect(await prisma.salesPayment.count({ where: { salesInvoiceId: results[0].id } })).toBe(1);
    expect(await prisma.journalEntry.count({ where: { businessId: actor.businessId, referenceType: 'SALES_INVOICE', referenceId: results[0].id } })).toBe(1);
    expect((await prisma.shift.findUniqueOrThrow({ where: { id: actor.shiftId } })).expectedCashPence).toBe(beforeCash + 5000);
  }, 30000);

  it('recovers a stale invoice counter only after rollback with one financial effect', async () => {
    const actor = actors[1];
    const existing = await prisma.salesInvoice.findMany({ where: { businessId: actor.businessId }, select: { transactionNumber: true } });
    const priorMax = Math.max(...existing.map(row => Number(row.transactionNumber?.slice(4) || 0)));
    await prisma.businessSequence.update({ where: { businessId_sequenceName: { businessId: actor.businessId, sequenceName: 'invoice' } }, data: { nextVal: 0 } });
    const beforeCash = (await prisma.shift.findUniqueOrThrow({ where: { id: actor.shiftId } })).expectedCashPence;
    const invoiceCount = await prisma.salesInvoice.count({ where: { businessId: actor.businessId } });
    const sale = await sales.createSale({ businessId: actor.businessId, storeId: actor.storeId, tillId: actor.tillId,
      cashierUserId: actor.userId, capturedShiftId: actor.shiftId, externalRef: `OFFLINE_SYNC:stale-counter-${actor.shiftId}`,
      paymentStatus: 'PAID', lines: [{ productId: actor.productId, unitId: actor.unitId, qtyInUnit: 1 }], payments: [{ method: 'CASH', amountPence: 5000 }] });
    expect(Number(sale.transactionNumber?.slice(4))).toBe(priorMax + 1);
    expect(await prisma.salesInvoice.count({ where: { businessId: actor.businessId } })).toBe(invoiceCount + 1);
    expect(await prisma.salesPayment.count({ where: { salesInvoiceId: sale.id } })).toBe(1);
    expect((await prisma.shift.findUniqueOrThrow({ where: { id: actor.shiftId } })).expectedCashPence).toBe(beforeCash + 5000);
  }, 30000);
});
