import { NextResponse } from 'next/server';
import { hasValidCronSecret } from '@/lib/cron-auth';
import { computeControlDigest } from '@/lib/control-digest/service';

export const dynamic = 'force-dynamic';

/**
 * Generates the daily control digest JSON for external cron (Vercel, QStash, etc.).
 * Protected with CRON_SECRET via Authorization: Bearer or x-cron-secret header.
 */
export async function GET(request: Request) {
  if (!hasValidCronSecret(request)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const digest = await computeControlDigest();
  return NextResponse.json({
    ok: true,
    generatedAt: digest.generatedAt,
    snapshotMeta: digest.snapshotMeta,
    counts: digest.counts,
    priorityCount: digest.priorities.length,
    whatsappText: digest.whatsappText,
    weekly: digest.weekly,
  });
}
