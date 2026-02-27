import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth';
import { processOfflineSale, type OfflineSalePayload } from '../process-offline-sale';

export const dynamic = 'force-dynamic';

const MAX_BATCH_SIZE = 50;
const CONCURRENCY = 5;

interface BatchResult {
    synced: string[];
    failed: Array<{ id: string; error: string }>;
}

/**
 * Process an array of items with limited concurrency.
 */
async function mapConcurrent<T, R>(
    items: T[],
    limit: number,
    fn: (item: T) => Promise<R>
): Promise<PromiseSettledResult<R>[]> {
    const results: PromiseSettledResult<R>[] = [];
    for (let i = 0; i < items.length; i += limit) {
        const batch = items.slice(i, i + limit);
        const settled = await Promise.allSettled(batch.map(fn));
        results.push(...settled);
    }
    return results;
}

export async function POST(request: NextRequest) {
    try {
        const user = await getUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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

        const settled = await mapConcurrent(body.sales, CONCURRENCY, async (sale) => {
            const res = await processOfflineSale(sale, user);
            return { id: sale.id, invoiceId: res.invoiceId };
        });

        for (let i = 0; i < settled.length; i++) {
            const outcome = settled[i];
            const saleId = body.sales[i].id;
            if (outcome.status === 'fulfilled') {
                result.synced.push(saleId);
            } else {
                result.failed.push({
                    id: saleId,
                    error: outcome.reason instanceof Error
                        ? outcome.reason.message
                        : String(outcome.reason)
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
