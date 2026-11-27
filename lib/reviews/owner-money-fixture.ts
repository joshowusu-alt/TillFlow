import type { MoneyReceivedBundle } from '@/lib/reports/money-received/service';
import type { DrillPageResult } from '@/lib/reports/money-received/query';
import type { MetricResult, MoneyReceivedDrillRow, ReconcileResult } from '@/lib/reports/money-received/types';

export function moneyFixture(scenario = 'normal') {
  const now = new Date('2026-11-27T15:00:00Z');
  const scope = { businessId: 'synthetic-business', branchIds: ['main'], currency: 'GHS', timeZone: 'Africa/Accra',
    periodStart: new Date('2026-11-27T00:00:00Z'), periodEndExclusive: new Date('2026-11-28T00:00:00Z'), asOf: now, definitionVersion: 'fixture' };
  const failed = scenario === 'failed';
  const empty = scenario === 'empty';
  const total = scenario === 'large' ? 12345678900 : empty ? 0 : 153950;
  const cash = empty ? 0 : total - 50000;
  const values = { money_received: total, refund_outflows: empty ? 0 : 2000, unverified_legacy_receipts: empty ? 0 : 24800,
    money_received_cash: cash, money_received_momo: empty ? 0 : 50000, money_received_card: 0, money_received_transfer: 0, money_received_other: 0 };
  const results: MetricResult[] = Object.entries(values).map(([metricId, valuePence]) => ({ ...scope, metricId,
    valuePence: failed ? null : valuePence, qualityState: failed ? 'QUERY_FAILED' : 'COMPLETE',
    dependencyReason: failed ? 'QUERY_FAILED' : null, sourceRevision: 'fixture', recordCount: empty ? 0 : 1 }));
  const reconcile: ReconcileResult = { ok: !failed && scenario !== 'mismatch', reason: failed ? 'QUERY_FAILED' : scenario === 'mismatch' ? 'MISMATCH' : null, headlinePence: failed ? null : total, detailSumPence: failed ? null : total };
  const bundle: MoneyReceivedBundle = { scope, results, byId: Object.fromEntries(results.map(row => [row.metricId, row])),
    quality: { overall: failed ? 'QUERY_FAILED' : empty ? 'COMPLETE' : 'UNVERIFIED', legacyWarning: !failed && !empty, unverifiedPence: failed ? null : values.unverified_legacy_receipts, messages: [] },
    methodReconcile: reconcile, source: 'fixture-facts' };
  const row: MoneyReceivedDrillRow = { sourceType: 'SalesPayment', sourceId: 'payment-1', amountPence: cash + 2000,
    method: 'CASH', status: 'CONFIRMED', eventAt: now, salesInvoiceId: 'sale-1', transactionNumber: 'SAL-000001',
    branchId: 'main', includedInMetricId: 'money_received' };
  const rows = failed || empty ? [] : [row, { ...row, sourceId: 'payment-2', amountPence: -2000, transactionNumber: 'SAL-000002' },
    { ...row, sourceId: 'payment-3', method: 'MOBILE_MONEY', amountPence: 50000, transactionNumber: 'SAL-000003' }];
  const page: DrillPageResult = { rows, page: 1, pageSize: 25, totalCount: rows.length, totalPages: 1, queryFailed: failed,
    queryShape: { skip: 0, take: 25, orderBy: {}, whereHasBusinessId: true, whereHasPeriod: true, whereHasStatusPredicate: true, whereHasParentReturnedVoid: false } };
  return { now, bundle, drill: { page, reconcile } };
}
