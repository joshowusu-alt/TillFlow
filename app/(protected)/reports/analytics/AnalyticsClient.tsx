'use client';

import { SalesTrendChart, HourlyHeatmap, CategoryBreakdown, ProductPerformance, ComparisonChart } from '@/components/charts';
import ReportChartData from '@/components/reports/ReportChartData';
import FinancialAmount from '@/components/reports/FinancialAmount';
import { getCurrencySymbol } from '@/lib/format';

interface AnalyticsData {
    currency: string;
    periodDays: number;
    salesTrend: { labels: string[]; values: number[] };
    profitTrend: { labels: string[]; values: number[] };
    hourlyData: { hour: number; day: string; sales: number }[];
    categoryData: { name: string; value: number }[];
    productData: { name: string; revenue: number; profit: number; margin: number }[];
    comparison: { labels: string[]; current: number[]; previous: number[] };
    kpis: {
        totalSales: number;
        totalProfit: number | null;
        marginPercent: number | null;
        totalTransactions: number;
        avgTransaction: number;
        growthPercent: number;
        previousPeriodSales: number;
        topSellingProduct: string;
        peakHour: string;
    };
}

export default function AnalyticsClient({ data, kpis: _kpis }: { data: AnalyticsData; kpis?: AnalyticsData['kpis'] }) {
    const formatMoney = (pence: number) =>
        new Intl.NumberFormat('en-GB', { style: 'currency', currency: data.currency }).format(pence / 100);

    const currencySymbol = getCurrencySymbol(data.currency);

    const periodLabel = `Last ${data.periodDays} Days`;
    const hasPreviousPeriodSales = data.kpis.previousPeriodSales > 0;
    const growthFormula = hasPreviousPeriodSales
        ? `((${formatMoney(data.kpis.totalSales)} - ${formatMoney(data.kpis.previousPeriodSales)}) / ${formatMoney(data.kpis.previousPeriodSales)}) x 100`
        : `Previous ${data.periodDays} days had no revenue, so growth is shown as 0%.`;

    return (
        <div className="space-y-4 sm:space-y-6">
            {/* KPI Cards */}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-analytics-kpis="">
                <div className={`card p-3 sm:p-4 ${Math.abs(data.kpis.totalSales ?? 0) >= 1_000_000 ? 'col-span-2 sm:col-span-1' : ''}`}>
                    <div className="text-xs font-semibold text-slate-700">Revenue</div>
                    <div className="financial-fit mt-1 text-emerald-600" data-analytics-amount="revenue">
                        <FinancialAmount pence={data.kpis.totalSales} currency={data.currency} variant="prominent" />
                    </div>
                </div>
                <div className={`card p-3 sm:p-4 ${Math.abs(data.kpis.totalProfit ?? 0) >= 1_000_000 ? 'col-span-2 sm:col-span-1' : ''}`}>
                    <div className="text-xs font-semibold text-slate-700">Gross Profit</div>
                    {data.kpis.totalProfit == null ? (
                        <p className="mt-1 break-words text-base font-bold leading-snug text-amber-700 sm:text-xl">Costs incomplete</p>
                    ) : (
                        <div className={`financial-fit mt-1 ${data.kpis.totalProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                            <FinancialAmount pence={data.kpis.totalProfit} currency={data.currency} variant="prominent" />
                        </div>
                    )}
                </div>
                <div className="card p-3 sm:p-4">
                    <div className="text-xs font-semibold text-slate-700">Margin</div>
                    <div className={`mt-1 break-words text-base font-bold leading-snug sm:text-xl ${data.kpis.marginPercent == null ? 'text-amber-700' : data.kpis.marginPercent >= 20 ? 'text-emerald-600' : data.kpis.marginPercent >= 10 ? 'text-amber-600' : 'text-rose-600'}`}>
                        {data.kpis.marginPercent == null ? 'Costs incomplete' : `${data.kpis.marginPercent.toFixed(1)}%`}
                    </div>
                </div>
                <div className="card p-3 sm:p-4">
                    <div className="text-xs font-semibold text-slate-700">Transactions</div>
                    <div className="mt-1 text-base font-bold sm:text-xl">{data.kpis.totalTransactions.toLocaleString()}</div>
                </div>
                <div className={`card p-3 sm:p-4 ${Math.abs(data.kpis.avgTransaction ?? 0) >= 1_000_000 ? 'col-span-2 sm:col-span-1' : ''}`}>
                    <div className="text-xs font-semibold text-slate-700">Average sale</div>
                    <div className="financial-fit mt-1">
                        <FinancialAmount pence={data.kpis.avgTransaction} currency={data.currency} variant="prominent" />
                    </div>
                </div>
                <div className="card p-3 sm:p-4">
                    <div className="text-xs font-semibold text-slate-700">Growth</div>
                    <div className={`mt-1 text-base sm:text-xl font-bold ${data.kpis.growthPercent >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {data.kpis.growthPercent >= 0 ? '+' : ''}{data.kpis.growthPercent.toFixed(1)}%
                    </div>
                    <div className="mt-2 space-y-1 text-[10px] leading-relaxed text-black/60 sm:text-xs">
                        <div>Vs previous {data.periodDays} days.</div>
                        <details>
                            <summary className="flex min-h-11 cursor-pointer items-center font-medium text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">How growth is calculated</summary>
                            <p>{growthFormula}</p>
                        </details>
                    </div>
                </div>
                <div className="card p-3 sm:p-4">
                    <div className="text-xs font-semibold text-slate-700">Top Product</div>
                    <div className="mt-1 break-words font-bold text-xs leading-snug sm:text-sm" title={data.kpis.topSellingProduct}>
                        {data.kpis.topSellingProduct || '—'}
                    </div>
                </div>
                <div className="card p-3 sm:p-4">
                    <div className="text-xs font-semibold text-slate-700">Peak Hour</div>
                    <div className="mt-1 text-base sm:text-xl font-bold">{data.kpis.peakHour || '—'}</div>
                </div>
            </div>

            <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 px-4 py-3 text-xs text-emerald-900 sm:text-sm">
                Revenue is sales for this period, not money received. Gross profit is shown only when the required product costs are complete.
            </div>

            {/* Main Charts */}
            <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
                <ReportChartData title="Revenue trend" columns={['Date', 'Revenue']} rows={data.salesTrend.labels.map((label, index) => [label, formatMoney(data.salesTrend.values[index] ?? 0)])}>
                    <SalesTrendChart
                    data={data.salesTrend}
                    title={`Revenue Trend (${periodLabel})`}
                    currency={currencySymbol}
                />
                </ReportChartData>
                <ReportChartData title="Period comparison" columns={['Date', 'Current', 'Previous']} rows={data.comparison.labels.map((label, index) => [label, formatMoney(data.comparison.current[index] ?? 0), formatMoney(data.comparison.previous[index] ?? 0)])}>
                    <ComparisonChart
                    data={data.comparison}
                    title={`This Period vs Previous Period`}
                    currency={currencySymbol}
                />
                </ReportChartData>
            </div>

            {/* Secondary Charts */}
            <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
                <ReportChartData title="Sales by category" columns={['Category', 'Revenue']} rows={data.categoryData.map(row => [row.name, formatMoney(row.value)])}>
                    <CategoryBreakdown
                    data={data.categoryData}
                    title="Sales by Category"
                    currency={currencySymbol}
                />
                </ReportChartData>
                <ReportChartData title="Top products" columns={['Product', 'Revenue', 'Profit', 'Margin']} rows={data.productData.map(row => [row.name, formatMoney(row.revenue), formatMoney(row.profit), `${row.margin.toFixed(1)}%`])}>
                    <ProductPerformance
                    data={data.productData}
                    title="Top Products by Revenue"
                    currency={currencySymbol}
                />
                </ReportChartData>
            </div>

            {/* Heatmap */}
            <ReportChartData title="Sales by hour and day" columns={['Day', 'Hour', 'Sales count']} rows={data.hourlyData.map(row => [row.day, `${String(row.hour).padStart(2, '0')}:00`, row.sales.toLocaleString()])}>
                    <HourlyHeatmap data={data.hourlyData} title="Sales by Hour & Day" />
                </ReportChartData>
        </div>
    );
}
