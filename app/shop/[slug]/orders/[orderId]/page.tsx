import { notFound } from 'next/navigation';
import { getPublicOnlineOrder } from '@/lib/services/online-orders';
import OrderStatusClient from './OrderStatusClient';

export const dynamic = 'force-dynamic';

export default async function StorefrontOrderPage(
  props: {
    params: Promise<{ slug: string; orderId: string }>;
    searchParams?: Promise<{ token?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
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
