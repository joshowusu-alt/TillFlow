export const CASH_DIFFERENCE_REASON_LABELS: Record<string, string> = {
  COUNT_ERROR: 'Counting error corrected',
  MISSING_CASH: 'Missing cash',
  EXTRA_CASH: 'Extra cash found',
  LATE_POSTING: 'Late transaction posting',
  OTHER: 'Other',
};

export function isLargeCashDifference(variancePence: number, thresholdPence = 5000) {
  return Math.abs(variancePence) > thresholdPence;
}

export function cashDifferenceReason(code: string | null, explanation: string | null, details: string | null) {
  const label = code ? (Object.prototype.hasOwnProperty.call(CASH_DIFFERENCE_REASON_LABELS, code) ? CASH_DIFFERENCE_REASON_LABELS[code] : code) : '';
  const text = explanation?.trim() || details?.trim() || '';
  return text && text !== code && text !== label ? [label, text].filter(Boolean).join(' — ') : label || text || 'No reason recorded';
}
