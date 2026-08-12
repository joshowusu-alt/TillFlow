/**
 * Step 5B — Local preview-equivalent end-to-end validation for Money Received.
 * Uses a disposable in-memory Prisma-shaped store. Does not touch production data.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  buildMoneyReceivedExportCsv,
  computeMoneyReceivedBundleFromDb,
  drillDownForMetric,
  fetchDrillPage,
  getGatedMoneyMetric,
  reconcileMethodBreakdownToMoneyReceived,
  reconcileMoneyReceivedToDetailSum,
  resolveMoneyReceivedAccess,
  resolveMoneyReceivedScope,
} from '@/lib/reports/money-received';
import {
  buildStep5BDataset,
  createPreviewEquivalentDb,
} from '@/lib/reports/money-received/preview-equivalent-db';

const dataset = buildStep5BDataset();
const dbStore = createPreviewEquivalentDb(dataset.payments, dataset.refunds);
/** Preview-equivalent Prisma surface used by Money Received query paths. */
const db = dbStore as any;

function janScope(branchIds: string[] | null = null) {
  return resolveMoneyReceivedScope({
    businessId: dataset.bizA,
    currency: 'GHS',
    timeZone: 'Africa/Accra',
    periodStart: new Date('2026-01-01T00:00:00.000Z'),
    periodEndInclusive: new Date('2026-02-01T00:00:00.000Z'),
    branchIds,
    absoluteBounds: true,
  });
}

function febScope() {
  return resolveMoneyReceivedScope({
    businessId: dataset.bizA,
    currency: 'GHS',
    timeZone: 'Africa/Accra',
    periodStart: new Date('2026-02-01T00:00:00.000Z'),
    periodEndInclusive: new Date('2026-03-01T00:00:00.000Z'),
    branchIds: [dataset.branchA1],
    absoluteBounds: true,
  });
}

function marScope() {
  return resolveMoneyReceivedScope({
    businessId: dataset.bizA,
    currency: 'GHS',
    timeZone: 'Africa/Accra',
    periodStart: new Date('2026-03-01T00:00:00.000Z'),
    periodEndInclusive: new Date('2026-04-01T00:00:00.000Z'),
    branchIds: [dataset.branchA1],
    absoluteBounds: true,
  });
}

describe('Step 5B preview-equivalent — economic validation', () => {
  it('confirms methods, exclusions, other, unverified, RETURNED/VOID parents, refunds', async () => {
    const bundle = await computeMoneyReceivedBundleFromDb(db, {
      businessId: dataset.bizA,
      currency: 'GHS',
      timeZone: 'Africa/Accra',
      periodStart: new Date('2026-01-01T00:00:00.000Z'),
      periodEndInclusive: new Date('2026-02-01T00:00:00.000Z'),
      branchIds: [dataset.branchA1],
      absoluteBounds: true,
    });

    expect(bundle.source).toBe('database-aggregates');
    expect(bundle.quality.overall).not.toBe('QUERY_FAILED');

    // cash 100 + momo 200 + card 150 + transfer 250 + other 50 + returned-parent 200 + void-parent 80 + tz 7.77
    // = 10000+20000+15000+25000+5000+20000+8000+777 = 103777
    expect(bundle.byId.money_received.valuePence).toBe(103777);
    expect(bundle.byId.money_received_cash.valuePence).toBe(10000 + 20000 + 777);
    expect(bundle.byId.money_received_momo.valuePence).toBe(20000);
    expect(bundle.byId.money_received_card.valuePence).toBe(15000 + 8000);
    expect(bundle.byId.money_received_transfer.valuePence).toBe(25000);
    expect(bundle.byId.money_received_other.valuePence).toBe(5000);
    expect(bundle.byId.unverified_legacy_receipts.valuePence).toBe(4500);
    expect(bundle.byId.unverified_legacy_receipts.qualityState).toBe('UNVERIFIED');
    expect(bundle.byId.refund_outflows.valuePence).toBe(0);
    expect(reconcileMethodBreakdownToMoneyReceived(bundle.results).ok).toBe(true);

    // FAILED/PENDING/CANCELLED/VOID amounts not in money_received
    expect(bundle.byId.money_received.valuePence).not.toBeGreaterThanOrEqual(103777 + 9999);

    const feb = await computeMoneyReceivedBundleFromDb(db, {
      businessId: dataset.bizA,
      currency: 'GHS',
      timeZone: 'Africa/Accra',
      periodStart: new Date('2026-02-01T00:00:00.000Z'),
      periodEndInclusive: new Date('2026-03-01T00:00:00.000Z'),
      branchIds: [dataset.branchA1],
      absoluteBounds: true,
    });
    expect(feb.byId.refund_outflows.valuePence).toBe(20000);
    expect(feb.byId.money_received.valuePence).toBe(0);

    const gate = getGatedMoneyMetric('payment_reversal_outflows', feb.scope);
    expect(gate.valuePence).toBeNull();
    expect(gate.qualityState).toBe('UNAVAILABLE UNTIL DEPENDENCY RESOLVED');
    const paidGate = getGatedMoneyMetric('paid_at_sale_value_incl_tax', feb.scope);
    expect(paidGate.valuePence).toBeNull();
  });

  it('branch and business isolation', async () => {
    const a1 = await computeMoneyReceivedBundleFromDb(db, {
      businessId: dataset.bizA,
      currency: 'GHS',
      periodStart: new Date('2026-01-01T00:00:00.000Z'),
      periodEndInclusive: new Date('2026-02-01T00:00:00.000Z'),
      branchIds: [dataset.branchA1],
      absoluteBounds: true,
    });
    const a2 = await computeMoneyReceivedBundleFromDb(db, {
      businessId: dataset.bizA,
      currency: 'GHS',
      periodStart: new Date('2026-01-01T00:00:00.000Z'),
      periodEndInclusive: new Date('2026-02-01T00:00:00.000Z'),
      branchIds: [dataset.branchA2],
      absoluteBounds: true,
    });
    const b = await computeMoneyReceivedBundleFromDb(db, {
      businessId: dataset.bizB,
      currency: 'GHS',
      periodStart: new Date('2026-01-01T00:00:00.000Z'),
      periodEndInclusive: new Date('2026-02-01T00:00:00.000Z'),
      branchIds: null,
      absoluteBounds: true,
    });
    expect(a2.byId.money_received.valuePence).toBe(3000);
    expect(b.byId.money_received.valuePence).toBe(77777);
    expect(a1.byId.money_received.valuePence).not.toBe(b.byId.money_received.valuePence);
  });

  it('empty period is zero COMPLETE; CT27 timezone day membership', async () => {
    const empty = await computeMoneyReceivedBundleFromDb(db, {
      businessId: dataset.bizA,
      currency: 'GHS',
      periodStart: new Date('2025-06-01T00:00:00.000Z'),
      periodEndInclusive: new Date('2025-07-01T00:00:00.000Z'),
      branchIds: [dataset.branchA1],
      absoluteBounds: true,
    });
    expect(empty.byId.money_received.valuePence).toBe(0);
    expect(empty.byId.money_received.qualityState).toBe('COMPLETE');

    const dayD = resolveMoneyReceivedScope({
      businessId: dataset.bizA,
      currency: 'GHS',
      timeZone: 'Africa/Accra',
      periodStart: new Date('2026-01-15T12:00:00.000Z'),
      periodEndInclusive: new Date('2026-01-15T12:00:00.000Z'),
      branchIds: [dataset.branchA1],
    });
    const dayD1 = resolveMoneyReceivedScope({
      businessId: dataset.bizA,
      currency: 'GHS',
      timeZone: 'Africa/Accra',
      periodStart: new Date('2026-01-16T12:00:00.000Z'),
      periodEndInclusive: new Date('2026-01-16T12:00:00.000Z'),
      branchIds: [dataset.branchA1],
    });
    const pageD = await fetchDrillPage(db as any, dayD, {
      metricId: 'money_received',
      page: 1,
      pageSize: 100,
    });
    const pageD1 = await fetchDrillPage(db as any, dayD1, {
      metricId: 'money_received',
      page: 1,
      pageSize: 100,
    });
    expect(pageD.rows.some((r) => r.sourceId === 'pay-tz-boundary')).toBe(false);
    expect(pageD1.rows.some((r) => r.sourceId === 'pay-tz-boundary')).toBe(true);
    expect(pageD1.rows.find((r) => r.sourceId === 'pay-tz-boundary')?.amountPence).toBe(777);
  });
});

describe('Step 5B preview-equivalent — drill-down, export, reconciliation', () => {
  it(
    'DB page fetch is bounded; all pages sum to headline; page size invariant',
    async () => {
      dbStore.__calls.length = 0;
      const bundle = await computeMoneyReceivedBundleFromDb(db, {
        businessId: dataset.bizA,
        currency: 'GHS',
        periodStart: new Date('2026-03-01T00:00:00.000Z'),
        periodEndInclusive: new Date('2026-04-01T00:00:00.000Z'),
        branchIds: [dataset.branchA1],
        absoluteBounds: true,
      });
      const headline = bundle.byId.money_received.valuePence!;
      expect(headline).toBe(5100);

      const page1 = await drillDownForMetric(db as any, bundle, 'money_received', 1, 50);
      expect(page1.page.rows.length).toBe(50);
      expect(page1.page.queryShape.skip).toBe(0);
      expect(page1.page.queryShape.take).toBe(50);
      expect(page1.page.queryShape.whereHasParentReturnedVoid).toBe(false);
      expect(page1.reconcile.ok).toBe(true);

      const findManyCalls = dbStore.__calls.filter(
        (c) => c.model === 'salesPayment' && c.method === 'findMany',
      );
      expect(findManyCalls.length).toBe(1);

      let sum100 = 0;
      let sum50 = 0;
      const totalPages100 = Math.ceil(page1.page.totalCount / 100);
      const totalPages50 = Math.ceil(page1.page.totalCount / 50);
      for (let p = 1; p <= totalPages100; p++) {
        const page = await fetchDrillPage(db as any, bundle.scope, {
          metricId: 'money_received',
          page: p,
          pageSize: 100,
        });
        sum100 += page.rows.reduce((s, r) => s + r.amountPence, 0);
      }
      for (let p = 1; p <= totalPages50; p++) {
        const page = await fetchDrillPage(db as any, bundle.scope, {
          metricId: 'money_received',
          page: p,
          pageSize: 50,
        });
        sum50 += page.rows.reduce((s, r) => s + r.amountPence, 0);
      }
      expect(sum100).toBe(headline);
      expect(sum50).toBe(headline);
    },
    30_000,
  );

  it('complete streamed export for 5100 rows reconciles; no silent truncation', async () => {
    dbStore.__calls.length = 0;
    const bundle = await computeMoneyReceivedBundleFromDb(db, {
      businessId: dataset.bizA,
      currency: 'GHS',
      periodStart: new Date('2026-03-01T00:00:00.000Z'),
      periodEndInclusive: new Date('2026-04-01T00:00:00.000Z'),
      branchIds: [dataset.branchA1],
      absoluteBounds: true,
    });
    const csv = await buildMoneyReceivedExportCsv(db as any, bundle, {
      drillMetricId: 'money_received',
      pageSize: 500,
    });
    expect(csv).toContain('exportCompleteness,COMPLETE_STREAM');
    expect(csv).toContain('drillRowCountExported,5100');
    expect(csv).toContain('drillReconcilesToHeadline,YES');
    expect(csv).not.toContain('PARTIAL_EXPORT_CAP');
    const findMany = dbStore.__calls.filter((c) => c.method === 'findMany');
    expect(findMany.length).toBeGreaterThanOrEqual(11);
    expect(findMany.every((c) => (c.args as any).take <= 500)).toBe(true);
    // spreadsheet escape on source ids with formula-like content not required here;
    // covered in unit suite — assert stable source refs exist
    expect(csv).toContain('pay-bulk-00000');
  });

  it('refund drill-down reconciles; CT19 scope mismatch refuses', async () => {
    const feb = await computeMoneyReceivedBundleFromDb(db, {
      businessId: dataset.bizA,
      currency: 'GHS',
      periodStart: new Date('2026-02-01T00:00:00.000Z'),
      periodEndInclusive: new Date('2026-03-01T00:00:00.000Z'),
      branchIds: [dataset.branchA1],
      absoluteBounds: true,
    });
    const drill = await drillDownForMetric(db as any, feb, 'refund_outflows', 1, 50);
    expect(drill.page.rows).toHaveLength(1);
    expect(drill.page.rows[0]!.sourceType).toBe('SalesReturnRefund');
    expect(drill.reconcile.ok).toBe(true);

    const mismatched = reconcileMoneyReceivedToDetailSum(
      feb.byId.refund_outflows,
      20000,
      febScope(), // same branch — should ok
    );
    expect(mismatched.ok).toBe(true);
    const refuse = reconcileMoneyReceivedToDetailSum(feb.byId.refund_outflows, 20000, janScope([dataset.branchA2]));
    expect(refuse.ok).toBe(false);
    expect(refuse.reason).toBe('SCOPE_MISMATCH');
  });
});

describe('Step 5B preview-equivalent — access and surface', () => {
  it('Owner/Manager allowed; Cashier denied; cross-tenant and unassigned branch denied', () => {
    expect(
      resolveMoneyReceivedAccess({
        actor: dataset.users.ownerA,
        authorisedStoreIds: dataset.authorisedStoresA,
      }).ok,
    ).toBe(true);
    expect(
      resolveMoneyReceivedAccess({
        actor: dataset.users.managerA,
        authorisedStoreIds: dataset.authorisedStoresA,
        requestedStoreId: dataset.branchA1,
      }).ok,
    ).toBe(true);
    const cashier = resolveMoneyReceivedAccess({
      actor: dataset.users.cashierA,
      authorisedStoreIds: dataset.authorisedStoresA,
    });
    expect(cashier.ok).toBe(false);
    const cross = resolveMoneyReceivedAccess({
      actor: dataset.users.ownerA,
      requestedBusinessId: dataset.bizB,
      authorisedStoreIds: dataset.authorisedStoresA,
    });
    expect(cross.ok).toBe(false);
    if (!cross.ok) expect(cross.reason).toBe('TENANT_MISMATCH');
    const branch = resolveMoneyReceivedAccess({
      actor: dataset.users.managerA,
      requestedStoreId: dataset.branchB1,
      authorisedStoreIds: dataset.authorisedStoresA,
    });
    expect(branch.ok).toBe(false);
    if (!branch.ok) expect(branch.reason).toBe('BRANCH_NOT_AUTHORISED');
  });

  it('product surface copy excludes unrelated Phase 1 cards and distinguishes sales', () => {
    const page = readFileSync(
      join(process.cwd(), 'app/(protected)/reports/money-received/page.tsx'),
      'utf8',
    );
    expect(page).toContain('title="Money Received"');
    expect(page).toContain('separate from sales totals');
    expect(page).toContain('Refund outflows');
    expect(page).toContain('Needs MoMo confirmation');
    expect(page).toContain('Sale amend (money out)');
    expect(page).toContain('/reports/momo-confirmation');
    expect(page).toContain('resolveMoneyReceivedAccess');
    expect(page).toContain('drillDownForMetric');
    expect(page).toContain('classifyMoneyReceivedRowKind');
    expect(page).not.toContain('Gross Profit');
    expect(page).not.toContain('Owner Home');
    expect(page).not.toContain('Command Center');
    expect(page).not.toContain('inventory');
    expect(page).not.toContain('font-mono text-xs');
  });
});

describe('Step 5B preview-equivalent — query-shape and consumer parity', () => {
  it('headline uses aggregate; methods use groupBy; no parent RETURNED/VOID in receipt where', async () => {
    dbStore.__calls.length = 0;
    await computeMoneyReceivedBundleFromDb(db, {
      businessId: dataset.bizA,
      currency: 'GHS',
      periodStart: new Date('2026-01-01T00:00:00.000Z'),
      periodEndInclusive: new Date('2026-02-01T00:00:00.000Z'),
      branchIds: [dataset.branchA1],
      absoluteBounds: true,
    });
    const aggregates = dbStore.__calls.filter((c) => c.method === 'aggregate');
    const groupBys = dbStore.__calls.filter((c) => c.method === 'groupBy');
    expect(aggregates.length).toBeGreaterThanOrEqual(2);
    expect(groupBys.length).toBeGreaterThanOrEqual(1);
    for (const call of [...aggregates, ...groupBys]) {
      if (call.model !== 'salesPayment') continue;
      const text = JSON.stringify(call.args);
      expect(text).toContain('businessId');
      expect(text).toContain('"gte"');
      expect(text).toContain('"lt"');
      expect(text).not.toMatch(/paymentStatus.*RETURNED/);
    }
  });

  it('dataset size and indexes documented in source', () => {
    expect(dataset.payments.length).toBeGreaterThan(5100);
    const schema = readFileSync(join(process.cwd(), 'prisma/schema.prisma'), 'utf8');
    expect(schema).toContain('@@index([status, receivedAt])');
    expect(schema).toContain('@@index([receivedAt])');
    expect(schema).toContain('@@index([salesInvoiceId, receivedAt])');
  });
});
