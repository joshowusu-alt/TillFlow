/**
 * Shared Improve Your Records issue definitions.
 * Home counts and landing-page filters must use the same keys and copy.
 */

export const IMPROVE_RECORDS_ISSUE = {
  MISSING_SUPPLIER: 'MISSING_SUPPLIER',
  UNUSED_CATALOGUE: 'UNUSED_CATALOGUE',
  MISSING_COST: 'MISSING_COST',
  STOCK_SETUP_GAP: 'STOCK_SETUP_GAP',
} as const;

export type ImproveRecordsIssueKey =
  (typeof IMPROVE_RECORDS_ISSUE)[keyof typeof IMPROVE_RECORDS_ISSUE];

export type ImproveRecordsIssueDefinition = {
  key: ImproveRecordsIssueKey;
  heading: string;
  explanation: string;
  href: string;
  /** Status chip shown per affected record when relevant. */
  recordStatusLabel?: string;
  homeReturnHref: string;
};

const HOME_RETURN = '/onboarding';

export const IMPROVE_RECORDS_ISSUE_DEFS: Record<
  ImproveRecordsIssueKey,
  ImproveRecordsIssueDefinition
> = {
  MISSING_SUPPLIER: {
    key: 'MISSING_SUPPLIER',
    heading: 'Purchases missing a supplier',
    explanation:
      'These unpaid or partially paid purchases need a supplier so the amount owed can be tracked correctly.',
    href: '/purchases?issue=MISSING_SUPPLIER',
    recordStatusLabel: 'Missing supplier',
    homeReturnHref: HOME_RETURN,
  },
  UNUSED_CATALOGUE: {
    key: 'UNUSED_CATALOGUE',
    heading: 'Unused catalogue products',
    explanation:
      'These products have never been stocked or sold. Review whether you still intend to carry them.',
    href: '/products?issue=UNUSED_CATALOGUE',
    recordStatusLabel: 'Never stocked or sold',
    homeReturnHref: HOME_RETURN,
  },
  MISSING_COST: {
    key: 'MISSING_COST',
    heading: 'Products missing cost',
    explanation:
      'Profit stays incomplete until these stocked or sold products have a reliable cost.',
    href: '/products?issue=MISSING_COST',
    recordStatusLabel: 'Missing reliable cost',
    homeReturnHref: HOME_RETURN,
  },
  STOCK_SETUP_GAP: {
    key: 'STOCK_SETUP_GAP',
    heading: 'Products needing stock quantity',
    explanation:
      'These active products still need a confirmed stock quantity. Add quantity per product or import opening stock for the affected set.',
    href: '/products?issue=STOCK_SETUP_GAP',
    recordStatusLabel: 'No confirmed quantity',
    homeReturnHref: HOME_RETURN,
  },
};

export function parseImproveRecordsIssue(
  raw: string | null | undefined
): ImproveRecordsIssueKey | null {
  if (!raw) return null;
  const value = raw.trim().toUpperCase();
  if (value === IMPROVE_RECORDS_ISSUE.MISSING_SUPPLIER) return 'MISSING_SUPPLIER';
  if (value === IMPROVE_RECORDS_ISSUE.UNUSED_CATALOGUE) return 'UNUSED_CATALOGUE';
  if (value === IMPROVE_RECORDS_ISSUE.MISSING_COST) return 'MISSING_COST';
  if (value === IMPROVE_RECORDS_ISSUE.STOCK_SETUP_GAP) return 'STOCK_SETUP_GAP';
  return null;
}

/** Resolve products issue from either `issue=` or legacy `missingCost=1`. */
export function resolveProductsIssueParam(input: {
  issue?: string | null;
  missingCost?: string | null;
}): ImproveRecordsIssueKey | null {
  const fromIssue = parseImproveRecordsIssue(input.issue);
  if (fromIssue) return fromIssue;
  if (input.missingCost === '1') return 'MISSING_COST';
  return null;
}

export function improveRecordsIssueResolvedMessage(heading: string): string {
  return `This issue has been resolved. ${heading} no longer needs attention.`;
}
