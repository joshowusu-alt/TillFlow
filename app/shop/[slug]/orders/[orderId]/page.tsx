import { notFound } from 'next/navigation';
import { getPublicOnlineOrder } from '@/lib/services/online-orders';
import OrderStatusClient from './OrderStatusClient';

export const dynamic = 'force-dynamic';

export default async function StorefrontOrderPage({
  params,
  searchParams,
}: {
  params: { slug: string; orderId: string };
  searchParams?: { token?: string };
}) {
  const token = searchParams?.token ?? '';
  const order = await getPublicOnlineOrder({
    slug: params.slug,
    orderId: params.orderId,
    token,
  });

  if (!order) {
    notFound();
  }

  return <OrderStatusClient order={order} />;
}
