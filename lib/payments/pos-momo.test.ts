import { describe, expect, it } from 'vitest';

import { getEnabledPosPaymentMethods, getMomoManualGuidance } from './pos-momo';

describe('getEnabledPosPaymentMethods', () => {
  it('always includes MOBILE_MONEY for manual recording mode', () => {
    expect(getEnabledPosPaymentMethods(false)).toEqual(['CASH', 'CARD', 'TRANSFER', 'MOBILE_MONEY']);
    expect(getEnabledPosPaymentMethods(true)).toEqual(['CASH', 'CARD', 'TRANSFER', 'MOBILE_MONEY']);
    expect(getEnabledPosPaymentMethods()).toEqual(['CASH', 'CARD', 'TRANSFER', 'MOBILE_MONEY']);
  });
});

describe('getMomoManualGuidance', () => {
  it('mentions provider automation for unsupported providers', () => {
    expect(getMomoManualGuidance('TELECEL')).toContain('Provider automation is not connected yet');
    expect(getMomoManualGuidance('AIRTELTIGO')).toContain('Provider automation is not connected yet');
  });

  it('falls back to generic reconciliation guidance when provider is missing', () => {
    expect(getMomoManualGuidance()).toContain('Reconciliation can be reviewed later');
  });

  it('keeps MTN guidance in manual recording mode', () => {
    const guidance = getMomoManualGuidance('MTN');
    expect(guidance).toContain('Manual recording mode');
    expect(guidance).not.toContain('Provider automation is not connected yet');
  });
});
