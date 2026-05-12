import { NextRequest, NextResponse } from 'next/server';
import { hasValidCronSecret } from '@/lib/cron-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  if (!hasValidCronSecret(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  return NextResponse.json({
    ok: true,
    skipped: true,
    reason: 'The public demo uses read-only fixtures and no longer needs a database reset.',
  });
}
