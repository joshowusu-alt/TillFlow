import { describe, expect, it } from 'vitest';

import {
  GHANA_PHONE_VALIDATION_MESSAGE,
  resolveDailySummaryOwnerPhone,
  resolveDailySummaryOwnerPhoneFromStored,
} from '@/lib/notifications/owner-phone';

describe('resolveDailySummaryOwnerPhone', () => {
  it('normalises local Ghana numbers for save and preview', () => {
    expect(resolveDailySummaryOwnerPhone('0244644502')).toEqual({
      ok: true,
      phone: '233244644502',
    });
  });

  it('returns a friendly error for invalid numbers', () => {
    expect(resolveDailySummaryOwnerPhone('123')).toEqual({
      ok: false,
      error: GHANA_PHONE_VALIDATION_MESSAGE,
    });
  });

  it('allows empty values', () => {
    expect(resolveDailySummaryOwnerPhone('')).toEqual({ ok: true, phone: null });
  });
});

describe('resolveDailySummaryOwnerPhoneFromStored', () => {
  it('normalises legacy stored formats when read', () => {
    expect(resolveDailySummaryOwnerPhoneFromStored('0244644502')).toBe('233244644502');
    expect(resolveDailySummaryOwnerPhoneFromStored('+233244644502')).toBe('233244644502');
    expect(resolveDailySummaryOwnerPhoneFromStored('233244644502')).toBe('233244644502');
  });
});
