import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth';
import {
  processOfflineSale,
  type OfflineSalePayload,
  type OfflineSyncStatus,
} from '../process-offline-sale';
import { checkBatchSyncRateLimit } from '@/lib/security/sync-throttle';

export const dynamic = 'force-dynamic';

const MAX_BATCH_SIZE = 50;

export interface BatchItemResult {
  id: string;
  status: OfflineSyncStatus;
  invoiceId?: string;
  reason?: string;
}

interface BatchResult {
  results: BatchItemResult[];
  synced: string[];
  failed: Array<{ id: string; error: string; status?: OfflineSyncStatus }>;
}

export async function POST(request: NextRequest) {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const throttle = await checkBatchSyncRateLimit(user.id);
    if (throttle.blocked) {
      return NextResponse.json(
        { error: 'Too many batch sync requests. Please wait before retrying.' },
        { status: 429, headers: { 'Retry-After': String(throttle.retryAfterSeconds ?? 60) } }
      );
    }

    const body = (await request.json()) as { sales?: OfflineSalePayload[] };
    if (!Array.isArray(body?.sales) || body.sales.length === 0) {
      return NextResponse.json({ error: 'No sales provided' }, { status: 400 });
    }

    if (body.sales.length > MAX_BATCH_SIZE) {
      return NextResponse.json(
        { error: `Batch too large. Maximum ${MAX_BATCH_SIZE} sales per request.` },
        { status: 400 }
      );
    }

    const result: BatchResult = { results: [], synced: [], failed: [] };
    const seenSequences = new Set<string>();

    for (const sale of body.sales) {
      try {
        const item = await processOfflineSale(sale, user, { seenSequences });
        const row: BatchItemResult = {
          id: sale.id,
          status: item.status,
          invoiceId: item.invoiceId,
          reason: 'reason' in item ? item.reason : undefined,
        };
        result.results.push(row);
        if (item.status === 'synced' || item.status === 'already_synced') {
          result.synced.push(sale.id);
        } else {
          result.failed.push({
            id: sale.id,
            error: row.reason ?? item.status,
            status: item.status,
          });
        }
      } catch (error) {
        result.results.push({
          id: sale.id,
          status: 'needs_review',
          reason: 'sync_error',
        });
        result.failed.push({
          id: sale.id,
          error: 'sync_error',
          status: 'needs_review',
        });
        console.error('[batch-sync] item error:', sale.id, error);
      }
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('[batch-sync] error:', error);
    return NextResponse.json(
      { error: 'An internal error occurred' },
      { status: 500 }
    );
  }
}
