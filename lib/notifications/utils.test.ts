import { describe, expect, it } from 'vitest';

import {
  COMMON_AFRICAN_TIMEZONES,
  DEFAULT_BUSINESS_TIMEZONE,
  WHATSAPP_PHONE_PATTERN,
  WHATSAPP_TIME_PATTERN,
  getBusinessDayBounds,
  getCurrentHourForTimeZone,
  normalizeWhatsappPhone,
  parseScheduleTime,
  resolveBusinessTimeZone,
} from '@/lib/notifications/utils';

describe('resolveBusinessTimeZone', () => {
  it('returns the default timezone when the value is null, undefined, or blank', () => {
    expect(resolveBusinessTimeZone(undefined)).toBe(DEFAULT_BUSINESS_TIMEZONE);
    expect(resolveBusinessTimeZone(null)).toBe(DEFAULT_BUSINESS_TIMEZONE);
    expect(resolveBusinessTimeZone('   ')).toBe(DEFAULT_BUSINESS_TIMEZONE);
  });

  it('returns a valid timezone unchanged after trimming', () => {
    expect(resolveBusinessTimeZone('  Africa/Lagos  ')).toBe('Africa/Lagos');
  });

  it('falls back to the default timezone for invalid values', () => {
    expect(resolveBusinessTimeZone('Mars/Olympus')).toBe(DEFAULT_BUSINESS_TIMEZONE);
  });
});

describe('getBusinessDayBounds', () => {
  it('returns midnight-to-midnight bounds for an Accra business day', () => {
    const bounds = getBusinessDayBounds(new Date('2024-01-15T10:30:00.000Z'), 'Africa/Accra');

    expect(bounds.timeZone).toBe('Africa/Accra');
    expect(bounds.localDate).toMatchObject({ year: 2024, month: 1, day: 15 });
    expect(bounds.dayStart.toISOString()).toBe('2024-01-15T00:00:00.000Z');
    expect(bounds.dayEndExclusive.toISOString()).toBe('2024-01-16T00:00:00.000Z');
  });

  it('handles a timezone boundary that crosses UTC midnight', () => {
    const bounds = getBusinessDayBounds(new Date('2024-01-15T23:30:00.000Z'), 'Africa/Lagos');

    expect(bounds.timeZone).toBe('Africa/Lagos');
    expect(bounds.localDate).toMatchObject({ year: 2024, month: 1, day: 16 });
    expect(bounds.dayStart.toISOString()).toBe('2024-01-15T23:00:00.000Z');
    expect(bounds.dayEndExclusive.toISOString()).toBe('2024-01-16T23:00:00.000Z');
  });
});

describe('getCurrentHourForTimeZone', () => {
  it('returns the correct local hour for multiple African timezones', () => {
    const instant = new Date('2024-01-15T21:15:00.000Z');

    expect(getCurrentHourForTimeZone(instant, 'Africa/Accra')).toBe(21);
    expect(getCurrentHourForTimeZone(instant, 'Africa/Lagos')).toBe(22);
    expect(getCurrentHourForTimeZone(instant, 'Africa/Nairobi')).toBe(0);
  });
});

describe('parseScheduleTime', () => {
  it('parses valid HH:MM values including edge times', () => {
    expect(parseScheduleTime('00:00')).toEqual({ value: '00:00', hour: 0, minute: 0 });
    expect(parseScheduleTime('23:59')).toEqual({ value: '23:59', hour: 23, minute: 59 });
    expect(parseScheduleTime(' 09:30 ')).toEqual({ value: '09:30', hour: 9, minute: 30 });
  });

  it('falls back to the default schedule time for invalid values', () => {
    expect(parseScheduleTime('24:00')).toEqual({ value: '20:00', hour: 20, minute: 0 });
    expect(parseScheduleTime('9:30')).toEqual({ value: '20:00', hour: 20, minute: 0 });
    expect(parseScheduleTime('invalid')).toEqual({ value: '20:00', hour: 20, minute: 0 });
  });
});

describe('normalizeWhatsappPhone', () => {
  it('strips whitespace and the plus sign from a valid international number', () => {
    expect(normalizeWhatsappPhone(' +233 24 123 4567 ')).toBe('233241234567');
  });

  it('preserves valid Ghana 0-prefix numbers as digits', () => {
    expect(normalizeWhatsappPhone('0241234567')).toBe('0241234567');
  });

  it('returns null for blank or invalid phone numbers', () => {
    expect(normalizeWhatsappPhone('')).toBeNull();
    expect(normalizeWhatsappPhone(null)).toBeNull();
    expect(normalizeWhatsappPhone('23324')).toBeNull();
    expect(normalizeWhatsappPhone('233-24-123-4567')).toBeNull();
  });
});

describe('WhatsApp notification constants', () => {
  it('includes common African timezone options used by the settings UI', () => {
    expect(COMMON_AFRICAN_TIMEZONES).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: 'Africa/Accra' }),
        expect.objectContaining({ value: 'Africa/Lagos' }),
        expect.objectContaining({ value: 'Africa/Nairobi' }),
      ]),
    );
  });

  it('matches valid and invalid WhatsApp phone numbers', () => {
    expect(WHATSAPP_PHONE_PATTERN.test('+233241234567')).toBe(true);
    expect(WHATSAPP_PHONE_PATTERN.test('0241234567')).toBe(true);
    expect(WHATSAPP_PHONE_PATTERN.test('+233 24 123 4567')).toBe(false);
    expect(WHATSAPP_PHONE_PATTERN.test('123456789')).toBe(false);
  });

  it('matches valid and invalid schedule times', () => {
    expect(WHATSAPP_TIME_PATTERN.test('00:00')).toBe(true);
    expect(WHATSAPP_TIME_PATTERN.test('23:59')).toBe(true);
    expect(WHATSAPP_TIME_PATTERN.test('24:00')).toBe(false);
    expect(WHATSAPP_TIME_PATTERN.test('9:30')).toBe(false);
  });
});
