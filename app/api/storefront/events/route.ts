import { NextRequest, NextResponse } from 'next/server';
import { recordStorefrontEvent } from '@/lib/services/online-orders';

const ALLOWED_EVENTS = new Set(['view', 'product_view', 'add_to_cart', 'checkout_start']);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const eventType = String(body?.eventType ?? '');
    const storeSlug = String(body?.storeSlug ?? '');
    const sessionId = String(body?.sessionId ?? '');
    const productId = body?.productId ? String(body.productId) : null;

    if (!ALLOWED_EVENTS.has(eventType) || !storeSlug || !sessionId) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    await recordStorefrontEvent({
      storeSlug,
      eventType: eventType as 'view' | 'product_view' | 'add_to_cart' | 'checkout_start',
      productId,
      sessionId,
      metadata: body?.metadata && typeof body.metadata === 'object' ? body.metadata : null,
    });
  } catch {
    return NextResponse.json({ ok: false }, { status: 202 });
  }

  return NextResponse.json({ ok: true });
}
