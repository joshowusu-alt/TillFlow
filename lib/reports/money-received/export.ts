import { methodLabel } from './reconcile';
import { iterateDrillPages, type Db } from './query';
import type { MoneyReceivedBundle } from './service';
import type { MoneyReceivedDrillRow, MoneyReceivedMetricId } from './types';

function csvEscape(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/** Prefix spreadsheet-sensitive cells so Excel/Sheets do not execute formulas. */
export function spreadsheetSafeCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  if (/^[=+\-@]/.test(text) || text.startsWith('\t')) {
    return `'${text}`;
  }
  return text;
}

function money(pence: number | null): string {
  if (pence === null) return '';
  return (pence / 100).toFixed(2);
}

function pushLine(cols: Array<string | number | null | undefined>): string {
  return `${cols.map((c) => csvEscape(spreadsheetSafeCell(c))).join(',')}\n`;
}

/**
 * Complete canonical export: streams all matching drill rows via bounded DB pages.
 * Never silently truncates. Does not load the full history into one array before writing.
 */
export async function* iterMoneyReceivedExportCsvChunks(
  db: Db,
  bundle: MoneyReceivedBundle,
  options?: { drillMetricId?: MoneyReceivedMetricId; pageSize?: number },
): AsyncGenerator<string, void, unknown> {
  const drillMetricId = options?.drillMetricId ?? 'money_received';
  const pageSize = options?.pageSize ?? 500;
  const { scope, byId, quality, methodReconcile } = bundle;

  yield pushLine(['section', 'field', 'value']);
  yield pushLine(['meta', 'report', 'Payments and Money Received']);
  yield pushLine(['meta', 'businessId', scope.businessId]);
  yield pushLine(['meta', 'branchScope', scope.branchIds === null ? 'ALL' : scope.branchIds.join('|')]);
  yield pushLine(['meta', 'currency', scope.currency]);
  yield pushLine(['meta', 'timeZone', scope.timeZone]);
  yield pushLine(['meta', 'periodStart', scope.periodStart.toISOString()]);
  yield pushLine(['meta', 'periodEndExclusive', scope.periodEndExclusive.toISOString()]);
  yield pushLine(['meta', 'asOf', scope.asOf.toISOString()]);
  yield pushLine(['meta', 'definitionVersion', scope.definitionVersion]);
  yield pushLine(['meta', 'qualityState', quality.overall]);
  yield pushLine(['meta', 'legacyWarning', quality.legacyWarning ? 'YES' : 'NO']);
  yield pushLine(['meta', 'methodBreakdownReconcileOk', methodReconcile.ok ? 'YES' : 'NO']);
  yield pushLine(['meta', 'methodBreakdownReconcileReason', methodReconcile.reason ?? '']);
  yield pushLine(['meta', 'exportCompleteness', 'COMPLETE_STREAM']);

  const metricOrder: MoneyReceivedMetricId[] = [
    'money_received',
    'money_received_cash',
    'money_received_momo',
    'money_received_card',
    'money_received_transfer',
    'money_received_other',
    'unverified_legacy_receipts',
    'refund_outflows',
  ];

  yield pushLine(['section', 'metricId', 'valuePence', 'valueMajor', 'qualityState', 'recordCount']);
  for (const id of metricOrder) {
    const m = byId[id];
    if (!m) continue;
    yield pushLine([
      'metric',
      m.metricId,
      m.valuePence === null ? '' : m.valuePence,
      money(m.valuePence),
      m.qualityState,
      m.recordCount,
    ]);
  }

  yield pushLine(['meta', 'drillMetricId', drillMetricId]);
  yield pushLine([
    'section',
    'sourceType',
    'sourceId',
    'amountPence',
    'amountMajor',
    'method',
    'status',
    'eventAt',
    'salesInvoiceId',
    'branchId',
    'includedInMetricId',
  ]);

  let exportedCount = 0;
  let exportedSum = 0;
  for await (const pageRows of iterateDrillPages(db, scope, drillMetricId, pageSize)) {
    for (const row of pageRows) {
      exportedCount += 1;
      exportedSum += row.amountPence;
      yield pushLine([
        'drill',
        row.sourceType,
        row.sourceId,
        row.amountPence,
        money(row.amountPence),
        row.method ? methodLabel(row.method) : '',
        row.status,
        row.eventAt.toISOString(),
        row.salesInvoiceId,
        row.branchId,
        row.includedInMetricId,
      ]);
    }
  }

  const headline = byId[drillMetricId];
  const reconciles =
    headline &&
    headline.valuePence !== null &&
    exportedSum === headline.valuePence;

  yield pushLine(['meta', 'drillRowCountExported', exportedCount]);
  yield pushLine(['meta', 'drillDetailSumPence', exportedSum]);
  yield pushLine(['meta', 'drillReconcilesToHeadline', reconciles ? 'YES' : 'NO']);
}

/** Collect streamed export into a string (tests / small responses). */
export async function buildMoneyReceivedExportCsv(
  db: Db,
  bundle: MoneyReceivedBundle,
  options?: { drillMetricId?: MoneyReceivedMetricId; pageSize?: number },
): Promise<string> {
  const parts: string[] = [];
  for await (const chunk of iterMoneyReceivedExportCsvChunks(db, bundle, options)) {
    parts.push(chunk);
  }
  return parts.join('');
}

/** Fixture helper: build CSV from pre-materialised drill rows (tests only). */
export function buildMoneyReceivedExportCsvFromRows(
  bundle: MoneyReceivedBundle,
  rows: MoneyReceivedDrillRow[],
  drillMetricId: MoneyReceivedMetricId = 'money_received',
): string {
  const { scope, byId, quality, methodReconcile } = bundle;
  const lines: string[] = [];
  const push = (cols: Array<string | number | null | undefined>) => {
    lines.push(cols.map((c) => csvEscape(spreadsheetSafeCell(c))).join(','));
  };
  push(['section', 'field', 'value']);
  push(['meta', 'report', 'Payments and Money Received']);
  push(['meta', 'businessId', scope.businessId]);
  push(['meta', 'exportCompleteness', 'COMPLETE_FROM_ROWS']);
  push(['meta', 'qualityState', quality.overall]);
  push(['meta', 'methodBreakdownReconcileOk', methodReconcile.ok ? 'YES' : 'NO']);
  const sum = rows.reduce((s, r) => s + r.amountPence, 0);
  const headline = byId[drillMetricId];
  push(['meta', 'drillRowCountExported', rows.length]);
  push(['meta', 'drillDetailSumPence', sum]);
  push([
    'meta',
    'drillReconcilesToHeadline',
    headline && headline.valuePence !== null && sum === headline.valuePence ? 'YES' : 'NO',
  ]);
  push([
    'section',
    'sourceType',
    'sourceId',
    'amountPence',
    'amountMajor',
    'method',
    'status',
    'eventAt',
    'salesInvoiceId',
    'branchId',
    'includedInMetricId',
  ]);
  for (const row of rows) {
    push([
      'drill',
      row.sourceType,
      row.sourceId,
      row.amountPence,
      money(row.amountPence),
      row.method ? methodLabel(row.method) : '',
      row.status,
      row.eventAt.toISOString(),
      row.salesInvoiceId,
      row.branchId,
      row.includedInMetricId,
    ]);
  }
  return `${lines.join('\n')}\n`;
}
