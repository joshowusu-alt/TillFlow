import { NextResponse } from 'next/server';
import { requireBusiness } from '@/lib/auth';
import { getWeeklyDigestData } from '@/lib/reports/weekly-digest';
import { formatMoney } from '@/lib/format';

function weekStart(offsetWeeks = 0) {
  const d = new Date();
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1 - day) + offsetWeeks * 7;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function GET(request: Request) {
  const { business } = await requireBusiness(['MANAGER', 'OWNER']);
  if (!business) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const weekOffset = Number(url.searchParams.get('week') ?? -1);

  const wStart = weekStart(weekOffset);
  const wEnd = new Date(wStart);
  wEnd.setDate(wEnd.getDate() + 6);
  wEnd.setHours(23, 59, 59, 999);

  const data = await getWeeklyDigestData(business.id, wStart, wEnd);
  const currency = business.currency;

  const rows: string[][] = [
    ['Weekly Digest', `${wStart.toDateString()} - ${wEnd.toDateString()}`],
    [],
    ['Metric', 'Value'],
    ['Total Sales', formatMoney(data.totalSalesPence, currency)],
    ['Gross Profit', formatMoney(data.grossProfitPence, currency)],
    ['GP %', `${data.gpPercent}%`],
    ['Transactions', String(data.txCount)],
    ['Voids', String(data.voidCount)],
    ['Returns', String(data.returnCount)],
    ['Discount Overrides', String(data.discountOverrides)],
    ['Stock Adjustments', String(data.adjustmentCount)],
    [],
    ['Previous Week Comparison'],
    ['Prev Sales', formatMoney(data.prevTotalSalesPence, currency)],
    ['Prev GP', formatMoney(data.prevGrossProfitPence, currency)],
    ['Prev Transactions', String(data.prevTxCount)],
    [],
    ['Payment Method', 'Amount'],
    ...Object.entries(data.paymentSplit).map(([method, amount]) => [
      method.replace('_', ' '),
      formatMoney(amount, currency),
    ]),
    [],
    ['Top Sellers', 'Revenue'],
    ...data.topSellers.map((p) => [p.name, formatMoney(p.revenue, currency)]),
    [],
    ['Top Margin Items', 'Margin %'],
    ...data.topMargin.map((p) => [p.name, `${p.marginPct}%`]),
    [],
    ['Cashier', 'Sales', 'Transactions'],
    ...data.cashierPerf.map((c) => [c.name, formatMoney(c.sales, currency), String(c.tx)]),
  ];

  const csv = rows.map((row) => row.map((cell) => `"${cell}"`).join(',')).join('\n');

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="weekly-digest-${wStart.toISOString().slice(0, 10)}.csv"`,
    },
  });
}
