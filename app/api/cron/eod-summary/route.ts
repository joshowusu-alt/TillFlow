import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { _sendEodSummaryForBusiness } from '@/app/actions/notifications';
import { hasValidCronSecret } from '@/lib/cron-auth';
import {
  getCurrentHourForTimeZone,
  parseScheduleTime,
  resolveBusinessTimeZone,
} from '@/lib/notifications/utils';

/**
 * GET /api/cron/eod-summary
 * Protected by CRON_SECRET via Authorization: Bearer or x-cron-secret header.
 *
 * Runs on a global schedule and filters each business by its local timezone
 * and configured WhatsApp summary hour.
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
      whatsappEnabled: true,
      isDemo: false,
    },
    select: { id: true, name: true, timezone: true, whatsappScheduleTime: true },
  });

  if (businesses.length === 0) {
    return NextResponse.json({
      ok: true,
      processed: 0,
      message: 'No whatsapp-enabled businesses found',
    });
  }

  const now = new Date();
  const eligibleBusinesses = force
    ? businesses
    : businesses.filter((business) => {
        const localHour = getCurrentHourForTimeZone(now, business.timezone);
        const scheduledHour = parseScheduleTime(business.whatsappScheduleTime).hour;
        return localHour === scheduledHour;
      });

  if (eligibleBusinesses.length === 0) {
    return NextResponse.json({
      ok: true,
      processed: 0,
      skipped: businesses.map((business) => ({
        id: business.id,
        name: business.name,
        timezone: resolveBusinessTimeZone(business.timezone),
        scheduledTime: parseScheduleTime(business.whatsappScheduleTime).value,
      })),
      message: 'No businesses matched their local WhatsApp send hour',
    });
  }

  const results: Record<string, unknown> = {};
  for (const biz of eligibleBusinesses) {
    results[biz.id] = await _sendEodSummaryForBusiness(biz.id, 'CRON');
  }

  return NextResponse.json({
    ok: true,
    processed: eligibleBusinesses.length,
    skipped: businesses.length - eligibleBusinesses.length,
    results,
  });
}

export const runtime = 'nodejs';
