import { describe, expect, it } from 'vitest';
import {
  canAdvanceRegisterStep1,
  canAdvanceRegisterStep2,
  diagnoseDisabledRegisterAdvance,
} from './advance';

describe('register wizard enablement', () => {
  it('requires both business name and owner name on step 1', () => {
    expect(canAdvanceRegisterStep1('', 'Owner')).toBe(false);
    expect(canAdvanceRegisterStep1('Shop', '')).toBe(false);
    expect(canAdvanceRegisterStep1('  ', 'Owner')).toBe(false);
    expect(canAdvanceRegisterStep1('Reliability Preview QA', 'Reliability QA Owner')).toBe(true);
  });

  it('requires a non-empty email and a password of at least 6 characters on step 2', () => {
    expect(canAdvanceRegisterStep2('', 'abcdef')).toBe(false);
    expect(canAdvanceRegisterStep2('owner@example.com', 'abc')).toBe(false);
    expect(canAdvanceRegisterStep2('owner@example.com', 'abcdef')).toBe(true);
  });

  it('diagnoses the hosted Phase 9 case: DOM filled, Next still disabled', () => {
    const message = diagnoseDisabledRegisterAdvance({
      step: 1,
      nextDisabled: true,
      businessName: 'Reliability Preview QA',
      ownerName: 'Reliability QA Owner',
    });
    expect(message).toMatch(/React state did not accept the values/i);
    expect(message).not.toMatch(/@/);
  });

  it('names the exact missing step-1 fields', () => {
    expect(
      diagnoseDisabledRegisterAdvance({
        step: 1,
        nextDisabled: true,
        businessName: '',
        ownerName: 'Owner',
      }),
    ).toContain('Business Name');
    expect(
      diagnoseDisabledRegisterAdvance({
        step: 1,
        nextDisabled: true,
        businessName: 'Shop',
        ownerName: '',
      }),
    ).toContain('Your Name');
  });

  it('includes visible validation without leaking a password', () => {
    const message = diagnoseDisabledRegisterAdvance({
      step: 2,
      nextDisabled: true,
      businessName: 'Shop',
      ownerName: 'Owner',
      email: 'owner@example.com',
      passwordLength: 3,
      visibleErrors: ['Password must be at least 6 characters.'],
    });
    expect(message).toContain('Password (min 6 characters)');
    expect(message).toContain('Password must be at least 6 characters.');
    expect(message).not.toContain('owner@example.com');
  });
});
