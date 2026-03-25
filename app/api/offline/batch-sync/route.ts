import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth';
import { processOfflineSale, type OfflineSalePayload } from '../process-offline-sale';
import { checkBatchSyncRateLimit } from '@/lib/security/sync-throttle';

export const dynamic = 'force-dynamic';

const MAX_BATCH_SIZE = 50;

interface BatchResult {
    synced: string[];
    failed: Array<{ id: string; error: string }>;
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

        const body = await request.json() as { sales?: OfflineSalePayload[] };
        if (!Array.isArray(body?.sales) || body.sales.length === 0) {
            return NextResponse.json({ error: 'No sales provided' }, { status: 400 });
        }

        if (body.sales.length > MAX_BATCH_SIZE) {
            return NextResponse.json(
                { error: `Batch too large. Maximum ${MAX_BATCH_SIZE} sales per request.` },
                { status: 400 }
            );
        }

        const result: BatchResult = { synced: [], failed: [] };

        for (const sale of body.sales) {
            try {
                await processOfflineSale(sale, user);
                result.synced.push(sale.id);
            } catch (error) {
                result.failed.push({
                    id: sale.id,
                    error: error instanceof Error
                        ? error.message
                        : String(error)
                });
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
