import { describe, expect, it } from 'vitest';
import { getFeatures, isAdvancedMode } from './features';

describe('getFeatures', () => {
  it('returns advancedReports=false and multiStore=false for SIMPLE + SINGLE_STORE', () => {
    const f = getFeatures('SIMPLE', 'SINGLE_STORE');
    expect(f.advancedReports).toBe(false);
    expect(f.advancedOps).toBe(false);
    expect(f.multiStore).toBe(false);
  });

  it('returns advancedReports=true for ADVANCED mode', () => {
    const f = getFeatures('ADVANCED', 'SINGLE_STORE');
    expect(f.advancedReports).toBe(true);
    expect(f.advancedOps).toBe(true);
    expect(f.multiStore).toBe(false);
  });

  it('returns multiStore=true for MULTI_STORE', () => {
    const f = getFeatures('SIMPLE', 'MULTI_STORE');
    expect(f.multiStore).toBe(true);
    expect(f.advancedReports).toBe(false);
  });

  it('returns both advanced and multiStore when both enabled', () => {
    const f = getFeatures('ADVANCED', 'MULTI_STORE');
    expect(f.advancedReports).toBe(true);
    expect(f.multiStore).toBe(true);
  });

  it('defaults storeMode to false when omitted', () => {
    const f = getFeatures('SIMPLE');
    expect(f.multiStore).toBe(false);
  });
});

describe('isAdvancedMode', () => {
  it('returns true for ADVANCED', () => {
    expect(isAdvancedMode('ADVANCED')).toBe(true);
  });

  it('returns false for SIMPLE', () => {
    expect(isAdvancedMode('SIMPLE')).toBe(false);
  });

  it('returns false for undefined/null', () => {
    expect(isAdvancedMode(undefined)).toBe(false);
    expect(isAdvancedMode(null)).toBe(false);
  });
});
