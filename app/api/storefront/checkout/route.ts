import { NextRequest, NextResponse } from 'next/server';
import { createOnlineCheckout } from '@/lib/services/online-orders';
import { consumeStorefrontCheckoutAttempt } from '@/lib/security/storefront-throttle';

export const dynamic = 'force-dynamic';

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

    const result = await createOnlineCheckout({
      slug,
      storeId: String(body?.storeId ?? ''),
      customerName: String(body?.customerName ?? ''),
      customerPhone: String(body?.customerPhone ?? ''),
      customerEmail: body?.customerEmail ? String(body.customerEmail) : null,
      customerNotes: body?.customerNotes ? String(body.customerNotes) : null,
      network:
        body?.network === 'MTN' || body?.network === 'TELECEL' || body?.network === 'AIRTELTIGO'
          ? body.network
          : null,
      items: Array.isArray(body?.items)
        ? body.items.map((item: unknown) => {
            const value = item as { productId?: string; unitId?: string; qtyInUnit?: number };
            return {
              productId: String(value?.productId ?? ''),
              unitId: String(value?.unitId ?? ''),
              qtyInUnit: Number(value?.qtyInUnit ?? 0),
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
