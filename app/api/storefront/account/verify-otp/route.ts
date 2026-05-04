import { NextRequest, NextResponse } from 'next/server';
import {
  setStorefrontSessionCookie,
  verifyStorefrontOtp,
} from '@/lib/services/storefront-customers';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const slug = String(body?.slug ?? '');
  const result = await verifyStorefrontOtp({
    slug,
    phone: String(body?.phone ?? ''),
    code: String(body?.code ?? ''),
    name: body?.name ? String(body.name) : null,
    email: body?.email ? String(body.email) : null,
    userAgent: request.headers.get('user-agent'),
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  setStorefrontSessionCookie(slug, result.sessionToken, result.expiresAt);

  return NextResponse.json({
    ok: true,
    customer: {
      id: result.customer.id,
      phone: result.customer.phone,
      name: result.customer.name,
      email: result.customer.email,
    },
    claimedOrders: result.claimedOrders,
  });
}
