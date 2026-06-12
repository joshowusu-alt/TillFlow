import { describe, expect, it } from 'vitest';

import { isValidGhanaPhone, maskGhanaPhone, normaliseGhanaPhone } from '@/lib/phone/ghana-phone';

describe('normaliseGhanaPhone', () => {
  it.each([
    ['0244644502', '233244644502'],
    ['024 464 4502', '233244644502'],
    ['024-464-4502', '233244644502'],
    ['244644502', '233244644502'],
    ['233244644502', '233244644502'],
    ['+233244644502', '233244644502'],
    ['00233244644502', '233244644502'],
    ['+233 24 464 4502', '233244644502'],
  ])('accepts %s as %s', (input, expected) => {
    expect(normaliseGhanaPhone(input)).toBe(expected);
    expect(isValidGhanaPhone(input)).toBe(true);
  });

  it.each(['', '   ', null, undefined, '123', 'abc0244644502', '999999999999999999', '0123', '23324464450'])(
    'rejects invalid input %s',
    (input) => {
      expect(normaliseGhanaPhone(input as string | null | undefined)).toBeNull();
      expect(isValidGhanaPhone(input as string | null | undefined)).toBe(false);
    },
  );

  it('normalises legacy stored values on read', () => {
    expect(normaliseGhanaPhone('+233244644502')).toBe('233244644502');
    expect(normaliseGhanaPhone('0244644502')).toBe('233244644502');
  });
});

describe('maskGhanaPhone', () => {
  it('masks normalised Ghana numbers consistently', () => {
    expect(maskGhanaPhone('233244644502')).toBe('+233****4502');
    expect(maskGhanaPhone('0244644502')).toBe('+233****4502');
    expect(maskGhanaPhone('+233244644502')).toBe('+233****4502');
  });

  it('does not crash on invalid or empty values', () => {
    expect(maskGhanaPhone('')).toBe('');
    expect(maskGhanaPhone('abc')).toBe('');
    expect(maskGhanaPhone(null)).toBe('');
  });
});
