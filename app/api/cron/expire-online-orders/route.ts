import { NextRequest, NextResponse } from 'next/server';
import { hasValidCronSecret } from '@/lib/cron-auth';
import { expireOnlineOrders } from '@/lib/services/online-order-expiry-runner';

export const runtime = 'nodejs';
export async function GET(req: NextRequest) {
  if (!hasValidCronSecret(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json(await expireOnlineOrders());
}
