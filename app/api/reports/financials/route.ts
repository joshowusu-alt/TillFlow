import { NextResponse } from 'next/server';
import { requireBusiness } from '@/lib/auth';
import { getIncomeStatement, getBalanceSheet, getCashflow } from '@/lib/reports/financials';
import { formatMoney } from '@/lib/format';

export async function GET(request: Request) {
  const { business } = await requireBusiness(['MANAGER', 'OWNER']);
  if (!business) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const type = url.searchParams.get('type') ?? 'income-statement';
  const currency = business.currency;

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const from = url.searchParams.get('from') ? new Date(url.searchParams.get('from')!) : monthStart;
  const to = url.searchParams.get('to') ? new Date(url.searchParams.get('to')!) : now;
  to.setHours(23, 59, 59, 999);

  let rows: string[][] = [];
  let filename = '';

  if (type === 'income-statement') {
    const data = await getIncomeStatement(business.id, from, to);
    filename = `income-statement-${from.toISOString().slice(0, 10)}.csv`;
    rows = [
      ['Income Statement', `${from.toDateString()} - ${to.toDateString()}`],
      [],
      ['Line Item', 'Amount'],
      ['Revenue', formatMoney(data.revenue, currency)],
      ['Cost of Goods Sold', formatMoney(data.cogs, currency)],
      ['Gross Profit', formatMoney(data.grossProfit, currency)],
      ['Operating Expenses', formatMoney(data.otherExpenses, currency)],
      ['Net Profit', formatMoney(data.netProfit, currency)],
    ];
  } else if (type === 'balance-sheet') {
    const data = await getBalanceSheet(business.id, to);
    filename = `balance-sheet-${to.toISOString().slice(0, 10)}.csv`;
    rows = [
      ['Balance Sheet', `As of ${to.toDateString()}`],
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
      [],
      ['Line Item', 'Amount'],
      ['Net Profit', formatMoney(data.netProfit, currency)],
      ['AR Change', formatMoney(data.arChange, currency)],
      ['AP Change', formatMoney(data.apChange, currency)],
      ['Inventory Change', formatMoney(data.invChange, currency)],
      ['Net Cash from Operations', formatMoney(data.netCashFromOps, currency)],
      [],
      ['Beginning Cash', formatMoney(data.beginningCash, currency)],
      ['Ending Cash', formatMoney(data.endingCash, currency)],
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
