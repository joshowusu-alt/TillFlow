import { describe, expect, it } from 'vitest';
import { canonicalTrialBootstrapStatus } from '../lib/control-commercial-status';
import { FORBIDDEN_MOCK_PORTFOLIO_IDS } from '../lib/control-money';
import { isInternalControlBillingHistoryEntry } from '../lib/internal-control-billing-notes';

describe('TillFlow / TishGroup cross-application contracts', () => {
  it('signup bootstrap writes TRIAL_ACTIVE, never legacy TRIAL or PAID_ACTIVE', () => {
    expect(canonicalTrialBootstrapStatus('TRIAL_ACTIVE')).toBe('TRIAL_ACTIVE');
    expect(canonicalTrialBootstrapStatus('TRIAL')).toBe('TRIAL_ACTIVE');
  });

  it('merchant billing history filters internal Control headings', () => {
    expect(isInternalControlBillingHistoryEntry('Control note added', [{ label: 'Added by' }], ['internal'])).toBe(true);
    expect(isInternalControlBillingHistoryEntry('Invoice paid', [{ label: 'Amount' }], [])).toBe(false);
  });

  it('mock portfolio IDs remain forbidden in operational output', () => {
    expect(FORBIDDEN_MOCK_PORTFOLIO_IDS).toContain('adom-mart');
  });
});
