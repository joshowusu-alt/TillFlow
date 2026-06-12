import { describe, expect, it } from 'vitest';

import {
  DEFAULT_DAILY_SUMMARY_SCHEDULE,
  getLocalTimeParts,
  isBusinessDueForDailySummary,
  parseDailySummaryScheduleTime,
} from '@/lib/notifications/eod-schedule';

describe('parseDailySummaryScheduleTime', () => {
  it('parses valid HH:mm values', () => {
    expect(parseDailySummaryScheduleTime('20:00')).toEqual({ hour: 20, minute: 0 });
    expect(parseDailySummaryScheduleTime('21:30')).toEqual({ hour: 21, minute: 30 });
  });

  it('falls back to the default schedule for invalid values', () => {
    expect(parseDailySummaryScheduleTime('invalid')).toEqual(
      parseDailySummaryScheduleTime(DEFAULT_DAILY_SUMMARY_SCHEDULE),
    );
  });
});

describe('isBusinessDueForDailySummary', () => {
  it('matches the configured send time within the 15-minute window', () => {
    const now = new Date('2026-06-12T20:05:00.000Z');
    expect(isBusinessDueForDailySummary(now, 'Africa/Accra', '20:00')).toBe(true);
  });

  it('does not match outside the configured send window', () => {
    const now = new Date('2026-06-12T21:05:00.000Z');
    expect(isBusinessDueForDailySummary(now, 'Africa/Accra', '20:00')).toBe(false);
  });

  it('respects the business timezone when evaluating local time', () => {
    const now = new Date('2026-06-12T19:05:00.000Z');
    const accra = getLocalTimeParts(now, 'Africa/Accra');
    expect(accra.hour).toBe(19);
    expect(isBusinessDueForDailySummary(now, 'Africa/Accra', '19:00')).toBe(true);
  });
});
