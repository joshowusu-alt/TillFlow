import { describe, expect, it } from 'vitest';
import { getBusinessPlan, getFeatures, hasPlanAccess, isAdvancedMode } from './features';
import { getFeatureLockLabel } from './navigation-config';

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
    expect(f.onlineStorefront).toBe(true);
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
    expect(f.onlineStorefront).toBe(false);
  });

  it('unlocks online storefront for Growth with add-on only', () => {
    expect(getFeatures('GROWTH', 'SINGLE_STORE', { onlineStorefront: true }).onlineStorefront).toBe(true);
    expect(getFeatures('GROWTH', 'SINGLE_STORE', { onlineStorefront: false }).onlineStorefront).toBe(false);
    expect(getFeatures('GROWTH', 'SINGLE_STORE').onlineStorefront).toBe(false);
  });

  it('includes online storefront on Pro without add-on flag', () => {
    expect(getFeatures('PRO', 'SINGLE_STORE', { onlineStorefront: false }).onlineStorefront).toBe(true);
  });

  it('blocks online storefront on Starter even with add-on flag', () => {
    expect(getFeatures('STARTER', 'SINGLE_STORE', { onlineStorefront: true }).onlineStorefront).toBe(false);
  });
});

describe('merchant storefront route access matrix', () => {
  // Mirrors the gate used by Online Store settings, Storefront analytics, and
  // Online Orders pages: getFeatures(plan, storeMode, { onlineStorefront: addon }).
  const access = (plan: 'STARTER' | 'GROWTH' | 'PRO', addon: boolean) =>
    getFeatures(plan, 'SINGLE_STORE', { onlineStorefront: addon }).onlineStorefront;

  it('blocks Starter regardless of a stale/manipulated add-on flag', () => {
    expect(access('STARTER', false)).toBe(false);
    expect(access('STARTER', true)).toBe(false);
  });

  it('blocks Growth without the add-on', () => {
    expect(access('GROWTH', false)).toBe(false);
  });

  it('allows Growth with the add-on', () => {
    expect(access('GROWTH', true)).toBe(true);
  });

  it('allows Pro with the add-on flag off (storefront included)', () => {
    expect(access('PRO', false)).toBe(true);
    expect(access('PRO', true)).toBe(true);
  });
});

describe('storefront navigation lock labels', () => {
  it('uses add-on language only where the add-on can actually be purchased', () => {
    expect(getFeatureLockLabel('onlineStorefront', 'GROWTH')).toBe('ADD-ON');
    expect(getFeatureLockLabel('onlineStorefront', 'STARTER')).toBe('UPGRADE');
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
