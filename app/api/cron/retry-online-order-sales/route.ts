import { NextRequest, NextResponse } from 'next/server';
import { hasValidCronSecret } from '@/lib/cron-auth';
import { prisma } from '@/lib/prisma';
import { commitOnlineOrderSale } from '@/lib/services/online-order-commit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  if (!hasValidCronSecret(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const orders = await prisma.onlineOrder.findMany({
    where: { paymentStatus: 'PAID', salesInvoiceId: null, status: { not: 'CANCELLED' }, refundStatus: null },
    orderBy: { updatedAt: 'asc' }, take: 3, select: { id: true },
  });
  let posted = 0;
  let failed = 0;
  for (const order of orders) {
    try { if (await commitOnlineOrderSale(order.id)) posted++; else failed++; }
    catch (error) {
      failed++; console.error('[online-order-retry]', order.id, error);
      // Rotate persistent failures so one broken order cannot starve later orders.
      await prisma.onlineOrder.updateMany({ where: { id: order.id, salesInvoiceId: null, status: { not: 'CANCELLED' } }, data: { updatedAt: new Date() } });
    }
  }
  return NextResponse.json({ posted, failed });
}
