import { NextResponse } from 'next/server';
import { requireBusiness } from '@/lib/auth';
import { getFeatures } from '@/lib/features';
import { getIncomeStatement, getBalanceSheet, getCashflow } from '@/lib/reports/financials';
import { formatMoney } from '@/lib/format';
import { businessMonthWindow, localDateInstant } from '@/lib/reports/reporting-clock';

export async function GET(request: Request) {
  const { business } = await requireBusiness(['MANAGER', 'OWNER']);
  if (!business) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const type = url.searchParams.get('type') ?? 'income-statement';
  const currency = business.currency;
  const features = getFeatures((business as any).plan ?? (business.mode as any), (business as any).storeMode as any);

  if ((type === 'income-statement' || type === 'balance-sheet' || type === 'cashflow') && !features.financialReports) {
    return NextResponse.json({ error: 'Growth plan required' }, { status: 403 });
  }

  const now = new Date();
  const month = businessMonthWindow(now, business.timezone);
  const from = localDateInstant(url.searchParams.get('from'), 'start', business.timezone) ?? month.startInclusive;
  const to = localDateInstant(url.searchParams.get('to'), 'endExclusive', business.timezone) ?? month.endExclusive;

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
