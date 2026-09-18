import { describe, expect, it } from 'vitest';
import {
  UnknownCommercialStatusError,
  canonicalTrialBootstrapStatus,
  coerceExistingStoredStatus,
  commercialFamily,
  editorStatusFromStoredOrDerived,
  paidActivationAllowed,
  parseStoredStatusForMutation,
  shouldRevokeMerchantSessions,
} from './control-commercial-status';

describe('canonical commercial status contract', () => {
  it('writes recognised trial state at signup instead of legacy TRIAL', () => {
    expect(canonicalTrialBootstrapStatus('TRIAL_ACTIVE')).toBe('TRIAL_ACTIVE');
    expect(canonicalTrialBootstrapStatus('TRIAL')).toBe('TRIAL_ACTIVE');
    expect(canonicalTrialBootstrapStatus(undefined)).toBe('TRIAL_ACTIVE');
  });

  it('never defaults unknown or paid values to PAID_ACTIVE on signup bootstrap', () => {
    expect(canonicalTrialBootstrapStatus('PAID_ACTIVE')).toBe('TRIAL_ACTIVE');
    expect(canonicalTrialBootstrapStatus('ACTIVE')).toBe('TRIAL_ACTIVE');
    expect(canonicalTrialBootstrapStatus('PAYMENT_RESTRICTED')).toBe('TRIAL_ACTIVE');
    expect(() => canonicalTrialBootstrapStatus('STARTER_FALLBACK')).toThrow(UnknownCommercialStatusError);
    expect(() => parseStoredStatusForMutation('ACTIVE')).toThrow(UnknownCommercialStatusError);
    expect(() => parseStoredStatusForMutation('STARTER_FALLBACK')).toThrow(UnknownCommercialStatusError);
    expect(() => parseStoredStatusForMutation('')).toThrow(UnknownCommercialStatusError);
    expect(coerceExistingStoredStatus('ACTIVE')).toBe('TRIAL_ACTIVE');
  });

  it('maps TRIAL to trial and SUSPENDED never to paid', () => {
    expect(parseStoredStatusForMutation('TRIAL')).toBe('TRIAL_ACTIVE');
    expect(parseStoredStatusForMutation('SUSPENDED')).toBe('READ_ONLY');
    expect(commercialFamily('SUSPENDED')).toBe('read_only');
    expect(commercialFamily('TRIAL')).toBe('trial');
  });

  it('maps editor/derived values onto canonical options instead of the first option', () => {
    expect(editorStatusFromStoredOrDerived('TRIAL_DUE_SOON')).toBe('TRIAL_ACTIVE');
    expect(editorStatusFromStoredOrDerived('PAYMENT_OVERDUE_GRACE')).toBe('PAID_ACTIVE');
    expect(editorStatusFromStoredOrDerived('PAYMENT_RESTRICTED')).toBe('PAYMENT_RESTRICTED');
    expect(editorStatusFromStoredOrDerived('READ_ONLY')).toBe('READ_ONLY');
  });

  it('does not treat missing payment as paid activation', () => {
    expect(paidActivationAllowed({ requestedStatus: 'PAID_ACTIVE', hasQualifyingPaidSettlement: false })).toBe(false);
    expect(paidActivationAllowed({ requestedStatus: 'TRIAL_ACTIVE', hasQualifyingPaidSettlement: false })).toBe(true);
    expect(paidActivationAllowed({ requestedStatus: 'PAID_ACTIVE', hasQualifyingPaidSettlement: true })).toBe(true);
    expect(paidActivationAllowed({ requestedStatus: 'PAID_ACTIVE', hasQualifyingPaidSettlement: false, explicitEntitlementGrant: true })).toBe(true);
  });

  it('revokes sessions for restriction and cancellation, not for trial', () => {
    expect(shouldRevokeMerchantSessions('CANCELLED')).toBe(true);
    expect(shouldRevokeMerchantSessions('READ_ONLY')).toBe(true);
    expect(shouldRevokeMerchantSessions('PAYMENT_RESTRICTED')).toBe(true);
    expect(shouldRevokeMerchantSessions('TRIAL_ACTIVE')).toBe(false);
    expect(shouldRevokeMerchantSessions('PAID_ACTIVE')).toBe(false);
  });

  it('table-driven: every canonical stored status round-trips and never collapses unknown to paid', () => {
    const canonical = [
      'TRIAL_ACTIVE',
      'PAID_ACTIVE',
      'TRIAL_RESTRICTED',
      'PAYMENT_RESTRICTED',
      'READ_ONLY',
      'CANCELLED',
    ] as const;
    for (const status of canonical) {
      expect(parseStoredStatusForMutation(status)).toBe(status);
      expect(coerceExistingStoredStatus(status)).toBe(status);
    }
    for (const invalid of ['ACTIVE', 'STARTER_FALLBACK', 'UNKNOWN', '', 'PAID']) {
      expect(() => parseStoredStatusForMutation(invalid)).toThrow(UnknownCommercialStatusError);
    }
  });
});
