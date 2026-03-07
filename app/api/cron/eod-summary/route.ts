import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { _sendEodSummaryForBusiness } from '@/app/actions/notifications';

/**
 * GET /api/cron/eod-summary
 * Protected by CRON_SECRET header (Vercel Cron sets Authorization: Bearer <secret>)
 * or x-cron-secret header or ?secret= query param for manual triggers.
 *
 * Called hourly by Vercel Cron (schedule: "0 * * * *").
 * Each run compares the current UTC hour to each business's whatsappScheduleTime
 * so that only businesses whose configured time matches the current hour are notified.
 *
 * Query params:
 *   businessId - optional; bypass time-matching and run immediately for this business
 *   force      - optional; set to "1" to bypass time-matching for all businesses (manual test)
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  // Vercel Cron sends: Authorization: Bearer <secret>
  const authHeader = req.headers.get('authorization') ?? '';
  const bearerSecret = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const providedSecret =
    bearerSecret ||
    req.headers.get('x-cron-secret') ||
    req.nextUrl.searchParams.get('secret') ||
    '';

  if (!secret || providedSecret !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const specificId = req.nextUrl.searchParams.get('businessId');
  const force = req.nextUrl.searchParams.get('force') === '1';

  // Current UTC hour (0-23). Ghana is UTC+0, so this is also local time.
  const nowUtcHour = new Date().getUTCHours();

  const allBusinesses = specificId
    ? await prisma.business.findMany({
        where: { id: specificId, whatsappEnabled: true, isDemo: false },
        select: { id: true, name: true, whatsappScheduleTime: true },
      })
    : await prisma.business.findMany({
        where: { whatsappEnabled: true, isDemo: false },
        select: { id: true, name: true, whatsappScheduleTime: true },
      });

  // Filter to businesses whose schedule hour matches the current UTC hour,
  // unless force=1 or a specific businessId was requested (manual run).
  const businesses =
    force || specificId
      ? allBusinesses
      : allBusinesses.filter((biz) => {
          const scheduleHour = parseInt((biz.whatsappScheduleTime ?? '20:00').split(':')[0], 10);
          return scheduleHour === nowUtcHour;
        });

  if (businesses.length === 0) {
    return NextResponse.json({
      ok: true,
      processed: 0,
      message: `No businesses scheduled for UTC hour ${nowUtcHour}`,
    });
  }

  const results: Record<string, unknown> = {};
  for (const biz of businesses) {
    results[biz.id] = await _sendEodSummaryForBusiness(biz.id, 'CRON');
  }

  return NextResponse.json({ ok: true, processed: businesses.length, results });
}

export const runtime = 'nodejs';
