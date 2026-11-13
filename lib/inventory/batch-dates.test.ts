import { describe, expect, it } from 'vitest';
import { businessCalendarToday, calendarDaysUntil, readBatchDates, utcCalendarDate } from './batch-dates';

describe('batch date validation', () => {
  it('allows both dates to be blank', () => {
    expect(readBatchDates('', null)).toEqual({
      ok: true,
      dates: { productionDate: null, expiryDate: null },
    });
  });

  it('allows either date on its own', () => {
    const production = readBatchDates('2026-11-01', '');
    const expiry = readBatchDates('', '13/11/2026');
    expect(production.ok && production.dates.productionDate?.toISOString()).toBe('2026-11-01T00:00:00.000Z');
    expect(expiry.ok && expiry.dates.expiryDate?.toISOString()).toBe('2026-11-13T00:00:00.000Z');
  });

  it('accepts expiry on the production date and rejects an earlier expiry', () => {
    expect(readBatchDates('2026-11-13', '2026-11-13').ok).toBe(true);
    expect(readBatchDates('13/11/2026', '01/11/2026')).toEqual({
      ok: false,
      message: 'Expiry date must be on or after the production date.',
    });
  });

  it('rejects dates that are not real calendar days', () => {
    expect(readBatchDates('2026-02-31', '').ok).toBe(false);
    expect(readBatchDates('tomorrow', '').ok).toBe(false);
    expect(readBatchDates('11/13/2026', '').ok).toBe(false);
  });

  it('counts days from the business calendar, not a shifted UTC clock', () => {
    const today = businessCalendarToday(new Date('2026-11-13T23:30:00.000Z'), 'Africa/Accra');
    expect(today.toISOString()).toBe('2026-11-13T00:00:00.000Z');
    expect(calendarDaysUntil(utcCalendarDate(2026, 11, 13)!, today)).toBe(0);
    expect(calendarDaysUntil(utcCalendarDate(2026, 11, 12)!, today)).toBe(-1);
    expect(calendarDaysUntil(utcCalendarDate(2026, 11, 20)!, today)).toBe(7);
    expect(calendarDaysUntil(utcCalendarDate(2026, 11, 27)!, today)).toBe(14);
  });
});
