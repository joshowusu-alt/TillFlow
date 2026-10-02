'use client';

import { SalesTrendChart, HourlyHeatmap, CategoryBreakdown, ProductPerformance, ComparisonChart } from '@/components/charts';
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
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-4 xl:grid-cols-8" data-analytics-kpis="">
                <div className="card p-3 sm:p-4">
                    <div className="text-xs font-semibold text-slate-700">Revenue</div>
                    <div className="financial-fit mt-1 text-emerald-600" data-analytics-amount="revenue">
                        <FinancialAmount pence={data.kpis.totalSales} currency={data.currency} variant="prominent" />
                    </div>
                </div>
                <div className="card p-3 sm:p-4">
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
                <div className="card p-3 sm:p-4">
                    <div className="text-xs font-semibold text-slate-700">Avg Ticket</div>
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
                        <div>{growthFormula}</div>
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
