import { unstable_cache } from 'next/cache';
import { prisma } from '@/lib/prisma';

export type CollectionsRhythm = {
  /** Last 14 days oldest → newest, each entry = total collected amountPence that day. */
  daily: number[];
  /** Total collected over the window in pence. */
  totalPence: number;
  /** Pence collected on the most recent day in the window. */
  todayPence: number;
};

/**
 * Returns a 14-day moving picture of payment volume so the dashboard
 * can render a sparkline of collections rhythm. Cached for 5 minutes
 * with the same tag as the rest of the portfolio so payment-record
 * mutations bust both the rhythm and the business list at once.
 */
const _loadCollectionsRhythm = unstable_cache(
  async (): Promise<CollectionsRhythm> => {
    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - 13);

    try {
      const payments = await prisma.controlPayment.findMany({
        where: { paidAt: { gte: start } },
        select: { amountPence: true, paidAt: true },
      });

      const buckets: number[] = new Array(14).fill(0);
      for (const payment of payments) {
        const dayIndex = Math.floor((payment.paidAt.getTime() - start.getTime()) / 86_400_000);
        if (dayIndex >= 0 && dayIndex < buckets.length) {
          buckets[dayIndex] += payment.amountPence;
        }
      }

      const totalPence = buckets.reduce((sum, value) => sum + value, 0);
      const todayPence = buckets[buckets.length - 1] ?? 0;
      return { daily: buckets, totalPence, todayPence };
    } catch (error) {
      console.error('[control-collections-trend] Failed to load payments', error);
      return { daily: new Array(14).fill(0), totalPence: 0, todayPence: 0 };
    }
  },
  ['control-collections-rhythm'],
  { revalidate: 300, tags: ['control-portfolio'] }
);

export async function getCollectionsRhythm(): Promise<CollectionsRhythm> {
  return _loadCollectionsRhythm();
}
