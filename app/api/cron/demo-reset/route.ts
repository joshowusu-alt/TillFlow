import { NextRequest, NextResponse } from 'next/server';
import { hasValidCronSecret } from '@/lib/cron-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  if (!hasValidCronSecret(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { refreshAdomRetailDemoAction } = await import('@/app/actions/demo-sandbox');
  const secret = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? undefined;
  const result = await refreshAdomRetailDemoAction(secret);

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 401 });
  }

  return NextResponse.json({
    ok: true,
    businessId: result.businessId,
    note: 'Refreshed optional /shop/adom-retail-demo catalogue. Public /demo uses fixtures only.',
  });
}
