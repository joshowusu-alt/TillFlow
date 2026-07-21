/**
 * Owner Home attention presentation helpers.
 * Separates Home actionable-item counts from Command Center issue counts.
 * Does not change Command Center eligibility or issue detection.
 */

export type HomeAttentionFlags = {
  openShiftCount: number;
  openIssueCount: number;
  reorderNeededCount: number;
  overdueSupplierInvoiceCount: number;
  canAccessReorder: boolean;
};

export function countHomeAttentionActions(flags: HomeAttentionFlags): number {
  let count = 0;
  if (flags.openShiftCount > 0) count += 1;
  if (flags.openIssueCount > 0) count += 1;
  if (flags.reorderNeededCount > 0 && flags.canAccessReorder) count += 1;
  if (flags.overdueSupplierInvoiceCount > 0) count += 1;
  return count;
}

export function formatHomeAttentionActionSummary(actionCount: number): string {
  if (actionCount <= 0) return 'No urgent issues need your attention today.';
  if (actionCount === 1) return '1 action needs attention today.';
  return `${actionCount} actions need attention today.`;
}

export function formatHeroAttentionSubtitle(input: {
  actionCount: number;
  hasRecordImprovements: boolean;
}): string {
  if (input.actionCount > 0) {
    return formatHomeAttentionActionSummary(input.actionCount);
  }
  if (input.hasRecordImprovements) {
    return 'No urgent issues today. Some records can still be improved.';
  }
  return 'No urgent issues today.';
}

export function formatHeroStatusPill(input: {
  actionCount: number;
  openShiftCount: number;
  hasRecordImprovements: boolean;
}): string {
  if (input.actionCount > 0) {
    if (input.openShiftCount > 0 && input.actionCount === 1) {
      return 'Your open shift needs closing';
    }
    return formatHomeAttentionActionSummary(input.actionCount).replace(/\.$/, '');
  }
  if (input.hasRecordImprovements) {
    return 'Records can be improved';
  }
  return 'No urgent issues today';
}

/** Command Center card label — uses underlying issue count, not Home action count. */
export function formatCommandCenterActionLabel(issueCount: number): string {
  if (issueCount <= 0) return 'Open Command Center';
  return `${issueCount} issue${issueCount === 1 ? '' : 's'} in Command Center`;
}

export function formatCloseShiftDescription(input: {
  salesCount: number;
  openedAt: string | null;
}): string {
  const salesPart =
    input.salesCount === 0
      ? '0 sales in this open shift'
      : `${input.salesCount} sale${input.salesCount === 1 ? '' : 's'} in this open shift`;

  if (!input.openedAt) return salesPart;

  const opened = new Date(input.openedAt);
  if (Number.isNaN(opened.getTime())) return salesPart;

  const dateLabel = opened.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

  return `Open since ${dateLabel} · ${salesPart}`;
}
