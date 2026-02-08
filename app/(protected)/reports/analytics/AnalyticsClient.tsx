'use client';

import { SalesTrendChart, HourlyHeatmap, CategoryBreakdown, ProductPerformance, ComparisonChart } from '@/components/charts';

interface AnalyticsData {
    currency: string;
    salesTrend: { labels: string[]; values: number[] };
    hourlyData: { hour: number; day: string; sales: number }[];
    categoryData: { name: string; value: number }[];
    productData: { name: string; revenue: number; profit: number; margin: number }[];
    comparison: { labels: string[]; current: number[]; previous: number[] };
    kpis: {
        totalSales: number;
        totalTransactions: number;
        avgTransaction: number;
        growthPercent: number;
        topSellingProduct: string;
        peakHour: string;
    };
}

// Get currency symbol from ISO code
function getCurrencySymbol(currency: string): string {
    const symbols: Record<string, string> = {
        GBP: '£', USD: '$', EUR: '€',
        GHS: '₵', NGN: '₦', KES: 'KSh', ZAR: 'R',
        UGX: 'USh', TZS: 'TSh', CAD: 'C$', AUD: 'A$',
        INR: '₹', JPY: '¥', CNY: '¥'
    };
    return symbols[currency] || currency + ' ';
}

export default function AnalyticsClient({ data }: { data: AnalyticsData }) {
    const formatMoney = (pence: number) =>
        new Intl.NumberFormat('en-GB', { style: 'currency', currency: data.currency }).format(pence / 100);

    const currencySymbol = getCurrencySymbol(data.currency);

    return (
        <div className="space-y-6">
            {/* KPI Cards */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                <div className="card p-4">
                    <div className="text-xs text-black/50">Total Sales</div>
                    <div className="mt-1 text-2xl font-bold text-emerald-600">{formatMoney(data.kpis.totalSales)}</div>
                </div>
                <div className="card p-4">
                    <div className="text-xs text-black/50">Transactions</div>
                    <div className="mt-1 text-2xl font-bold">{data.kpis.totalTransactions.toLocaleString()}</div>
                </div>
                <div className="card p-4">
                    <div className="text-xs text-black/50">Avg Transaction</div>
                    <div className="mt-1 text-2xl font-bold">{formatMoney(data.kpis.avgTransaction)}</div>
                </div>
                <div className="card p-4">
                    <div className="text-xs text-black/50">Growth</div>
                    <div className={`mt-1 text-2xl font-bold ${data.kpis.growthPercent >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {data.kpis.growthPercent >= 0 ? '+' : ''}{data.kpis.growthPercent.toFixed(1)}%
                    </div>
                </div>
                <div className="card p-4">
                    <div className="text-xs text-black/50">Top Product</div>
                    <div className="mt-1 truncate font-bold" title={data.kpis.topSellingProduct}>
                        {data.kpis.topSellingProduct || '—'}
                    </div>
                </div>
                <div className="card p-4">
                    <div className="text-xs text-black/50">Peak Hour</div>
                    <div className="mt-1 text-2xl font-bold">{data.kpis.peakHour || '—'}</div>
                </div>
            </div>

            {/* Main Charts */}
            <div className="grid gap-6 lg:grid-cols-2">
                <SalesTrendChart
                    data={data.salesTrend}
                    title="Sales Trend (Last 7 Days)"
                    currency={currencySymbol}
                />
                <ComparisonChart
                    data={data.comparison}
                    title="This Week vs Last Week"
                    currency={currencySymbol}
                />
            </div>

            {/* Secondary Charts */}
            <div className="grid gap-6 lg:grid-cols-2">
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
