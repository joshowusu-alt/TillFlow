import { NextRequest, NextResponse } from 'next/server';
import { requestStorefrontOtp } from '@/lib/services/storefront-customers';
import { consumeOtpRequest } from '@/lib/security/storefront-otp-throttle';

export const dynamic = 'force-dynamic';

function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]?.trim() || 'unknown';
  return request.headers.get('x-real-ip') || request.ip || 'unknown';
}

export async function POST(request: NextRequest) {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const slug = String(body?.slug ?? '');
  const ip = clientIp(request);

  const throttle = await consumeOtpRequest(slug, ip);
  if (!throttle.allowed) {
    return NextResponse.json(
      { error: 'Too many sign-in attempts from this device. Try again shortly.' },
      { status: 429, headers: { 'Retry-After': String(throttle.retryAfterSeconds) } },
    );
  }

  const result = await requestStorefrontOtp({
    slug,
    phone: String(body?.phone ?? ''),
    email: body?.email ? String(body.email) : null,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.retryAfterSeconds ? 429 : 400 },
    );
  }

  // We never reveal whether the phone has an account, only whether the
  // delivery channel succeeded. The dev fallback returns the code so a
  // developer can sign in locally without configuring SMS or email.
  const payload: Record<string, unknown> = {
    ok: true,
    channel: result.channel,
    delivered: result.delivered,
  };
  if (result.devCode && process.env.NODE_ENV !== 'production') {
    payload.devCode = result.devCode;
  }

  return NextResponse.json(payload);
}
