import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hasValidCronSecret } from '@/lib/cron-auth';
import { isBusinessDueForDailySummary } from '@/lib/notifications/eod-schedule';
import { enqueueOwnerDailySummarySms } from '@/lib/notifications/owner-daily-summary-sms';
import { resolveBusinessTimeZone } from '@/lib/notifications/utils';

type EodSummaryBusinessRow = {
  id: string;
  name: string;
  timezone: string | null;
  whatsappScheduleTime: string | null;
};

/**
 * GET /api/cron/eod-summary
 * Protected by CRON_SECRET via Authorization: Bearer or x-cron-secret header.
 *
 * Runs on a global schedule and filters each business by enabled flag,
 * local timezone, and configured send time. The actual SMS send is handled
 * by the durable MessageOutbox dispatcher, so this route only enqueues work.
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
  const businesses = (await prisma.business.findMany({
    where: {
      ...(specificId ? { id: specificId } : {}),
      ...(force ? {} : { whatsappEnabled: true }),
      isDemo: false,
      subscriptionStatus: { not: 'CANCELLED' },
    },
    select: {
      id: true,
      name: true,
      timezone: true,
      whatsappScheduleTime: true,
    },
  })) as EodSummaryBusinessRow[];

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
    : businesses.filter((business) =>
        isBusinessDueForDailySummary(
          now,
          business.timezone,
          business.whatsappScheduleTime,
        ),
      );

  if (eligibleBusinesses.length === 0) {
    return NextResponse.json({
      ok: true,
      processed: 0,
      skipped: businesses.map((business) => ({
        id: business.id,
        name: business.name,
        timezone: resolveBusinessTimeZone(business.timezone),
        scheduledTime: business.whatsappScheduleTime ?? '20:00',
      })),
      message: 'No businesses matched their local owner summary send time',
    });
  }

  const BATCH_SIZE = 20;
  const results: Record<string, unknown> = {};
  for (let i = 0; i < eligibleBusinesses.length; i += BATCH_SIZE) {
    const batch = eligibleBusinesses.slice(i, i + BATCH_SIZE);
    const settled = await Promise.allSettled(
      batch.map((biz) => enqueueOwnerDailySummarySms(biz.id, { now })),
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
