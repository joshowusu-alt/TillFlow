import { describe, expect, it } from 'vitest';
import { mobileReportingScopeLabel } from '@/lib/navigation/mobile-scope-label';

describe('mobileReportingScopeLabel', () => {
  it('always shows All branches on Home, even when a store name exists and KPIs have not loaded', () => {
    expect(
      mobileReportingScopeLabel({
        pathname: '/onboarding',
        storeName: 'Main Branch',
        showingBusinessWideSalesPulse: false,
      }),
    ).toBe('All branches');
  });

  it('shows All branches on nested Home paths', () => {
    expect(
      mobileReportingScopeLabel({
        pathname: '/onboarding/setup',
        storeName: 'Main',
        showingBusinessWideSalesPulse: false,
      }),
    ).toBe('All branches');
  });

  it('shows All branches off Home when the business-wide sales pulse is visible', () => {
    expect(
      mobileReportingScopeLabel({
        pathname: '/sales',
        storeName: 'Main Branch',
        showingBusinessWideSalesPulse: true,
      }),
    ).toBe('All branches');
  });

  it('shows the operational store name off Home when the sales pulse is hidden', () => {
    expect(
      mobileReportingScopeLabel({
        pathname: '/pos',
        storeName: 'Main Branch',
        showingBusinessWideSalesPulse: false,
      }),
    ).toBe('Main Branch');
  });

  it('falls back to Main branch when no store name is available off Home', () => {
    expect(
      mobileReportingScopeLabel({
        pathname: '/pos',
        storeName: null,
        showingBusinessWideSalesPulse: false,
      }),
    ).toBe('Main branch');
  });
});
