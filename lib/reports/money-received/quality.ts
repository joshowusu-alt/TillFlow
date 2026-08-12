import type { MetricResult, QualityState } from './types';

/** DataQualityCompletenessService — Money Received quality states. */
export function qualityForMoneyReceivedBundle(results: MetricResult[]): {
  overall: QualityState;
  legacyWarning: boolean;
  unverifiedPence: number | null;
  messages: string[];
} {
  const failed = results.find((r) => r.qualityState === 'QUERY_FAILED');
  if (failed) {
    return {
      overall: 'QUERY_FAILED',
      legacyWarning: false,
      unverifiedPence: null,
      messages: [failed.dependencyReason ?? 'Query failed — values are not available.'],
    };
  }

  const unverified = results.find((r) => r.metricId === 'unverified_legacy_receipts');
  const unverifiedPence = unverified?.valuePence ?? 0;
  const legacyWarning = (unverified?.recordCount ?? 0) > 0 || (unverifiedPence ?? 0) > 0;

  const messages: string[] = [];
  if (legacyWarning) {
    messages.push(
      'Some Mobile Money payments still need confirmation (usually PENDING_MANUAL) and are shown separately. They are not included in Money Received.',
    );
  }

  return {
    overall: legacyWarning ? 'UNVERIFIED' : 'COMPLETE',
    legacyWarning,
    unverifiedPence,
    messages,
  };
}
