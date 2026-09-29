import { NextResponse } from 'next/server';
import { guardLiveReport } from '@/lib/entitlements/live-report';
import { getIncomeStatement, getBalanceSheet, getCashflow } from '@/lib/reports/financials';
import { formatMoney } from '@/lib/format';
import { businessMonthWindow, requireReportTimeZone } from '@/lib/reports/reporting-clock';
import { resolveReportDateRange } from '@/lib/reports/date-parsing';
import { formatBusinessLocalDateKey } from '@/lib/notifications/utils';

export async function GET(request: Request) {
  const url = new URL(request.url);
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
    const data = await getBalanceSheet(business.id, to);
    filename = `balance-sheet-${to.toISOString().slice(0, 10)}.csv`;
    rows = [
      ['Balance Sheet', `As of ${to.toDateString()}`],
      ['Currency', currency],
      [],
      ['ASSETS'],
      ...data.assets.map((a) => [a.name, formatMoney(a.balancePence, currency)]),
      ['Total Assets', formatMoney(data.totalAssets, currency)],
      [],
      ['LIABILITIES'],
      ...data.liabilities.map((l) => [l.name, formatMoney(l.balancePence, currency)]),
      ['Total Liabilities', formatMoney(data.totalLiabilities, currency)],
      [],
      ['EQUITY'],
      ...data.equity.map((e) => [e.name, formatMoney(e.balancePence, currency)]),
      ['Total Equity', formatMoney(data.totalEquity, currency)],
    ];
  } else if (type === 'cashflow') {
    const data = await getCashflow(business.id, from, to);
    filename = `cashflow-${from.toISOString().slice(0, 10)}.csv`;
    rows = [
      ['Cashflow Statement', `${from.toDateString()} - ${to.toDateString()}`],
      ['Currency', currency],
      [],
      ['Line Item', 'Amount'],
      ['Net Profit', moneyOrIncomplete(data.netProfit)],
      ['AR Change', formatMoney(data.arChange, currency)],
      ['AP Change', formatMoney(data.apChange, currency)],
      ['Inventory Change', formatMoney(data.invChange, currency)],
      ['Net Cash from Operations', moneyOrIncomplete(data.netCashFromOps)],
      [],
      ['Beginning Cash', formatMoney(data.beginningCash, currency)],
      ['Ending Cash', moneyOrIncomplete(data.endingCash)],
    ];
  } else {
    return NextResponse.json({ error: 'Unknown report type' }, { status: 400 });
  }

  const csv = rows.map((row) => row.map((cell) => `"${cell}"`).join(',')).join('\n');

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
