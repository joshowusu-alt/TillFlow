import { NextResponse } from 'next/server';
import { hasValidCronSecret } from '@/lib/cron-auth';
import { refreshAllActivationSnapshots } from '@/lib/activation-snapshot';

export async function GET(request: Request) {
  if (!hasValidCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = await refreshAllActivationSnapshots();
  return NextResponse.json({ ok: true, ...result });
}
