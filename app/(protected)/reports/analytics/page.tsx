import { requireBusiness } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import PageHeader from '@/components/PageHeader';
import RefreshIndicator from '@/components/RefreshIndicator';
import AnalyticsClient from './AnalyticsClient';

export const dynamic = 'force-dynamic';

export default async function AnalyticsPage() {
    const { user, business } = await requireBusiness(['MANAGER', 'OWNER']);
    if (!business) {
        return <div className="card p-6">Business not found.</div>;
    }

    // Get date ranges
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const fourteenDaysAgo = new Date(today.getTime() - 14 * 24 * 60 * 60 * 1000);

    // Fetch both periods in parallel
    const [recentSales, previousSales] = await Promise.all([
        prisma.salesInvoice.findMany({
            where: {
                businessId: business.id,
                createdAt: { gte: sevenDaysAgo }
            },
            include: {
                lines: {
                    include: { product: { include: { category: true } } }
                }
            },
            orderBy: { createdAt: 'asc' }
        }),
        prisma.salesInvoice.findMany({
            where: {
                businessId: business.id,
                createdAt: { gte: fourteenDaysAgo, lt: sevenDaysAgo }
            }
        }),
    ]);

    // Calculate daily sales trend
    const dailySales = new Map<string, number>();
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    for (let i = 6; i >= 0; i--) {
        const date = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);
        const key = date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' });
        dailySales.set(key, 0);
    }

    recentSales.forEach((sale) => {
        const date = new Date(sale.createdAt);
        const key = date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' });
        dailySales.set(key, (dailySales.get(key) || 0) + sale.totalPence);
    });

    // Calculate hourly heatmap data
    const hourlyData: { hour: number; day: string; sales: number }[] = [];
    const hourDaySales = new Map<string, number>();

    recentSales.forEach((sale) => {
        const date = new Date(sale.createdAt);
        const day = dayNames[date.getDay()];
        // Convert Sunday from index 0 to end
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

    // Category breakdown (using real product categories)
    const categoryStats = new Map<string, number>();

    recentSales.forEach((sale) => {
        sale.lines.forEach((line) => {
            const category = (line.product as any).category?.name || 'Uncategorised';
            categoryStats.set(category, (categoryStats.get(category) || 0) + line.lineTotalPence);
        });
    });

    const categoryData = Array.from(categoryStats.entries())
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 7);

    // Week comparison
    const currentWeekDaily = Array.from(dailySales.values());
    const previousWeekDaily: number[] = [];

    for (let i = 6; i >= 0; i--) {
        const date = new Date(sevenDaysAgo.getTime() - i * 24 * 60 * 60 * 1000);
        const daySales = previousSales
            .filter((s) => {
                const saleDate = new Date(s.createdAt);
                return saleDate.toDateString() === date.toDateString();
            })
            .reduce((sum, s) => sum + s.totalPence, 0);
        previousWeekDaily.push(daySales);
    }

    // Calculate KPIs
    const totalSales = recentSales.reduce((sum, s) => sum + s.totalPence, 0);
    const previousTotalSales = previousSales.reduce((sum, s) => sum + s.totalPence, 0);
    const growthPercent = previousTotalSales > 0
        ? ((totalSales - previousTotalSales) / previousTotalSales) * 100
        : 0;

    const topProduct = productData[0]?.name || '';

    const analyticsData = {
        currency: business.currency,
        salesTrend: {
            labels: Array.from(dailySales.keys()),
            values: Array.from(dailySales.values())
        },
        hourlyData,
        categoryData,
        productData,
        comparison: {
            labels: Array.from(dailySales.keys()),
            current: currentWeekDaily,
            previous: previousWeekDaily
        },
        kpis: {
            totalSales,
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
