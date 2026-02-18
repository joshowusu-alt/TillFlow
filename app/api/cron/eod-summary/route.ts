import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendEodSummaryAction } from '@/app/actions/notifications';

/**
 * GET /api/cron/eod-summary
 * Protected by CRON_SECRET header or query param.
 * Vercel Cron, a system scheduler, or manual trigger can call this endpoint.
 *
 * Query params:
 *   businessId - optional; if omitted runs for all whatsapp-enabled businesses
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const providedSecret =
    req.headers.get('x-cron-secret') ?? req.nextUrl.searchParams.get('secret') ?? '';

  if (secret && providedSecret !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const specificId = req.nextUrl.searchParams.get('businessId');

  const businesses = specificId
    ? await prisma.business.findMany({
        where: { id: specificId, whatsappEnabled: true, isDemo: false },
        select: { id: true, name: true },
      })
    : await prisma.business.findMany({
        where: { whatsappEnabled: true, isDemo: false },
        select: { id: true, name: true },
      });

  if (businesses.length === 0) {
    return NextResponse.json({ ok: true, processed: 0, message: 'No eligible businesses' });
  }

  const results: Record<string, unknown> = {};
  for (const biz of businesses) {
    results[biz.id] = await sendEodSummaryAction(biz.id, 'CRON');
  }

  return NextResponse.json({ ok: true, processed: businesses.length, results });
}

export const runtime = 'nodejs';
