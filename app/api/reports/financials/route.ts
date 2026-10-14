import { NextResponse } from 'next/server';
import { guardLiveReport } from '@/lib/entitlements/live-report';
import { getIncomeStatement, getBalanceSheet, getCashflow } from '@/lib/reports/financials';
import { cashflowStatementRows } from '@/lib/reports/cashflow-statement';
import { formatMoney } from '@/lib/format';
import { businessMonthWindow, requireReportTimeZone } from '@/lib/reports/reporting-clock';
import { resolveReportDateRange } from '@/lib/reports/date-parsing';
import { formatBusinessLocalDateKey } from '@/lib/notifications/utils';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const distinctStores = new Set(url.searchParams.getAll('storeId').map((value) => value.trim()).filter(Boolean));
  if (distinctStores.size > 1) {
    return NextResponse.json(
      { ok: false, reason: 'SCOPE_STORE_INVALID', surfaceId: 'export_financials' },
      { status: 403, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  const search = Object.fromEntries(url.searchParams.entries());
  const guarded = await guardLiveReport({
    surfaceId: 'export_financials',
    action: 'EXPORT',
    search,
    range: ({ timezone, now }) => {
      if (search.from || search.to) {
        return { fromLocalDate: search.from ?? '', toLocalDate: search.to ?? '', preset: 'CUSTOM' };
      }
      const today = formatBusinessLocalDateKey(now, timezone);
      return { fromLocalDate: `${today.slice(0, 8)}01`, toLocalDate: today, preset: 'MONTH_TO_DATE' };
    },
  });
  if (!guarded.ok) {
    return NextResponse.json(guarded.body, { status: guarded.status, headers: guarded.headers });
  }
  if (guarded.branch.kind !== 'label') {
    return NextResponse.json(
      { ok: false, reason: 'SCOPE_STORE_INVALID', surfaceId: 'export_financials' },
      { status: 403, headers: guarded.headers },
    );
  }
  const { business } = guarded;

  const type = search.type ?? 'income-statement';
  const currency = business.currency;

  const now = new Date();
  const month = businessMonthWindow(now, requireReportTimeZone(business.timezone));
  const applied = guarded.decision.appliedRange;
  const { start: from, end: to } = resolveReportDateRange(
    applied ? { from: applied.fromLocalDate, to: applied.toLocalDate } : { from: search.from, to: search.to },
    month.startInclusive,
    now,
    month.timeZone,
  );

  let rows: string[][] = [];
  let filename = '';
  const moneyOrIncomplete = (pence: number | null) => (
    pence == null ? 'Costs incomplete' : formatMoney(pence, currency)
  );

  if (type === 'income-statement') {
    const data = await getIncomeStatement(business.id, from, to);
    filename = `income-statement-${from.toISOString().slice(0, 10)}.csv`;
    rows = [
      ['Income Statement', `${from.toDateString()} - ${to.toDateString()}`],
      ['Currency', currency],
      [],
      ['Line Item', 'Amount'],
      ['Revenue', formatMoney(data.revenue, currency)],
      ['Cost of Goods Sold', moneyOrIncomplete(data.cogs)],
      ['Gross Profit', moneyOrIncomplete(data.grossProfit)],
      ['Other Operating Income', formatMoney(data.otherOperatingIncome, currency)],
      ['Operating Expenses', formatMoney(data.otherExpenses, currency)],
      ['Net Profit', moneyOrIncomplete(data.netProfit)],
    ];
  } else if (type === 'balance-sheet') {
    const statementDate = applied?.toLocalDate ?? formatBusinessLocalDateKey(new Date(to.getTime() - 1), month.timeZone);
    if (statementDate > formatBusinessLocalDateKey(now, month.timeZone)) {
      return NextResponse.json({ error: 'Choose a statement date that is not in the future' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
    }
    const data = await getBalanceSheet(business.id, new Date(Math.min(to.getTime(), now.getTime())));
    filename = `balance-sheet-${statementDate}.csv`;
    rows = [
      ['Balance Sheet', `As of ${statementDate} (${month.timeZone}); today stops at request time`],
      ['Currency', currency],
      ['Basis', 'Recorded opening balances and transactions'],
      [],
      ['ASSETS'],
      ...data.assets.map((a) => [a.accountCode === '1010' ? 'Bank & MoMo' : a.name, formatMoney(a.balancePence, currency)]),
      ['Total Assets', formatMoney(data.totalAssets, currency)],
      [],
      ['LIABILITIES'],
      ...data.liabilities.map((l) => [l.name, formatMoney(l.balancePence, currency)]),
      ['Total Liabilities', formatMoney(data.totalLiabilities, currency)],
      [],
      ['EQUITY'],
      ...data.equity.map((e) => [e.accountCode === 'CURRENT_PROFIT' ? 'Profit to date' : e.name, formatMoney(e.balancePence, currency)]),
      ['Total Equity', formatMoney(data.totalEquity, currency)],
      ['Total Liabilities and Equity', formatMoney(data.totalLiabilities + data.totalEquity, currency)],
    ];
    const notes: string[][] = [];
    if (statementDate === formatBusinessLocalDateKey(now, month.timeZone) && data.reconciliation.stockValueIncomplete) notes.push(['Stock costs', 'Some stock has no cost entry']);
    if (data.reconciliation.profitIncomplete) notes.push(['Sales costs', 'Some sales have no product cost recorded; profit to date uses posted income and expense entries']);
    if (data.legacyCapitalPence !== 0) notes.push(['Undated opening capital setting (separate from opening balance entries)', formatMoney(data.legacyCapitalPence, currency)]);
    if (data.reconciliation.equationDifferencePence !== 0) notes.push(['Entry difference', formatMoney(data.reconciliation.equationDifferencePence, currency)]);
    if (notes.length) rows.push([], ['REPORT NOTES'], ...notes);
  } else if (type === 'cashflow') {
    const end = new Date(Math.min(to.getTime(), now.getTime()));
    if (from >= end || (applied?.toLocalDate ?? search.to ?? '') > formatBusinessLocalDateKey(now, month.timeZone)) {
      return NextResponse.json({ error: 'Choose a valid period ending today or earlier' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
    }
    const data = await getCashflow(business.id, from, end);
    const direct = search.view === 'direct';
    filename = 'cashflow-' + (direct ? 'receipts-payments' : 'indirect') + '-' + from.toISOString().slice(0, 10) + '.csv';
    rows = [
      ['Cash-flow statement', (applied?.fromLocalDate ?? search.from ?? from.toISOString()) + ' to ' + (applied?.toLocalDate ?? search.to ?? to.toISOString())],
      ['Method', direct ? 'Money received and paid' : 'Indirect'],
      ['Currency', currency],
      ['Basis', 'Recorded opening balances and transactions; cash, bank and MoMo'],
      ['Time zone', month.timeZone],
      [], ['Line item', 'Amount'],
      ...cashflowStatementRows(data, direct).map(row => [row.label, formatMoney(row.amountPence, currency)]),
    ];
    if (data.missingSaleCostCount) rows.push(['Sales costs', 'Some sales have no product cost entry; profit uses posted income and expenses']);
    if (data.otherEntryCount) rows.push(['Other movement entries', String(data.otherEntryCount)]);
    if (data.operatingDifferencePence !== 0 || data.movementDifferencePence !== 0) rows.push(
      ['Operating entry difference', formatMoney(data.operatingDifferencePence, currency)],
      ['Money movement difference', formatMoney(data.movementDifferencePence, currency)],
    );
  } else {
    return NextResponse.json({ error: 'Unknown report type' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
  }

  const csv = rows.map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\n');

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
