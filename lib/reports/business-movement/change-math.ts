import type { ChangePair, ContributionStatus } from './types';

export function absoluteChange(current: number, comparison: number): number {
  return current - comparison;
}

/**
 * Percentage change vs comparison. Returns null when comparison is 0
 * (including both-zero — caller may treat as no movement via absoluteChange).
 */
export function percentageChange(current: number, comparison: number): number | null {
  if (comparison === 0) return null;
  return ((current - comparison) / comparison) * 100;
}

export function buildChangePair(current: number, comparison: number): ChangePair {
  const abs = absoluteChange(current, comparison);
  if (comparison === 0) {
    return {
      current,
      comparison,
      absoluteChange: abs,
      percentageChange: null,
      percentageChangeStatus:
        current === 0 && comparison === 0 ? 'insufficient_data' : 'undefined_zero_comparison',
    };
  }
  return {
    current,
    comparison,
    absoluteChange: abs,
    percentageChange: percentageChange(current, comparison),
    percentageChangeStatus: 'ok',
  };
}

/**
 * Contribution of entity delta to total delta.
 * Null when totalDelta === 0 (undefined share).
 */
export function contributionToChange(
  entityAbsoluteChange: number,
  totalAbsoluteChange: number,
): { contribution: number | null; status: ContributionStatus } {
  if (totalAbsoluteChange === 0) {
    return { contribution: null, status: 'undefined_zero_total_delta' };
  }
  return {
    contribution: entityAbsoluteChange / totalAbsoluteChange,
    status: 'ok',
  };
}

export function averageOrNull(total: number, count: number): number | null {
  if (count === 0) return null;
  return total / count;
}
