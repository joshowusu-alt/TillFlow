import { describe, expect, it } from 'vitest';
import { getBusinessPlan, getFeatures, hasPlanAccess, isAdvancedMode } from './features';

describe('getFeatures', () => {
  it('maps SIMPLE + SINGLE_STORE to Starter', () => {
    const f = getFeatures('SIMPLE', 'SINGLE_STORE');
    expect(f.plan).toBe('STARTER');
    expect(f.advancedReports).toBe(false);
    expect(f.detailedExpenseCategories).toBe(false);
    expect(f.multiStore).toBe(false);
  });

  it('maps ADVANCED + SINGLE_STORE to Growth', () => {
    const f = getFeatures('ADVANCED', 'SINGLE_STORE');
    expect(f.plan).toBe('GROWTH');
    expect(f.financialReports).toBe(true);
    expect(f.detailedExpenseCategories).toBe(true);
    expect(f.multiStore).toBe(false);
  });

  it('keeps Starter when only MULTI_STORE is enabled in legacy mode', () => {
    const f = getFeatures('SIMPLE', 'MULTI_STORE');
    expect(f.plan).toBe('STARTER');
    expect(f.multiStore).toBe(false);
    expect(f.advancedReports).toBe(false);
  });

  it('maps ADVANCED + MULTI_STORE to Pro', () => {
    const f = getFeatures('ADVANCED', 'MULTI_STORE');
    expect(f.plan).toBe('PRO');
    expect(f.ownerIntelligence).toBe(true);
    expect(f.auditLog).toBe(true);
    expect(f.multiStore).toBe(true);
  });

  it('defaults storeMode to false when omitted', () => {
    const f = getFeatures('SIMPLE');
    expect(f.multiStore).toBe(false);
  });

  it('prefers persisted plan over legacy mode mapping', () => {
    const f = getFeatures('GROWTH', 'SINGLE_STORE');
    expect(f.plan).toBe('GROWTH');
    expect(f.financialReports).toBe(true);
  });

  it('requires Pro plan before multi-branch features turn on', () => {
    const f = getFeatures('GROWTH', 'MULTI_STORE');
    expect(f.multiStore).toBe(false);
  });
});

describe('plan helpers', () => {
  it('returns Growth access for Growth and Pro', () => {
    expect(hasPlanAccess('GROWTH', 'GROWTH')).toBe(true);
    expect(hasPlanAccess('PRO', 'GROWTH')).toBe(true);
    expect(hasPlanAccess('STARTER', 'GROWTH')).toBe(false);
  });

  it('derives the expected legacy plan mapping', () => {
    expect(getBusinessPlan('SIMPLE', 'SINGLE_STORE')).toBe('STARTER');
    expect(getBusinessPlan('ADVANCED', 'SINGLE_STORE')).toBe('GROWTH');
    expect(getBusinessPlan('ADVANCED', 'MULTI_STORE')).toBe('PRO');
  });

  it('accepts an explicit persisted plan', () => {
    expect(getBusinessPlan('PRO', 'SINGLE_STORE')).toBe('PRO');
  });
});

describe('isAdvancedMode', () => {
  it('returns true for Growth/Pro legacy mappings', () => {
    expect(isAdvancedMode('ADVANCED')).toBe(true);
    expect(isAdvancedMode('ADVANCED', 'MULTI_STORE')).toBe(true);
  });

  it('returns false for SIMPLE', () => {
    expect(isAdvancedMode('SIMPLE')).toBe(false);
  });

  it('returns false for undefined/null', () => {
    expect(isAdvancedMode(undefined)).toBe(false);
    expect(isAdvancedMode(null)).toBe(false);
  });
});
