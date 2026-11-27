import Link from 'next/link';
import { costReviewHref, type CostReviewGroup } from '@/lib/reports/cost-review-navigation';
import OneScreenCostFix, { type OneScreenCostFixContext } from './OneScreenCostFix';

/** Keep interactive preview transactions sequential and isolate a failed product. */
export async function loadOneScreenCostFixes(groups: CostReviewGroup[], context: OneScreenCostFixContext) {
  const cards = [];
  for (const group of groups) {
    try {
      cards.push(await OneScreenCostFix({ group, ...context }));
    } catch {
      cards.push(group.productId ? <Link className="inline-flex min-h-11 items-center font-semibold text-accent underline" href={costReviewHref(group.productId, context)}>Review purchase and sale records (owner confirms) →</Link> : null);
    }
  }
  return cards;
}
