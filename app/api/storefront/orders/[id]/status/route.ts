import { NextRequest, NextResponse } from 'next/server';
import { checkMobileMoneyCollectionStatus } from '@/lib/services/mobile-money';
import { getPublicOnlineOrder } from '@/lib/services/online-orders';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const body = await request.json();
    const slug = String(body?.slug ?? '');
    const token = String(body?.token ?? '');
    const refreshPayment = body?.refreshPayment !== false;

    const existingOrder = await getPublicOnlineOrder({
      slug,
      orderId: params.id,
      token,
    });

    if (!existingOrder) {
      return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
    }

    if (
      refreshPayment &&
      existingOrder.paymentStatus === 'PENDING' &&
      existingOrder.paymentCollectionId &&
      existingOrder.business?.id
    ) {
      await checkMobileMoneyCollectionStatus({
        businessId: existingOrder.business.id,
        collectionId: existingOrder.paymentCollectionId,
        force: true,
      });
    }

    const refreshedOrder = await getPublicOnlineOrder({
      slug,
      orderId: params.id,
      token,
    });

    if (!refreshedOrder) {
      return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
    }

    return NextResponse.json({ order: refreshedOrder });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to refresh order status.' },
      { status: 400 },
    );
  }
}
