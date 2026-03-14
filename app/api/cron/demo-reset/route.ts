import { NextRequest, NextResponse } from 'next/server';
import { resetDemoAction } from '@/app/actions/demo';
import { hasValidCronSecret } from '@/lib/cron-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  if (!hasValidCronSecret(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const result = await resetDemoAction();
  return NextResponse.json({ ok: result.ok, error: result.error ?? null });
}
