import { NextResponse } from 'next/server';
import { listManagedBusinesses } from '@/lib/control-service';
import { getPortfolioSummaryFor, getCollectionQueuesFor, formatCedi } from '@/lib/control-metrics';
import { getPortfolioSlaCounts } from '@/lib/sla';
import { getCollectionsRhythm } from '@/lib/collections-trend';

export const dynamic = 'force-dynamic';

/**
 * Daily digest endpoint, designed to be hit by an external cron
 * (Vercel Cron, GitHub Actions, Upstash QStash — pick one). When the
 * env var DIGEST_CRON_SECRET is set, the request must include a
 * matching `x-digest-secret` header; this stops public scraping.
 *
 * Returns a JSON snapshot the receiver can post into Slack / email
 * / WhatsApp without further computation. The shape is stable so the
 * cron job stays trivial.
 *
 * Wiring it up:
 *   1. Set DIGEST_CRON_SECRET in Vercel env
 *   2. Add the cron to vercel.json (or Vercel Dashboard → Crons):
 *        { "path": "/api/digest", "schedule": "0 7 * * *" }
 *      with a header pass-through, OR
 *   3. Have your existing cron (Upstash QStash etc.) hit
 *      /api/digest with the secret header and forward the JSON to
 *      Slack via the existing notify.ts helper.
 */

const SECRET = process.env.DIGEST_CRON_SECRET?.trim() || null;

export async function GET(request: Request) {
  if (SECRET) {
    const provided = request.headers.get('x-digest-secret');
    if (provided !== SECRET) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
    }
  }

  const businesses = await listManagedBusinesses();
  const summary = getPortfolioSummaryFor(businesses);
  const queues = getCollectionQueuesFor(businesses);
  const slaCounts = getPortfolioSlaCounts(businesses);
  const rhythm = await getCollectionsRhythm();

  const headline = `Portfolio MRR ${formatCedi(summary.mrr)} · Due ${summary.dueSoon} · Locked ${summary.readOnly} · SLA ${slaCounts.red}R/${slaCounts.amber}A`;

  const lines = [
    `Today's portfolio brief`,
    headline,
    ``,
    `Collections (14d): ${formatCedi(Math.round(rhythm.totalPence / 100))} total · today ${formatCedi(Math.round(rhythm.todayPence / 100))}`,
    `Risk: ${queues.overdue.length} overdue · ${queues.locked.length} locked · ${queues.dueSoon.length} due-soon`,
    `Review queue: ${businesses.filter((b) => b.needsReview).length} unreviewed`,
  ];

  return NextResponse.json({
    ok: true,
    generatedAt: new Date().toISOString(),
    headline,
    text: lines.join('\n'),
    summary,
    slaCounts,
    rhythm: {
      totalPence: rhythm.totalPence,
      todayPence: rhythm.todayPence,
      dailyPence: rhythm.daily,
    },
    queues: {
      dueSoon: queues.dueSoon.length,
      overdue: queues.overdue.length,
      locked: queues.locked.length,
    },
  });
}
