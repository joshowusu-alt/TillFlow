import type { ChangePair } from './types';

/** Format pence as GH¢ with 2 decimals (deterministic, locale-stable). */
export function formatGhPence(pence: number): string {
  const sign = pence < 0 ? '-' : '';
  const abs = Math.abs(pence);
  const whole = Math.floor(abs / 100);
  const frac = String(abs % 100).padStart(2, '0');
  return `${sign}GH¢${whole}.${frac}`;
}

export function formatSignedGhPence(pence: number): string {
  if (pence > 0) return `+${formatGhPence(pence)}`;
  return formatGhPence(pence);
}

/**
 * Percentage wording with zero-base guard.
 * Never invents “up/down by X%” when comparison is 0.
 */
export function describeChangeVsComparison(pair: ChangePair, label: string): {
  factClause: string;
  usedPercentage: boolean;
} {
  const abs = formatGhPence(Math.abs(pair.absoluteChange));
  if (pair.comparison === 0 && pair.current === 0) {
    return { factClause: `${label}: no activity in either period`, usedPercentage: false };
  }
  if (pair.comparison === 0 && pair.current > 0) {
    return {
      factClause: `${label} is ${formatGhPence(pair.current)} — new this period (no comparison base)`,
      usedPercentage: false,
    };
  }
  if (pair.current === 0 && pair.comparison > 0) {
    return {
      factClause: `${label} had ${formatGhPence(pair.comparison)} in the comparison period and none in the current period`,
      usedPercentage: false,
    };
  }
  const direction = pair.absoluteChange > 0 ? 'rose' : pair.absoluteChange < 0 ? 'fell' : 'was unchanged';
  if (pair.percentageChangeStatus === 'ok' && pair.percentageChange != null) {
    const pct = Math.abs(pair.percentageChange).toFixed(1);
    return {
      factClause: `${label} ${direction} by ${abs} (${pct}%) vs the comparison period`,
      usedPercentage: true,
    };
  }
  return {
    factClause: `${label} ${direction} by ${abs} vs the comparison period`,
    usedPercentage: false,
  };
}

export function containsForbiddenStockLanguage(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    lower.includes('out of stock for') ||
    lower.includes('days at zero') ||
    lower.includes('days out of stock') ||
    lower.includes('stock caused') ||
    lower.includes('because of stock') ||
    lower.includes('due to stock') ||
    lower.includes('stock-out caused') ||
    lower.includes('unavailable for') ||
    lower.includes('review availability')
  );
}
