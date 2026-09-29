import { NextResponse } from 'next/server';
import { guardLiveReport } from '@/lib/entitlements/live-report';
import { addCalendarDays } from '@/lib/entitlements/range';
import { getWeeklyDigestData } from '@/lib/reports/weekly-digest';
import { formatMoney } from '@/lib/format';
import { businessWeekWindow, requireReportTimeZone } from '@/lib/reports/reporting-clock';
import { formatBusinessLocalDateKey } from '@/lib/notifications/utils';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const search = Object.fromEntries(url.searchParams.entries());
  const guarded = await guardLiveReport({
    surfaceId: 'export_weekly_digest',
    action: 'EXPORT',
    search,
    range: ({ timezone, now }) => {
      const timeZone = requireReportTimeZone(timezone);
      const weekOffset = Number(search.week ?? -1);
      const week = businessWeekWindow(now, timeZone, Number.isFinite(weekOffset) ? weekOffset : -1);
      const start = formatBusinessLocalDateKey(week.startInclusive, timeZone);
      const end = formatBusinessLocalDateKey(new Date(week.endExclusive.getTime() - 1), timeZone);
      return { fromLocalDate: start, toLocalDate: end || addCalendarDays(start, 6), preset: 'CUSTOM' };
    },
  });
  if (!guarded.ok) {
    return NextResponse.json(guarded.body, { status: guarded.status, headers: guarded.headers });
  }
  if (guarded.branch.kind !== 'stores') {
    return NextResponse.json(
      { ok: false, reason: 'SCOPE_STORE_INVALID', surfaceId: 'export_weekly_digest' },
      { status: 403, headers: guarded.headers },
    );
  }
  const { business } = guarded;

  const weekOffset = Number(search.week ?? -1);
  const timeZone = requireReportTimeZone(business.timezone);
  const storeIds = guarded.branch.storeIds;
  const week = businessWeekWindow(new Date(), timeZone, Number.isFinite(weekOffset) ? weekOffset : -1);
  const wStart = week.startInclusive;
  const wEnd = new Date(week.endExclusive.getTime() - 1);

  const data = await getWeeklyDigestData(
    business.id,
    week.startInclusive,
    week.endExclusive,
    timeZone,
    storeIds,
  );
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
