import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hasValidCronSecret } from '@/lib/cron-auth';
import { enqueueOwnerDailySummarySms } from '@/lib/notifications/owner-daily-summary-sms';
import {
  resolveBusinessTimeZone,
} from '@/lib/notifications/utils';

const OWNER_SUMMARY_SEND_HOUR = 21;
const OWNER_SUMMARY_SEND_MINUTE = 30;
const OWNER_SUMMARY_SEND_TIME = '21:30';

/**
 * GET /api/cron/eod-summary
 * Protected by CRON_SECRET via Authorization: Bearer or x-cron-secret header.
 *
 * Runs on a global schedule and filters each business by its local timezone
 * and configured owner summary hour. The actual SMS send is handled by the
 * durable MessageOutbox dispatcher, so this route only enqueues work.
 *
 * Query params:
 *   businessId - optional; run immediately for a single business only
 *   force      - optional; set to "1" (same effect for manual test triggers)
 */
export async function GET(req: NextRequest) {
  if (!hasValidCronSecret(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const specificId = req.nextUrl.searchParams.get('businessId');
  const force = req.nextUrl.searchParams.get('force') === '1';
  const businesses = await prisma.business.findMany({
    where: {
      ...(specificId ? { id: specificId } : {}),
      isDemo: false,
      subscriptionStatus: { not: 'CANCELLED' },
    },
    select: { id: true, name: true, timezone: true },
  });

  if (businesses.length === 0) {
    return NextResponse.json({
      ok: true,
      processed: 0,
      message: 'No eligible businesses found',
    });
  }

  const now = new Date();
  const eligibleBusinesses = force
    ? businesses
    : businesses.filter((business) => {
        const tz = resolveBusinessTimeZone(business.timezone);
        const parts = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: 'numeric', hour12: false, timeZone: tz }).formatToParts(now);
        const localHour = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10);
        const localMinute = parseInt(parts.find((p) => p.type === 'minute')?.value ?? '0', 10);
        return localHour === OWNER_SUMMARY_SEND_HOUR && localMinute >= OWNER_SUMMARY_SEND_MINUTE;
      });

  if (eligibleBusinesses.length === 0) {
    return NextResponse.json({
      ok: true,
      processed: 0,
      skipped: businesses.map((business) => ({
        id: business.id,
        name: business.name,
        timezone: resolveBusinessTimeZone(business.timezone),
        scheduledTime: OWNER_SUMMARY_SEND_TIME,
      })),
      message: 'No businesses matched their local owner summary send hour',
    });
  }

  const BATCH_SIZE = 20;
  const results: Record<string, unknown> = {};
  for (let i = 0; i < eligibleBusinesses.length; i += BATCH_SIZE) {
    const batch = eligibleBusinesses.slice(i, i + BATCH_SIZE);
    const settled = await Promise.allSettled(
      batch.map((biz) => enqueueOwnerDailySummarySms(biz.id, { now }))
    );
    settled.forEach((outcome, idx) => {
      const bizId = batch[idx].id;
      results[bizId] =
        outcome.status === 'fulfilled'
          ? outcome.value
          : { error: String(outcome.reason) };
    });
  }

  return NextResponse.json({
    ok: true,
    processed: eligibleBusinesses.length,
    skipped: businesses.length - eligibleBusinesses.length,
    results,
  });
}

export const runtime = 'nodejs';
