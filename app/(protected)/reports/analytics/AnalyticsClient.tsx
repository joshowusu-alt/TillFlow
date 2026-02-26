'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { SalesTrendChart, HourlyHeatmap, CategoryBreakdown, ProductPerformance, ComparisonChart } from '@/components/charts';

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

const PERIOD_OPTIONS = [
    { value: '7', label: '7 days' },
    { value: '14', label: '14 days' },
    { value: '30', label: '30 days' },
    { value: '90', label: '90 days' },
];

export default function AnalyticsClient({ data }: { data: AnalyticsData }) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const currentPeriod = searchParams.get('period') || '7';

    const formatMoney = (pence: number) =>
        new Intl.NumberFormat('en-GB', { style: 'currency', currency: data.currency }).format(pence / 100);

    const currencySymbol = getCurrencySymbol(data.currency);

    const handlePeriodChange = (period: string) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set('period', period);
        router.push(`?${params.toString()}`);
    };

    const periodLabel = `Last ${data.periodDays} Days`;

    return (
        <div className="space-y-4 sm:space-y-6">
            {/* Period Selector */}
            <div className="flex items-center gap-1.5 sm:gap-2">
                {PERIOD_OPTIONS.map((opt) => (
                    <button
                        key={opt.value}
                        onClick={() => handlePeriodChange(opt.value)}
                        className={`flex-1 sm:flex-none rounded-lg px-3 py-2 text-xs sm:text-sm font-medium transition-all ${currentPeriod === opt.value
                                ? 'bg-accent text-white shadow-sm'
                                : 'bg-black/5 text-black/60 hover:bg-black/10'
                            }`}
                    >
                        {opt.label}
                    </button>
                ))}
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-4 xl:grid-cols-8">
                <div className="card p-3 sm:p-4">
                    <div className="text-[10px] sm:text-xs text-black/50">Revenue</div>
                    <div className="mt-1 text-base sm:text-xl font-bold text-emerald-600 truncate">{formatMoney(data.kpis.totalSales)}</div>
                </div>
                <div className="card p-3 sm:p-4">
                    <div className="text-[10px] sm:text-xs text-black/50">Profit</div>
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
