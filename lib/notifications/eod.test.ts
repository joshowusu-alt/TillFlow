import { describe, expect, it } from 'vitest';

import { buildEodCronRunKey, EOD_SUMMARY_JOB_NAME, shouldUseEodRunKey } from './eod';

describe('shouldUseEodRunKey', () => {
  it('uses run keys for cron-triggered jobs only', () => {
    expect(shouldUseEodRunKey('CRON')).toBe(true);
    expect(shouldUseEodRunKey('cron')).toBe(true);
    expect(shouldUseEodRunKey('MANUAL')).toBe(false);
    expect(shouldUseEodRunKey(undefined)).toBe(false);
  });
});

describe('buildEodCronRunKey', () => {
  it('builds a stable per-business per-day key', () => {
    expect(buildEodCronRunKey('biz-123', new Date('2026-03-14T20:00:00.000Z'))).toBe(
      `${EOD_SUMMARY_JOB_NAME}:biz-123:2026-03-14`,
    );
  });
});
