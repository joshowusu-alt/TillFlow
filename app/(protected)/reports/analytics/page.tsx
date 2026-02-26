import { requireBusiness } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import PageHeader from '@/components/PageHeader';
import RefreshIndicator from '@/components/RefreshIndicator';
import AnalyticsClient from './AnalyticsClient';

export const dynamic = 'force-dynamic';

export default async function AnalyticsPage({
    searchParams,
}: {
    searchParams?: { period?: string };
}) {
    const { business } = await requireBusiness(['MANAGER', 'OWNER']);
    if (!business) {
        return <div className="card p-6">Business not found.</div>;
    }

    // Period selector: 7d (default), 14d, 30d, 90d
    const validPeriods = ['7', '14', '30', '90'] as const;
    const periodDays = validPeriods.includes(searchParams?.period as any)
        ? parseInt(searchParams!.period!, 10)
        : 7;

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const periodAgo = new Date(today.getTime() - periodDays * 24 * 60 * 60 * 1000);
    const previousPeriodAgo = new Date(periodAgo.getTime() - periodDays * 24 * 60 * 60 * 1000);

    // Fetch both periods in parallel
    const [recentSales, previousSales] = await Promise.all([
        prisma.salesInvoice.findMany({
            where: {
                businessId: business.id,
                createdAt: { gte: periodAgo }
            },
            select: {
                createdAt: true,
                totalPence: true,
                lines: {
                    select: {
                        productId: true,
                        qtyBase: true,
                        lineTotalPence: true,
                        product: {
                            select: {
                                name: true,
                                defaultCostBasePence: true,
                                category: { select: { name: true } }
                            }
                        }
                    }
                }
            },
            orderBy: { createdAt: 'asc' }
        }),
        prisma.salesInvoice.findMany({
            where: {
                businessId: business.id,
                createdAt: { gte: previousPeriodAgo, lt: periodAgo }
            },
            select: { createdAt: true, totalPence: true }
        }),
    ]);

    // Calculate daily sales trend
    const dailySales = new Map<string, number>();
    const dailyProfit = new Map<string, number>();
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    // Limit chart labels based on period
    const maxLabels = periodDays <= 14 ? periodDays : Math.min(periodDays, 30);
    for (let i = maxLabels - 1; i >= 0; i--) {
        const date = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);
        const key = periodDays <= 14
            ? date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' })
            : date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
        dailySales.set(key, 0);
        dailyProfit.set(key, 0);
    }

    recentSales.forEach((sale) => {
        const date = new Date(sale.createdAt);
        const key = periodDays <= 14
            ? date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' })
            : date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
        dailySales.set(key, (dailySales.get(key) || 0) + sale.totalPence);
        const cost = sale.lines.reduce((sum, l) => sum + (l.product.defaultCostBasePence || 0) * l.qtyBase, 0);
        dailyProfit.set(key, (dailyProfit.get(key) || 0) + (sale.totalPence - cost));
    });

    // Calculate hourly heatmap data
    const hourlyData: { hour: number; day: string; sales: number }[] = [];
    const hourDaySales = new Map<string, number>();

    recentSales.forEach((sale) => {
        const date = new Date(sale.createdAt);
        const day = dayNames[date.getDay()];
        const dayForDisplay = day === 'Sun' ? 'Sun' : day;
        const hour = date.getHours();
        const key = `${dayForDisplay}-${hour}`;
        hourDaySales.set(key, (hourDaySales.get(key) || 0) + 1);
    });

    const displayDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    displayDays.forEach((day) => {
        for (let hour = 0; hour < 24; hour++) {
            const key = `${day}-${hour}`;
            hourlyData.push({ hour, day, sales: hourDaySales.get(key) || 0 });
        }
    });

    // Find peak hour
    let peakHour = '';
    let maxHourSales = 0;
    const hourTotals = new Map<number, number>();

    recentSales.forEach((sale) => {
        const hour = new Date(sale.createdAt).getHours();
        hourTotals.set(hour, (hourTotals.get(hour) || 0) + sale.totalPence);
    });

    hourTotals.forEach((sales, hour) => {
        if (sales > maxHourSales) {
            maxHourSales = sales;
            peakHour = `${hour.toString().padStart(2, '0')}:00`;
        }
    });

    // Calculate product performance
    const productStats = new Map<string, { name: string; revenue: number; cost: number }>();

    recentSales.forEach((sale) => {
        sale.lines.forEach((line) => {
            const existing = productStats.get(line.productId) || { name: line.product.name, revenue: 0, cost: 0 };
            existing.revenue += line.lineTotalPence;
            existing.cost += (line.product.defaultCostBasePence || 0) * line.qtyBase;
            productStats.set(line.productId, existing);
        });
    });

    const productData = Array.from(productStats.values())
        .map((p) => ({
            name: p.name,
            revenue: p.revenue,
            profit: p.revenue - p.cost,
            margin: p.revenue > 0 ? ((p.revenue - p.cost) / p.revenue) * 100 : 0
        }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 10);

    // Category breakdown
    const categoryStats = new Map<string, number>();

    recentSales.forEach((sale) => {
        sale.lines.forEach((line) => {
            const category = line.product.category?.name || 'Uncategorised';
            categoryStats.set(category, (categoryStats.get(category) || 0) + line.lineTotalPence);
        });
    });

    const categoryData = Array.from(categoryStats.entries())
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 7);

    // Week/period comparison
    const currentPeriodDaily = Array.from(dailySales.values());
    const previousPeriodDaily: number[] = [];

    for (let i = maxLabels - 1; i >= 0; i--) {
        const date = new Date(periodAgo.getTime() - i * 24 * 60 * 60 * 1000);
        const daySales = previousSales
            .filter((s) => {
                const saleDate = new Date(s.createdAt);
                return saleDate.toDateString() === date.toDateString();
            })
            .reduce((sum, s) => sum + s.totalPence, 0);
        previousPeriodDaily.push(daySales);
    }

    // Calculate KPIs
    const totalSales = recentSales.reduce((sum, s) => sum + s.totalPence, 0);
    const totalCost = recentSales.reduce((sum, s) =>
        sum + s.lines.reduce((lSum, l) => lSum + (l.product.defaultCostBasePence || 0) * l.qtyBase, 0), 0);
    const totalProfit = totalSales - totalCost;
    const marginPercent = totalSales > 0 ? (totalProfit / totalSales) * 100 : 0;
    const previousTotalSales = previousSales.reduce((sum, s) => sum + s.totalPence, 0);
    const growthPercent = previousTotalSales > 0
        ? ((totalSales - previousTotalSales) / previousTotalSales) * 100
        : 0;

    const topProduct = productData[0]?.name || '';

    const analyticsData = {
        currency: business.currency,
        periodDays,
        salesTrend: {
            labels: Array.from(dailySales.keys()),
            values: Array.from(dailySales.values())
        },
        profitTrend: {
            labels: Array.from(dailyProfit.keys()),
            values: Array.from(dailyProfit.values())
        },
        hourlyData,
        categoryData,
        productData,
        comparison: {
            labels: Array.from(dailySales.keys()),
            current: currentPeriodDaily,
            previous: previousPeriodDaily
        },
        kpis: {
            totalSales,
            totalProfit,
            marginPercent,
            totalTransactions: recentSales.length,
            avgTransaction: recentSales.length > 0 ? totalSales / recentSales.length : 0,
            growthPercent,
            topSellingProduct: topProduct,
            peakHour
        }
    };

    return (
        <div className="space-y-6">
            <PageHeader
                title="Advanced Analytics"
                subtitle="Deep insights into your business performance."
                actions={<RefreshIndicator fetchedAt={new Date().toISOString()} />}
            />
            <AnalyticsClient data={analyticsData} />
        </div>
    );
}
