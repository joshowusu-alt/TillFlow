import { NextRequest, NextResponse } from 'next/server';
import { createOnlineCheckout } from '@/lib/services/online-orders';
import { consumeStorefrontCheckoutAttempt } from '@/lib/security/storefront-throttle';
import { getStorefrontSessionCustomer } from '@/lib/services/storefront-customers';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 20;

const MAX_CART_LINES = 50;
const MAX_QTY_PER_LINE = 999;

function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0]?.trim() || 'unknown';
  }
  return request.headers.get('x-real-ip') || request.ip || 'unknown';
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const slug = String(body?.slug ?? '');
    const ip = clientIp(request);

    const throttle = await consumeStorefrontCheckoutAttempt(slug, ip);
    if (!throttle.allowed) {
      return NextResponse.json(
        { error: 'Too many checkout attempts. Please try again shortly.' },
        { status: 429, headers: { 'Retry-After': String(throttle.retryAfterSeconds) } },
      );
    }

    const sessionCustomer = await getStorefrontSessionCustomer(slug);

    const result = await createOnlineCheckout({
      slug,
      storeId: String(body?.storeId ?? '').slice(0, 64),
      customerName: String(body?.customerName ?? '').trim().slice(0, 120),
      customerPhone: String(body?.customerPhone ?? '').trim().slice(0, 30),
      customerEmail: body?.customerEmail ? String(body.customerEmail).trim().slice(0, 254) : null,
      customerNotes: body?.customerNotes ? String(body.customerNotes).trim().slice(0, 500) : null,
      customerId: sessionCustomer?.id ?? null,
      sessionId: body?.sessionId ? String(body.sessionId) : null,
      network:
        body?.network === 'MTN' || body?.network === 'TELECEL' || body?.network === 'AIRTELTIGO'
          ? body.network
          : null,
      items: Array.isArray(body?.items)
        ? body.items.slice(0, MAX_CART_LINES).map((item: unknown) => {
            const value = item as { productId?: string; unitId?: string; qtyInUnit?: number };
            return {
              productId: String(value?.productId ?? ''),
              unitId: String(value?.unitId ?? ''),
              qtyInUnit: Math.min(Math.max(Math.floor(Number(value?.qtyInUnit ?? 0)), 0), MAX_QTY_PER_LINE),
            };
          })
        : [],
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to create online checkout.' },
      { status: 400 },
    );
  }
}
