import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import DismissibleSetupBanner from '@/components/DismissibleSetupBanner';
import {
  dispatchSetupBannerDismiss,
  SETUP_BANNER_DISMISS_EVENT,
} from '@/lib/navigation/nav-kpi-events';

describe('DismissibleSetupBanner', () => {
  it('hides the banner when this business completes its first sale', () => {
    sessionStorage.clear();
    render(
      <DismissibleSetupBanner businessId="biz-1">
        <p>Open POS and make your first successful sale when you can.</p>
      </DismissibleSetupBanner>,
    );

    expect(screen.getByText(/make your first successful sale/i)).toBeInTheDocument();
    act(() => {
      dispatchSetupBannerDismiss('biz-1');
    });
    expect(screen.queryByText(/make your first successful sale/i)).not.toBeInTheDocument();
    expect(sessionStorage.getItem('tillflow:setup-banner-dismissed:biz-1')).toBe('1');
  });

  it('stays hidden after a refresh remounts the layout for the same business', () => {
    sessionStorage.setItem('tillflow:setup-banner-dismissed:biz-1', '1');
    render(
      <DismissibleSetupBanner businessId="biz-1">
        <p>Ready to sell</p>
      </DismissibleSetupBanner>,
    );
    expect(screen.queryByText(/ready to sell/i)).not.toBeInTheDocument();
  });

  it('does not hide another business, and ignores an offline-unrelated event', () => {
    sessionStorage.clear();
    render(
      <DismissibleSetupBanner businessId="biz-1">
        <p>Start selling</p>
      </DismissibleSetupBanner>,
    );

    dispatchSetupBannerDismiss('biz-2');
    expect(screen.getByText(/start selling/i)).toBeInTheDocument();

    fireEvent(window, new Event('tillflow:unrelated'));
    fireEvent(
      window,
      new CustomEvent(SETUP_BANNER_DISMISS_EVENT, { detail: { businessId: 'biz-2' } }),
    );
    expect(screen.getByText(/start selling/i)).toBeInTheDocument();
  });
});
