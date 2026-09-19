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

/**
 * actionCount is a count of distinct attention *categories* (open shift,
 * Command Center issues, reorder, overdue suppliers) — not individual issues.
 * One category (Command Center) can itself bundle several issues, so the
 * copy says "areas", never "issues" or "actions", to avoid implying the
 * number is a flat issue tally.
 */
export function formatHomeAttentionActionSummary(actionCount: number): string {
  if (actionCount <= 0) return 'No urgent issues need your attention today.';
  if (actionCount === 1) return '1 area needs your attention today.';
  return `${actionCount} areas need your attention today.`;
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

export type OpenShiftTillIdentity = {
  storeName: string;
  tillName: string;
};

export function mapOpenShiftTills(
  shifts: Array<{ till?: { name: string; store: { name: string } } | null }>,
): OpenShiftTillIdentity[] {
  return shifts
    .map((shift) => {
      const storeName = shift.till?.store.name?.trim() ?? '';
      const tillName = shift.till?.name?.trim() ?? '';
      if (!storeName || !tillName) return null;
      return { storeName, tillName };
    })
    .filter((row): row is OpenShiftTillIdentity => row !== null);
}

export function formatExpectedCashFooter(input: {
  openShiftCount: number;
  tills?: OpenShiftTillIdentity[];
}): string {
  const tills = input.tills ?? [];
  if (tills.length === 1) {
    return `Current open till · ${tills[0].storeName} ${tills[0].tillName}`;
  }
  if (tills.length > 1) {
    return `All ${tills.length} open tills · all branches`;
  }
  if (input.openShiftCount > 1) {
    return `All ${input.openShiftCount} open tills · all branches`;
  }
  if (input.openShiftCount === 1) {
    return 'Current open till';
  }
  return 'No open till';
}

function formatOpenTillIdentity(tills: OpenShiftTillIdentity[]): string | null {
  if (tills.length === 0) return null;
  if (tills.length === 1) {
    return `${tills[0].storeName} · ${tills[0].tillName}`;
  }
  const list = tills.map((till) => `${till.storeName} ${till.tillName}`).join(', ');
  return `${tills.length} open tills · ${list}`;
}

export function formatCloseShiftDescription(input: {
  salesCount: number;
  openedAt: string | null;
  tills?: OpenShiftTillIdentity[];
}): string {
  const tills = input.tills ?? [];
  const pluralShifts = tills.length > 1;
  const salesPart =
    input.salesCount === 0
      ? pluralShifts
        ? '0 sales across these shifts'
        : '0 sales in this open shift'
      : `${input.salesCount} sale${input.salesCount === 1 ? '' : 's'} ${
          pluralShifts ? 'across these shifts' : 'in this open shift'
        }`;

  const parts: string[] = [];
  const identity = formatOpenTillIdentity(tills);
  if (identity) parts.push(identity);

  if (input.openedAt) {
    const opened = new Date(input.openedAt);
    if (!Number.isNaN(opened.getTime())) {
      const dateLabel = opened.toLocaleString('en-GB', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });
      parts.push(`Open since ${dateLabel}`);
    }
  }

  parts.push(salesPart);
  return parts.join(' · ');
}
