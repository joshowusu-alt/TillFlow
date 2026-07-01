'use client';

import { SalesTrendChart, HourlyHeatmap, CategoryBreakdown, ProductPerformance, ComparisonChart } from '@/components/charts';
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
        totalProfit: number;
        marginPercent: number;
        totalTransactions: number;
        avgTransaction: number;
        growthPercent: number;
        previousPeriodSales: number;
        topSellingProduct: string;
        peakHour: string;
    };
}

export default function AnalyticsClient({ data }: { data: AnalyticsData }) {
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
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-4 xl:grid-cols-8">
                <div className="card p-3 sm:p-4">
                    <div className="text-[10px] sm:text-xs text-black/50">Revenue</div>
                    <div className="mt-1 text-base sm:text-xl font-bold text-emerald-600 truncate">{formatMoney(data.kpis.totalSales)}</div>
                </div>
                <div className="card p-3 sm:p-4">
                    <div className="text-[10px] sm:text-xs text-black/50">Gross Profit</div>
                    <div className={`mt-1 text-base sm:text-xl font-bold truncate ${data.kpis.totalProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {formatMoney(data.kpis.totalProfit)}
                    </div>
                </div>
                <div className="card p-3 sm:p-4">
                    <div className="text-[10px] sm:text-xs text-black/50">Margin</div>
                    <div className={`mt-1 text-base sm:text-xl font-bold ${data.kpis.marginPercent >= 20 ? 'text-emerald-600' : data.kpis.marginPercent >= 10 ? 'text-amber-600' : 'text-rose-600'}`}>
                        {data.kpis.marginPercent.toFixed(1)}%
                    </div>
                </div>
                <div className="card p-3 sm:p-4">
                    <div className="text-[10px] sm:text-xs text-black/50">Transactions</div>
                    <div className="mt-1 text-base sm:text-xl font-bold">{data.kpis.totalTransactions.toLocaleString()}</div>
                </div>
                <div className="card p-3 sm:p-4">
                    <div className="text-[10px] sm:text-xs text-black/50">Avg Ticket</div>
                    <div className="mt-1 text-base sm:text-xl font-bold truncate">{formatMoney(data.kpis.avgTransaction)}</div>
                </div>
                <div className="card p-3 sm:p-4">
                    <div className="text-[10px] sm:text-xs text-black/50">Growth</div>
                    <div className={`mt-1 text-base sm:text-xl font-bold ${data.kpis.growthPercent >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {data.kpis.growthPercent >= 0 ? '+' : ''}{data.kpis.growthPercent.toFixed(1)}%
                    </div>
                    <div className="mt-2 space-y-1 text-[10px] leading-relaxed text-black/60 sm:text-xs">
                        <div>Vs previous {data.periodDays} days.</div>
                        <div>{growthFormula}</div>
                    </div>
                </div>
                <div className="card p-3 sm:p-4">
                    <div className="text-[10px] sm:text-xs text-black/50">Top Product</div>
                    <div className="mt-1 truncate font-bold text-xs sm:text-sm" title={data.kpis.topSellingProduct}>
                        {data.kpis.topSellingProduct || '—'}
                    </div>
                </div>
                <div className="card p-3 sm:p-4">
                    <div className="text-[10px] sm:text-xs text-black/50">Peak Hour</div>
                    <div className="mt-1 text-base sm:text-xl font-bold">{data.kpis.peakHour || '—'}</div>
                </div>
            </div>

            <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 px-4 py-3 text-xs text-emerald-900 sm:text-sm">
                Revenue and gross profit cards are aligned to the accounting journals used by the dashboard and income statement. Product rankings below still use item-level cost snapshots for drill-down.
            </div>

            {/* Main Charts */}
            <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
                <SalesTrendChart
                    data={data.salesTrend}
                    title={`Revenue Trend (${periodLabel})`}
                    currency={currencySymbol}
                />
                <ComparisonChart
                    data={data.comparison}
                    title={`This Period vs Previous Period`}
                    currency={currencySymbol}
                />
            </div>

            {/* Secondary Charts */}
            <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
                <CategoryBreakdown
                    data={data.categoryData}
                    title="Sales by Category"
                    currency={currencySymbol}
                />
                <ProductPerformance
                    data={data.productData}
                    title="Top Products by Revenue"
                    currency={currencySymbol}
                />
            </div>

            {/* Heatmap */}
            <HourlyHeatmap data={data.hourlyData} title="Sales by Hour & Day" />
        </div>
    );
}
