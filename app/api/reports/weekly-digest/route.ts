import { NextResponse } from 'next/server';
import { requireBusiness } from '@/lib/auth';
import { getWeeklyDigestData } from '@/lib/reports/weekly-digest';
import { formatMoney } from '@/lib/format';
import { businessWeekWindow } from '@/lib/reports/reporting-clock';

export async function GET(request: Request) {
  const { business } = await requireBusiness(['MANAGER', 'OWNER']);
  if (!business) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const weekOffset = Number(url.searchParams.get('week') ?? -1);

  const week = businessWeekWindow(new Date(), business.timezone, weekOffset);
  const wStart = week.startInclusive;
  const wEnd = new Date(week.endExclusive.getTime() - 1);

  const data = await getWeeklyDigestData(business.id, week.startInclusive, week.endExclusive, business.timezone);
  const currency = business.currency;
  const moneyOrIncomplete = (pence: number | null) => (
    pence == null ? 'Costs incomplete' : formatMoney(pence, currency)
  );
  const percentOrIncomplete = (value: number | null) => (
    value == null ? 'Costs incomplete' : `${value}%`
  );

  const rows: string[][] = [
    ['Weekly Digest', `${wStart.toDateString()} - ${wEnd.toDateString()}`],
    ['Currency', currency],
    [],
    ['Metric', 'Value'],
    ['Total Sales', formatMoney(data.totalSalesPence, currency)],
    ['Gross Profit', moneyOrIncomplete(data.grossProfitPence)],
    ['GP %', percentOrIncomplete(data.gpPercent)],
    ['Transactions', String(data.txCount)],
    ['Voids', String(data.voidCount)],
    ['Returns', String(data.returnCount)],
    ['Discount Overrides', String(data.discountOverrides)],
    ['Stock Adjustments', String(data.adjustmentCount)],
    [],
    ['Previous Week Comparison'],
    ['Prev Sales', formatMoney(data.prevTotalSalesPence, currency)],
    ['Prev GP', moneyOrIncomplete(data.prevGrossProfitPence)],
    ['Prev Transactions', String(data.prevTxCount)],
    [],
    ['Total Receipts', formatMoney(data.totalReceiptsPence, currency)],
    ['Payment Receipts Method', 'Amount'],
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
