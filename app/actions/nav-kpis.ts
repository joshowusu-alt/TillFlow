'use server';

import { requireBusiness } from '@/lib/auth';
import { getTodayKPIs } from '@/lib/reports/today-kpis';

export async function getNavTodaySales() {
  const { business, user } = await requireBusiness(['MANAGER', 'OWNER']);
  const kpis = await getTodayKPIs(business.id);

  return {
    totalPence: kpis.totalSalesPence,
    txCount: kpis.txCount,
    currency: business.currency,
    userRole: user.role,
  };
}
