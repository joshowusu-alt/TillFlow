import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth';
import { processOfflineSale, type OfflineSalePayload } from '../process-offline-sale';
import { checkSyncRateLimit } from '@/lib/security/sync-throttle';

export const dynamic = 'force-dynamic';

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

        const payload = await request.json() as OfflineSalePayload;
        const result = await processOfflineSale(payload, user);

        return NextResponse.json(result);
    } catch (error) {
        console.error('Sync sale error:', error);
        if (error instanceof Error) {
            const message = error.message;
            if (
                message.includes('not found') ||
                message.includes('No items') ||
                message.includes('Insufficient stock') ||
                message.includes('required') ||
                message.includes('Invalid offline payload') ||
                message.includes('No valid sale lines')
            ) {
                return NextResponse.json({ error: message }, { status: 400 });
            }
        }
        return NextResponse.json(
            { error: 'An internal error occurred' },
            { status: 500 }
        );
    }
}
