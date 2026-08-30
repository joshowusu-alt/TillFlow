import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth';
import {
  loadOfflineCaptureContext,
  processOfflineSale,
  type OfflineSalePayload,
} from '../process-offline-sale';
import { checkSyncRateLimit } from '@/lib/security/sync-throttle';

export const dynamic = 'force-dynamic';

function statusToHttp(status: string): number {
  if (status === 'synced' || status === 'already_synced') return 200;
  if (status === 'needs_review') return 409;
  return 400;
}

export async function GET() {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const context = await loadOfflineCaptureContext(user);
    return NextResponse.json(context);
  } catch (error) {
    console.error('Capture context error:', error);
    return NextResponse.json({ error: 'An internal error occurred' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const throttle = await checkSyncRateLimit(user.id);
    if (throttle.blocked) {
      return NextResponse.json(
        { error: 'Too many sync requests. Please wait before retrying.' },
        { status: 429, headers: { 'Retry-After': String(throttle.retryAfterSeconds ?? 60) } }
      );
    }

    const payload = (await request.json()) as OfflineSalePayload;
    const result = await processOfflineSale(payload, user);

    if (result.success) {
      return NextResponse.json(result);
    }

    return NextResponse.json(
      { error: result.reason, status: result.status, reason: result.reason },
      { status: statusToHttp(result.status) },
    );
  } catch (error) {
    console.error('Sync sale error:', error);
    return NextResponse.json(
      { error: 'An internal error occurred' },
      { status: 500 }
    );
  }
}
