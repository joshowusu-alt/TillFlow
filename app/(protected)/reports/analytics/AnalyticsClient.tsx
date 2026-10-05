'use client';

import ReportChartData from '@/components/reports/ReportChartData';
import FinancialAmount from '@/components/reports/FinancialAmount';
import { formatMoney } from '@/lib/format';
import { ReportDisclosure, ReportMetric, ReportSalesHero, ReportSection, ReportValueBars } from '@/components/reports/stage3b/ReportPrimitives';
import DailySalesChart from '@/components/reports/stage3b/DailySalesChart';
import BusyTradingTimes from '@/components/reports/stage3b/BusyTradingTimes';

export interface AnalyticsData {
  currency: string; periodDays: number;
  salesTrend: { labels: string[]; values: number[] };
  profitTrend: { labels: string[]; values: number[] };
  hourlyData: { hour: number; day: string; sales: number }[];
  categoryData: { name: string; value: number }[];
  productData: { name: string; revenue: number; profit: number; margin: number }[];
  comparison: { labels: string[]; current: number[]; previous: number[] };
  kpis: {
    totalSales: number; totalProfit: number | null; marginPercent: number | null;
    totalTransactions: number; avgTransaction: number; growthPercent: number; previousPeriodSales: number;
    topSellingProduct: string; peakHour: string;
  };
}

export default function AnalyticsClient({ data }: { data: AnalyticsData; kpis?: AnalyticsData['kpis'] }) {
  const k = data.kpis;
  const c = data.currency;
  const money = (pence: number) => formatMoney(pence, c);
  const growth = k.previousPeriodSales > 0 ? `${k.growthPercent > 0 ? '+' : ''}${k.growthPercent.toFixed(1)}%` : 'No comparison base';
  return <div className="space-y-4 sm:space-y-5 [&_tbody_td]:text-base [&_td_.financial-amount]:!text-base" data-stage3b-report="analytics">
    <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <div data-analytics-amount="revenue"><ReportSalesHero title="Sales revenue" pence={k.totalSales} currency={c} subtitle={`${k.totalTransactions.toLocaleString()} sales · Selected ${data.periodDays}-day period`}>
        <p>{k.previousPeriodSales > 0 ? `${growth} vs the previous ${data.periodDays} days` : 'The earlier period has no positive sales total. Percentage growth is not meaningful.'}</p>
        <p className="mt-1">The selected period includes today so far; the earlier period contains complete calendar days.</p>
      </ReportSalesHero></div>
      <ReportSection title="Sales pattern" description="Revenue shows recorded sales, not cash collected.">
        <dl className="space-y-3 text-sm text-ink">
          <div><dt className="text-slate-600">Top-selling product by recorded revenue</dt><dd className="mt-1 break-words font-semibold">{k.topSellingProduct || 'No product sales recorded'}</dd></div>
          <div><dt className="text-slate-600">Busiest hour by revenue</dt><dd className="mt-1 font-semibold">{k.peakHour || 'No sales recorded'}</dd></div>
          <div><dt className="text-slate-600">Earlier period sales</dt><dd className="financial-fit mt-1"><FinancialAmount pence={k.previousPeriodSales} currency={c} className="!text-base" /></dd></div>
        </dl>
      </ReportSection>
    </div>
    <div className="grid min-w-0 grid-cols-2 gap-3 xl:grid-cols-4" data-analytics-kpis>
      <ReportMetric label="Gross profit" pence={k.totalProfit} value={k.totalTransactions === 0 ? "No sales" : "Costs incomplete"} currency={c} warning={k.totalProfit == null || k.totalProfit < 0} helper="Profit before expenses. Hidden when required costs are incomplete." />
      <ReportMetric label="Gross margin" value={k.marginPercent == null ? (k.totalTransactions === 0 ? 'No sales' : 'Costs incomplete') : `${k.marginPercent.toFixed(1)}%`} currency={c} warning={k.marginPercent == null || k.marginPercent < 0} helper="Gross profit as a share of recorded sales." />
      <ReportMetric label="Average sale" pence={k.totalTransactions > 0 ? k.avgTransaction : null} value="No sales" currency={c} helper="Selected-period sales divided by its sale count." />
      <ReportMetric label="Sales change" value={growth} currency={c} helper={`Vs the previous ${data.periodDays} days. Totals include the incomplete current day.`} />
    </div>
    <div className="grid min-w-0 gap-4 lg:grid-cols-2">
      <ReportSection title="Daily sales" description={`${data.salesTrend.labels.length} dates shown from the selected ${data.periodDays}-day period.`}>
        <DailySalesChart labels={data.salesTrend.labels} values={data.salesTrend.values} currency={c} />
        <ReportChartData title="Revenue trend" columns={['Date', 'Revenue']} rows={data.salesTrend.labels.map((label, i) => [label, money(data.salesTrend.values[i] ?? 0)])}><span className="sr-only">Exact daily sales values are in the figures below.</span></ReportChartData>
      </ReportSection>
      <ReportSection title="Period comparison" description="Total recorded sales in each period. Compare total values, with today still in progress.">
        <ReportChartData title="Period comparison" columns={['Period', 'Revenue']} rows={[[`Selected ${data.periodDays} days`, money(k.totalSales)], [`Previous ${data.periodDays} days`, money(k.previousPeriodSales)]]}>
          <ReportValueBars currency={c} rows={[{ label: `Selected ${data.periodDays} days`, pence: k.totalSales }, { label: `Previous ${data.periodDays} days`, pence: k.previousPeriodSales }]} />
        </ReportChartData>
      </ReportSection>
      <ReportSection title="Top products by sales" description="Up to ten ranked products, plus any unallocated difference. Full names and exact values stay visible.">
        <ReportChartData title="Top products" columns={['Product', 'Revenue']} rows={data.productData.map(row => [row.name, money(row.revenue)])}>
          <ReportValueBars currency={c} rows={data.productData.map(row => ({ label: row.name, pence: row.revenue }))} empty="No product sales in this period." />
        </ReportChartData>
        <p className="mt-3 text-xs leading-5 text-slate-600">Product profit and margin are not shown here until their cost and discount treatment has been verified. Period gross profit keeps the cost-completeness rule.</p>
      </ReportSection>
      <ReportSection title="Category line subtotals" description="Top seven categories · before discounts and invoice-level adjustments. These are not the headline sales total.">
        <ReportChartData title="Sales by category" columns={['Category', 'Line subtotal']} rows={data.categoryData.map(row => [row.name, money(row.value)])}>
          <ReportValueBars currency={c} rows={data.categoryData.map(row => ({ label: row.name, pence: row.value }))} empty="No category sales in this period." />
        </ReportChartData>
      </ReportSection>
    </div>
    <ReportSection title="Busy trading times">
      <BusyTradingTimes rows={data.hourlyData} />
      <ReportChartData title="Sales by hour and day" columns={['Day', 'Hour', 'Sales count']} rows={data.hourlyData.map(row => [row.day, `${String(row.hour).padStart(2, '0')}:00`, row.sales.toLocaleString()])}><span className="sr-only">Counts are available in the day and hour controls and figures.</span></ReportChartData>
    </ReportSection>
    <ReportDisclosure title="How to read Sales analytics">
      <p>Revenue is sales for this period, not money received. Gross profit is shown only when the required product costs are complete.</p>
      <p>When the earlier period has no sales, no percentage growth is shown. The comparison chart shows total sales for each period.</p>
      <p>Daily charts show up to fourteen recent dates. Category figures are line subtotals; product figures show ranked sales. Their different labels matter when comparing them with headline revenue.</p>
    </ReportDisclosure>
  </div>;
}
