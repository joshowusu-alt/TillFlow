'use server';

import { requireBusiness } from '@/lib/auth';
import { getHomePerformanceSummary } from '@/lib/reports/home-performance-kpis';
import { countOnlineOrdersNeedingAttention } from '@/lib/services/online-orders-attention';

/**
 * Nav/header today sales — slim Home summary for revenue/tx (not full Command Center KPIs).
 * Online-orders badge remains a separate lightweight count.
 */
export async function getNavTodaySales() {
  const { business, user } = await requireBusiness(['CASHIER', 'MANAGER', 'OWNER']);
  const [summary, onlineOrdersCount] = await Promise.all([
    getHomePerformanceSummary(business.id),
    countOnlineOrdersNeedingAttention(business.id).catch(() => 0),
  ]);

  return {
    totalPence: summary.todayRevenuePence,
    txCount: summary.todayTransactionCount,
    currency: business.currency,
    onlineOrdersCount,
    userRole: user.role,
  };
}
