import { describe, expect, it } from 'vitest';
import {
  getPaymentInstructionDetails,
  normalizePaymentMode,
  paymentConfigIsReady,
  type StorefrontPaymentConfig,
} from './storefront-payments';

function makeConfig(overrides: Partial<StorefrontPaymentConfig> = {}): StorefrontPaymentConfig {
  return {
    mode: 'MOMO_NUMBER',
    momoNumber: null,
    momoNetwork: null,
    merchantShortcode: null,
    bankName: null,
    bankAccountName: null,
    bankAccountNumber: null,
    bankBranch: null,
    paymentNote: null,
    ...overrides,
  };
}

describe('normalizePaymentMode', () => {
  it('falls back to MOMO_NUMBER when the stored value is missing', () => {
    expect(normalizePaymentMode(null)).toBe('MOMO_NUMBER');
  });
});

describe('paymentConfigIsReady', () => {
  it('requires a momo number for MOMO_NUMBER mode', () => {
    expect(paymentConfigIsReady(makeConfig())).toBe(false);
    expect(paymentConfigIsReady(makeConfig({ momoNumber: '0241234567' }))).toBe(true);
  });

  it('requires bank name and account number for BANK_TRANSFER mode', () => {
    expect(
      paymentConfigIsReady(
        makeConfig({
          mode: 'BANK_TRANSFER',
          bankName: 'GCB Bank',
          bankAccountNumber: null,
        }),
      ),
    ).toBe(false);

    expect(
      paymentConfigIsReady(
        makeConfig({
          mode: 'BANK_TRANSFER',
          bankName: 'GCB Bank',
          bankAccountNumber: '1234567890',
        }),
      ),
    ).toBe(true);
  });

  it('always treats MANUAL_CONFIRMATION as ready', () => {
    expect(
      paymentConfigIsReady(
        makeConfig({
          mode: 'MANUAL_CONFIRMATION',
        }),
      ),
    ).toBe(true);
  });
});

describe('getPaymentInstructionDetails', () => {
  it('reuses readiness from the shared helper', () => {
    expect(getPaymentInstructionDetails(makeConfig()).ready).toBe(false);
    expect(
      getPaymentInstructionDetails(
        makeConfig({
          mode: 'MERCHANT_SHORTCODE',
          merchantShortcode: '306506',
        }),
      ).ready,
    ).toBe(true);
  });
});
