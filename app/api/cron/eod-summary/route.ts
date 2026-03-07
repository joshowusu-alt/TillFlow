import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { _sendEodSummaryForBusiness } from '@/app/actions/notifications';

/**
 * GET /api/cron/eod-summary
 * Protected by CRON_SECRET via Authorization: Bearer, x-cron-secret header,
 * or ?secret= query param for manual triggers.
 *
 * Scheduled daily at 20:00 UTC (8 PM Ghana time) by Vercel Cron.
 * On Hobby plan only one run per day is allowed, so ALL whatsappEnabled
 * businesses are notified at that single daily fire — per-business schedule
 * time filtering is skipped for the standard cron run.
 *
 * Query params:
 *   businessId - optional; run immediately for a single business only
 *   force      - optional; set to "1" (same effect for manual test triggers)
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

  // Notify all whatsappEnabled businesses (or just the requested one).
  // Per-business schedule time filtering removed: on the Hobby plan the cron
  // fires once daily at 8 PM, so every enabled business is notified at that time.
  const businesses = await prisma.business.findMany({
    where: {
      ...(specificId ? { id: specificId } : {}),
      whatsappEnabled: true,
      isDemo: false,
    },
    select: { id: true, name: true },
  });

  if (businesses.length === 0) {
    return NextResponse.json({
      ok: true,
      processed: 0,
      message: 'No whatsapp-enabled businesses found',
    });
  }

  const results: Record<string, unknown> = {};
  for (const biz of businesses) {
    results[biz.id] = await _sendEodSummaryForBusiness(biz.id, 'CRON');
  }

  return NextResponse.json({ ok: true, processed: businesses.length, results });
}

export const runtime = 'nodejs';
