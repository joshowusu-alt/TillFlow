import { prisma } from '@/lib/prisma';
import { businessDayWindow, requireReportTimeZone, zonedDateTimeParts } from '@/lib/reports/reporting-clock';
import { rankRecognisedProductSales } from '@/lib/reports/product-rank';
import { evaluateMarginSet } from '@/lib/reports/margin-line';
import { measureServerOperation, PERFORMANCE_THRESHOLDS_MS } from '@/lib/observability';
import AnalyticsClient from './AnalyticsClient';

type AnalyticsContentProps = {
  businessId: string;
  currency: string;
  periodDays: number;
  timeZone?: string | null;
  now?: Date;
  periodStart?: Date;
  periodEndExclusive?: Date;
};

export async function loadAnalyticsReport({
  businessId,
  currency,
  periodDays,
  timeZone,
  now = new Date(),
  periodStart,
  periodEndExclusive,
}: AnalyticsContentProps) {
  const reportTimeZone = requireReportTimeZone(timeZone);
  const today = businessDayWindow(now, reportTimeZone);
  const periodAgo = periodStart ?? new Date(today.startInclusive.getTime() - periodDays * 86_400_000);
  const previousPeriodAgo = new Date(periodAgo.getTime() - periodDays * 86_400_000);
  const endExclusive = periodEndExclusive ?? today.endExclusive;

  const analyticsData = await measureServerOperation(
    'report.analytics.snapshot',
    async () => {
      // All data from sale transactions — single source of truth
      const [recentSales, previousSales] = await Promise.all([
        prisma.salesInvoice.findMany({
          where: {
            businessId,
            createdAt: { gte: periodAgo, lt: endExclusive },
            paymentStatus: { notIn: ['RETURNED', 'VOID'] },
          },
          select: {
            createdAt: true,
            paymentStatus: true,
            discountPence: true,
            vatPence: true,
            totalPence: true,
            lines: {
              select: {
                productId: true,
                qtyBase: true,
                lineSubtotalPence: true,
                lineDiscountPence: true,
                promoDiscountPence: true,
                lineVatPence: true,
                lineTotalPence: true,
                lineCostPence: true,
                product: {
                  select: {
                    name: true,
                    defaultCostBasePence: true,
                    category: { select: { name: true } },
                  },
                },
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        }),
        prisma.salesInvoice.findMany({
          where: {
            businessId,
            createdAt: { gte: previousPeriodAgo, lt: periodAgo },
            paymentStatus: { notIn: ['RETURNED', 'VOID'] },
          },
          select: { createdAt: true, totalPence: true },
        }),
      ]);

      // Calculate daily sales trend
      const dailySales = new Map<string, number>();
      const dailyProfit = new Map<string, number>();
      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

      // Limit chart labels based on period
      const maxLabels = periodDays <= 14 ? periodDays : Math.min(periodDays, 30);
      for (let i = maxLabels - 1; i >= 0; i--) {
        const date = new Date(today.startInclusive.getTime() - i * 24 * 60 * 60 * 1000);
        const key =
          periodDays <= 14
            ? date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', timeZone: reportTimeZone })
            : date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: reportTimeZone });
        dailySales.set(key, 0);
        dailyProfit.set(key, 0);
      }

      recentSales.forEach((sale) => {
        const date = new Date(sale.createdAt);
        const key =
          periodDays <= 14
            ? date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', timeZone: reportTimeZone })
            : date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: reportTimeZone });
        dailySales.set(key, (dailySales.get(key) || 0) + sale.totalPence);
        const saleMargin = evaluateMarginSet([{
          paymentStatus: sale.paymentStatus,
          discountPence: sale.discountPence,
          lines: sale.lines.map((line) => ({
            lineSubtotalPence: line.lineSubtotalPence,
            lineDiscountPence: line.lineDiscountPence,
            promoDiscountPence: line.promoDiscountPence,
            lineCostPence: line.lineCostPence,
            qtyBase: line.qtyBase,
            defaultCostBasePence: line.product.defaultCostBasePence,
          })),
        }]);
        if (saleMargin.grossProfitPence != null) {
          dailyProfit.set(key, (dailyProfit.get(key) || 0) + saleMargin.grossProfitPence);
        }
      });

      // Calculate hourly heatmap data
      const hourlyData: { hour: number; day: string; sales: number }[] = [];
      const hourDaySales = new Map<string, number>();

      recentSales.forEach((sale) => {
        const parts = zonedDateTimeParts(new Date(sale.createdAt), reportTimeZone);
        const day = dayNames[parts.weekday];
        const dayForDisplay = day === 'Sun' ? 'Sun' : day;
        const hour = parts.hour;
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
        const hour = zonedDateTimeParts(new Date(sale.createdAt), reportTimeZone).hour;
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
      let unallocatedSalesDifferencePence = 0;

      recentSales.forEach((sale) => {
        const ranked = rankRecognisedProductSales(sale);
        if (!ranked.ok) {
          unallocatedSalesDifferencePence += ranked.differencePence;
          return;
        }
        const amountByProduct = new Map<string, number>();
        for (const row of ranked.lines) {
          amountByProduct.set(row.productId, (amountByProduct.get(row.productId) ?? 0) + row.amountPence);
        }
        sale.lines.forEach((line) => {
          const existing = productStats.get(line.productId) || {
            name: line.product.name,
            revenue: 0,
            cost: 0,
          };
          const rankedAmount = amountByProduct.get(line.productId) ?? 0;
          existing.revenue += rankedAmount;
          amountByProduct.set(line.productId, 0);
          existing.cost += line.lineCostPence;
          productStats.set(line.productId, existing);
        });
      });

      const productData = Array.from(productStats.values())
        .map((p) => ({
          name: p.name,
          revenue: p.revenue,
          profit: p.revenue - p.cost,
          margin: p.revenue > 0 ? ((p.revenue - p.cost) / p.revenue) * 100 : 0,
        }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 10);
      if (unallocatedSalesDifferencePence !== 0) {
        productData.push({
          name: 'Unallocated sales difference',
          revenue: unallocatedSalesDifferencePence,
          profit: 0,
          margin: 0,
        });
      }

      // Category breakdown
      const categoryStats = new Map<string, number>();

      recentSales.forEach((sale) => {
        sale.lines.forEach((line) => {
          const category = line.product.category?.name || 'Uncategorised';
          categoryStats.set(category, (categoryStats.get(category) || 0) + line.lineSubtotalPence);
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

      // Calculate KPIs — GP derived from sale lines (same source as product table)
      const totalSales = recentSales.reduce((sum, s) => sum + s.totalPence, 0);
      const periodMargin = evaluateMarginSet(recentSales.map((sale) => ({
        paymentStatus: sale.paymentStatus,
        discountPence: sale.discountPence,
        lines: sale.lines.map((line) => ({
          lineSubtotalPence: line.lineSubtotalPence,
          lineDiscountPence: line.lineDiscountPence,
          promoDiscountPence: line.promoDiscountPence,
          lineCostPence: line.lineCostPence,
          qtyBase: line.qtyBase,
          defaultCostBasePence: line.product.defaultCostBasePence,
        })),
      })));
      const totalProfit = periodMargin.grossProfitPence;
      const marginPercent = periodMargin.state === 'READY' ? periodMargin.grossProfitPercent : null;
      const previousTotalSales = previousSales.reduce((sum, s) => sum + s.totalPence, 0);
      const growthPercent =
        previousTotalSales > 0
          ? ((totalSales - previousTotalSales) / previousTotalSales) * 100
          : 0;

      const topProduct = productData[0]?.name || '';

      return {
        currency,
        periodDays,
        salesTrend: {
          labels: Array.from(dailySales.keys()),
          values: Array.from(dailySales.values()),
        },
        profitTrend: {
          labels: Array.from(dailyProfit.keys()),
          values: Array.from(dailyProfit.values()),
        },
        hourlyData,
        categoryData,
        productData,
        comparison: {
          labels: Array.from(dailySales.keys()),
          current: currentPeriodDaily,
          previous: previousPeriodDaily,
        },
        kpis: {
          totalSales,
          totalProfit,
          marginPercent,
          marginState: periodMargin.state,
          totalTransactions: recentSales.length,
          avgTransaction: recentSales.length > 0 ? totalSales / recentSales.length : 0,
          growthPercent,
          previousPeriodSales: previousTotalSales,
          topSellingProduct: topProduct,
          unallocatedSalesDifferencePence,
          peakHour,
        },
      };
    },
    {
      businessId,
      route: '/reports/analytics',
      cacheState: 'uncached',
    },
    { thresholdMs: PERFORMANCE_THRESHOLDS_MS.report, operationType: 'report' },
  );

  return analyticsData;
}

export default async function AnalyticsContent(props: AnalyticsContentProps) {
  const analyticsData = await loadAnalyticsReport(props);
  return <AnalyticsClient data={analyticsData} kpis={analyticsData.kpis} />;
}
