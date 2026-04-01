import { describe, expect, it } from 'vitest';
import { parseReportDate, resolveReportDateRange, resolveSelectableReportDateRange } from './date-parsing';

describe('parseReportDate', () => {
  it('returns the fallback when the value is missing', () => {
    const fallback = new Date('2026-03-12T00:00:00.000Z');
    expect(parseReportDate(undefined, fallback)).toBe(fallback);
  });

  it('returns the fallback when the value is invalid', () => {
    const fallback = new Date('2026-03-12T00:00:00.000Z');
    expect(parseReportDate('not-a-date', fallback)).toBe(fallback);
  });

  it('parses a valid report date string', () => {
    const fallback = new Date('2026-03-12T00:00:00.000Z');
    const parsed = parseReportDate('2026-02-20', fallback);
    expect(parsed).not.toBe(fallback);
    expect(parsed.toISOString()).toContain('2026-02-20');
  });
});

describe('resolveReportDateRange', () => {
  it('returns normalized input values and end-of-day end date', () => {
    const result = resolveReportDateRange(
      { from: '2026-03-01', to: '2026-03-12' },
      new Date('2026-03-01T00:00:00.000Z'),
      new Date('2026-03-12T09:00:00.000Z')
    );

    expect(result.fromInputValue).toBe('2026-03-01');
    expect(result.toInputValue).toBe('2026-03-12');
    expect(result.end.getUTCHours()).toBe(23);
    expect(result.end.getUTCMinutes()).toBe(59);
  });

  it('falls back when params are missing', () => {
    const result = resolveReportDateRange(
      undefined,
      new Date('2026-03-01T00:00:00.000Z'),
      new Date('2026-03-12T09:00:00.000Z')
    );

    expect(result.fromInputValue).toBe('2026-03-01');
    expect(result.toInputValue).toBe('2026-03-12');
  });
});

describe('resolveSelectableReportDateRange', () => {
  const now = new Date('2026-04-01T12:00:00.000Z');

  it('keeps the selected quick period when submitted dates still match that preset', () => {
    const result = resolveSelectableReportDateRange(
      { period: '30d', from: '2026-03-03', to: '2026-04-01' },
      '30d',
      now,
    );

    expect(result.periodInputValue).toBe('30d');
    expect(result.isCustomRange).toBe(false);
    expect(result.fromInputValue).toBe('2026-03-03');
    expect(result.toInputValue).toBe('2026-04-01');
  });

  it('switches to a custom range when manual dates differ from the selected quick period', () => {
    const result = resolveSelectableReportDateRange(
      { period: '30d', from: '2026-02-01', to: '2026-02-28' },
      '30d',
      now,
    );

    expect(result.periodInputValue).toBe('custom');
    expect(result.isCustomRange).toBe(true);
    expect(result.fromInputValue).toBe('2026-02-01');
    expect(result.toInputValue).toBe('2026-02-28');
    expect(result.start.toISOString()).toBe('2026-02-01T00:00:00.000Z');
    expect(result.end.toISOString()).toBe('2026-02-28T23:59:59.999Z');
  });

  it('treats date-only links without a quick period as a custom range', () => {
    const result = resolveSelectableReportDateRange(
      { from: '2026-03-10', to: '2026-03-12' },
      '30d',
      now,
    );

    expect(result.periodInputValue).toBe('custom');
    expect(result.isCustomRange).toBe(true);
    expect(result.fromInputValue).toBe('2026-03-10');
    expect(result.toInputValue).toBe('2026-03-12');
  });
});