import { describe, expect, it } from 'vitest';
import { buildTodayWindows, shiftLocalDateKey, windowInside } from '@/lib/reports/today/windows';

const ACCRA = 'Africa/Accra';

describe('Today windows', () => {
  it('uses the tenant date for an instant that is still the previous date in a US timezone', () => {
    const now = new Date('2026-09-30T02:00:00.000Z');
    const windows = buildTodayWindows({
      now,
      timeZone: ACCRA,
      plan: 'STARTER',
      authorisedFrom: '2026-09-24',
      authorisedTo: '2026-09-30',
    });
    expect(windows.todayKey).toBe('2026-09-30');
    expect(windows.yesterdayKey).toBe('2026-09-29');
    expect(windows.days.map((day) => day.key)).toEqual([
      '2026-09-24',
      '2026-09-25',
      '2026-09-26',
      '2026-09-27',
      '2026-09-28',
      '2026-09-29',
      '2026-09-30',
    ]);
    expect(windows.yesterday.endExclusive.getTime()).toBe(windows.today.startInclusive.getTime());
    expect(windows.today.endExclusive.getTime()).toBeGreaterThan(windows.today.startInclusive.getTime());
    expect(windows.comparison).toBeNull();
  });

  it('keeps seven distinct local dates across the London spring-forward weekend', () => {
    const now = new Date('2026-03-29T12:00:00.000Z');
    const windows = buildTodayWindows({
      now,
      timeZone: 'Europe/London',
      plan: 'GROWTH',
      authorisedFrom: '2026-01-01',
      authorisedTo: '2026-03-29',
    });
    expect(new Set(windows.days.map((day) => day.key)).size).toBe(7);
    expect(windows.days.map((day) => day.key)).toEqual([
      '2026-03-23',
      '2026-03-24',
      '2026-03-25',
      '2026-03-26',
      '2026-03-27',
      '2026-03-28',
      '2026-03-29',
    ]);
    expect(windows.yesterday.endExclusive.getTime()).toBe(windows.today.startInclusive.getTime());
    expect(windowInside(windows.today, windows.authorised)).toBe(true);
  });

  it('omits the 30-day comparison for Starter even when the authorised window could hold it', () => {
    const windows = buildTodayWindows({
      now: new Date('2026-09-30T12:00:00.000Z'),
      timeZone: ACCRA,
      plan: 'STARTER',
      authorisedFrom: shiftLocalDateKey('2026-09-30', -59),
      authorisedTo: '2026-09-30',
    });
    expect(windows.comparison).toBeNull();
  });

  it('refuses a seven-date view that starts before the authorised range', () => {
    expect(() => buildTodayWindows({
      now: new Date('2026-09-30T12:00:00.000Z'),
      timeZone: ACCRA,
      plan: 'STARTER',
      authorisedFrom: '2026-09-30',
      authorisedTo: '2026-09-30',
    })).toThrow(/outside the authorised range/);
  });
});
