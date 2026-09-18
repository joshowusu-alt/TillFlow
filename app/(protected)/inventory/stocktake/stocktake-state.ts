import { getBusinessDayBounds } from '@/lib/notifications/utils';
import { resolveStocktakeLineState, type StocktakeLineState } from '@/lib/reliability/walkthrough-contracts';

export const STOCKTAKE_STALE_AFTER_DAYS = 7;

export type SubmittedStocktakeCount = {
  lineId: string;
  countedBase: number;
  confirmedZero?: boolean;
};

export function evaluateSubmittedStocktakeCount(input: {
  rawValue: string | number | null | undefined;
  confirmedZero?: boolean;
}): { submitted: boolean; countedBase: number | null } {
  if (input.rawValue === '' || input.rawValue === null || input.rawValue === undefined) {
    return { submitted: false, countedBase: null };
  }
  const countedBase = typeof input.rawValue === 'number' ? input.rawValue : Number(input.rawValue);
  if (!Number.isInteger(countedBase) || countedBase < 0) {
    return { submitted: false, countedBase: null };
  }
  if (countedBase === 0 && !input.confirmedZero) {
    return { submitted: false, countedBase: null };
  }
  return { submitted: true, countedBase };
}

export function submittedCountsFromPayload(
  counts: SubmittedStocktakeCount[],
): { lineId: string; countedBase: number }[] {
  const submitted: { lineId: string; countedBase: number }[] = [];
  for (const count of counts) {
    const evaluated = evaluateSubmittedStocktakeCount({
      rawValue: count.countedBase,
      confirmedZero: count.confirmedZero || count.countedBase !== 0,
    });
    if (evaluated.submitted && evaluated.countedBase !== null) {
      submitted.push({ lineId: count.lineId, countedBase: evaluated.countedBase });
    }
  }
  return submitted;
}

export function collectUncountedStocktakeLineIds(
  lines: Array<{
    id: string;
    countState?: string | null;
    countedAt?: Date | null;
    countedBase?: number | null;
    stocktakeStatus?: string | null;
    adjusted?: boolean;
  }>,
  submittedByLineId: Map<string, number>,
): string[] {
  const uncounted: string[] = [];
  for (const line of lines) {
    if (submittedByLineId.has(line.id)) continue;
    const state = resolveStocktakeLineState({
      countState: line.countState,
      countedAt: line.countedAt,
      countedBase: line.countedBase,
      stocktakeStatus: line.stocktakeStatus,
      adjusted: line.adjusted,
    });
    if (state === 'UNCOUNTED') uncounted.push(line.id);
  }
  return uncounted;
}

export function assertStocktakeReadyToComplete(input: {
  lines: Array<{
    id: string;
    countState?: string | null;
    countedAt?: Date | null;
    countedBase?: number | null;
    stocktakeStatus?: string | null;
    adjusted?: boolean;
  }>;
  submittedByLineId: Map<string, number>;
  allowPartial?: boolean;
  partialReason?: string;
}): { uncountedLineIds: string[] } {
  const uncountedLineIds = collectUncountedStocktakeLineIds(input.lines, input.submittedByLineId);
  if (uncountedLineIds.length === 0) {
    return { uncountedLineIds };
  }
  if (!input.allowPartial) {
    throw new Error(
      `${uncountedLineIds.length} line(s) are still uncounted. Count every product, or complete as an authorised partial count with a reason. Uncounted lines are not treated as zero.`,
    );
  }
  const reason = (input.partialReason ?? '').trim();
  if (reason.length < 3) {
    throw new Error('Enter a reason for the authorised partial count. Uncounted lines will not be treated as zero.');
  }
  return { uncountedLineIds };
}

export function isStaleInProgressStocktake(
  createdAt: Date,
  now: Date = new Date(),
  timeZone?: string | null,
): boolean {
  const createdDay = getBusinessDayBounds(createdAt, timeZone).dayStart;
  const today = getBusinessDayBounds(now, timeZone).dayStart;
  const ageMs = today.getTime() - createdDay.getTime();
  return ageMs >= STOCKTAKE_STALE_AFTER_DAYS * 86_400_000;
}

export function stocktakeCountStateLabel(state: StocktakeLineState): string {
  switch (state) {
    case 'UNCOUNTED':
      return 'Uncounted';
    case 'COUNTED':
      return 'Counted';
    case 'VARIANCE_REVIEWED':
      return 'Variance reviewed';
    case 'APPROVED':
      return 'Approved';
    case 'POSTED':
      return 'Posted';
    default:
      return state;
  }
}
