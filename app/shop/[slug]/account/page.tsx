import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { getPublicStorefrontBySlug } from '@/lib/services/online-orders';
import {
  getCustomerOrderHistory,
  getStorefrontSessionCustomer,
} from '@/lib/services/storefront-customers';
import AccountClient from './AccountClient';

export const dynamic = 'force-dynamic';

type AccountPageProps = {
  params: { slug: string };
};

export async function generateMetadata({ params }: AccountPageProps): Promise<Metadata> {
  const storefront = await getPublicStorefrontBySlug(params.slug);
  return {
    title: storefront ? `Your account — ${storefront.name}` : 'Your account',
    robots: { index: false, follow: false },
  };
}

export default async function StorefrontAccountPage({ params }: AccountPageProps) {
  const storefront = await getPublicStorefrontBySlug(params.slug);
  if (!storefront) notFound();

  const customer = await getStorefrontSessionCustomer(params.slug);
  if (!customer) {
    redirect(`/shop/${params.slug}/login?redirect=/shop/${params.slug}/account`);
  }

  const orders = await getCustomerOrderHistory(customer.id, customer.phone, 30);
  const publishedProductIds = new Set(storefront.products.map((p) => p.id));

  const orderViews = orders.map((order) => {
    const reorderableLines = order.lines.filter((line) => publishedProductIds.has(line.productId));
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      paymentStatus: order.paymentStatus,
      fulfillmentStatus: order.fulfillmentStatus,
      totalPence: order.totalPence,
      currency: order.currency,
      createdAt: order.createdAt.toISOString(),
      paidAt: order.paidAt ? order.paidAt.toISOString() : null,
      publicToken: order.publicToken,
      lines: order.lines.map((line) => ({
        id: line.id,
        productId: line.productId,
        unitId: line.unitId,
        productName: line.productName,
        unitName: line.unitName,
        imageUrl: line.imageUrl,
        qtyInUnit: line.qtyInUnit,
        unitPricePence: line.unitPricePence,
        lineTotalPence: line.lineTotalPence,
      })),
      reorderableLines: reorderableLines.map((line) => ({
        productId: line.productId,
        unitId: line.unitId,
        qtyInUnit: line.qtyInUnit,
      })),
    };
  });

  return (
    <AccountClient
      slug={params.slug}
      storefrontName={storefront.name}
      branding={storefront.branding}
      currency={storefront.currency}
      customer={{
        name: customer.name,
        phone: customer.phone,
        email: customer.email,
      }}
      orders={orderViews}
    />
  );
}
