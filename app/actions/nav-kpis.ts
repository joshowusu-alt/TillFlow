'use server';

import { requireBusiness } from '@/lib/auth';
import { getTodayKPIs } from '@/lib/reports/today-kpis';
import { countOnlineOrdersNeedingAttention } from '@/lib/services/online-orders-attention';

export async function getNavTodaySales() {
  const { business, user } = await requireBusiness(['MANAGER', 'OWNER']);
  const [kpis, onlineOrdersCount] = await Promise.all([
    getTodayKPIs(business.id),
    countOnlineOrdersNeedingAttention(business.id).catch(() => 0),
  ]);

  return {
    totalPence: kpis.totalSalesPence,
    txCount: kpis.txCount,
    currency: business.currency,
    onlineOrdersCount,
    userRole: user.role,
  };
}
