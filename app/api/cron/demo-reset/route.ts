import { NextRequest, NextResponse } from 'next/server';
import { resetDemoAction } from '@/app/actions/demo';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  // Protect with CRON_SECRET
  const secret = process.env.CRON_SECRET;
  const provided =
    request.headers.get('x-cron-secret') ?? request.nextUrl.searchParams.get('secret');

  if (!secret || provided !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const result = await resetDemoAction();
  return NextResponse.json({ ok: result.ok, error: result.error ?? null });
}
