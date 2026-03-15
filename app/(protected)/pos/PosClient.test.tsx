import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import PosClient from './PosClient';
import { getParkedCartsStorageKey } from '@/lib/business-scope';

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: () => null }),
  useRouter: () => ({ prefetch: vi.fn() }),
}));

vi.mock('@/app/actions/sales', () => ({ completeSaleAction: vi.fn() }));
vi.mock('@/app/actions/mobile-money', () => ({
  checkMomoCollectionStatusAction: vi.fn(),
  initiateMomoCollectionAction: vi.fn(),
}));
vi.mock('@/lib/offline', () => ({ queueOfflineSale: vi.fn() }));

vi.mock('./components/SummarySidebar', () => ({
  default: () => <div data-testid="summary-sidebar">Summary Sidebar</div>,
}));
vi.mock('./components/KeyboardHelpModal', () => ({
  default: ({ show }: { show: boolean }) => (show ? <div data-testid="keyboard-help-modal" /> : null),
}));
vi.mock('./components/QuickAddPanel', () => ({
  default: () => <div data-testid="quick-add-panel" />,
}));
vi.mock('./components/ParkModal', () => ({
  default: () => <div data-testid="park-modal" />,
}));
vi.mock('./components/QuickAddCustomer', () => ({
  default: () => <div data-testid="quick-add-customer" />,
}));
vi.mock('./components/CameraScanner', () => ({
  default: ({ open }: { open: boolean }) => (open ? <div data-testid="camera-scanner" /> : null),
}));

const product = {
  id: 'prod-1',
  name: 'Coca Cola',
  barcode: '12345',
  sellingPriceBasePence: 250,
  vatRateBps: 0,
  promoBuyQty: 0,
  promoGetQty: 0,
  categoryId: 'soft-drinks',
  categoryName: 'Soft Drinks',
  imageUrl: null,
  onHandBase: 30,
  units: [
    { id: 'bottle', name: 'Bottle', pluralName: 'Bottles', conversionToBase: 1, isBaseUnit: true },
  ],
};

const baseProps = {
  business: {
    id: 'biz-1',
    currency: 'GHS',
    vatEnabled: false,
    momoEnabled: true,
    momoProvider: 'MTN',
    requireOpenTillForSales: false,
    discountApprovalThresholdBps: 1500,
  },
  store: { id: 'store-1', name: 'Main Store' },
  tills: [{ id: 'till-1', name: 'Front Till' }],
  openShiftTillIds: ['till-1'],
  products: [product],
  customers: [{ id: 'cust-1', name: 'Walk In Customer' }],
  units: [{ id: 'bottle', name: 'Bottle' }],
  categories: [{ id: 'soft-drinks', name: 'Soft Drinks', colour: '#2563eb' }],
};

describe('PosClient desktop layout', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it('renders the desktop summary inside a sticky desktop wrapper', () => {
    render(<PosClient {...baseProps} />);

    const summarySidebar = screen.getByTestId('summary-sidebar');
    const wrapper = summarySidebar.parentElement;

    expect(wrapper).not.toBeNull();
    expect(wrapper?.className).toContain('md:h-fit');
    expect(wrapper?.className).toContain('md:sticky');
    expect(wrapper?.className).toContain('md:top-24');
    expect(wrapper?.className).toContain('md:self-start');
  });

  it('keeps the MoMo payment option visible even when MoMo settings are off', () => {
    render(<PosClient {...baseProps} business={{ ...baseProps.business, momoEnabled: false }} />);

    expect(screen.getByRole('button', { name: 'MoMo' })).toBeInTheDocument();
  });

  it('shows the parked-sales quick rail when parked carts exist', async () => {
    window.localStorage.setItem(getParkedCartsStorageKey({ businessId: 'biz-1', storeId: 'store-1' }), JSON.stringify([
      {
        id: 'park-1',
        label: 'Needs change',
        cart: [{ id: 'prod-1:bottle', productId: 'prod-1', unitId: 'bottle', qtyInUnit: 1, discountType: 'NONE', discountValue: '' }],
        customerId: '',
        parkedAt: '2026-03-12T09:50:00.000Z',
        itemCount: 1,
      },
    ]));

    render(<PosClient {...baseProps} />);

    await waitFor(() => {
      expect(screen.getByText('Parked sales ready')).toBeInTheDocument();
    });

    expect(screen.getByText(/1 sale waiting/i)).toBeInTheDocument();
    expect(screen.getByText(/Latest: Needs change/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Recall latest' })).toBeInTheDocument();
  });

  it('closes transient overlays after an orientation change', async () => {
    render(<PosClient {...baseProps} />);

    fireEvent.click(screen.getByRole('button', { name: /\+ new/i }));
    expect(screen.getByTestId('quick-add-customer')).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new Event('orientationchange'));
    });

    await waitFor(() => {
      expect(screen.queryByTestId('quick-add-customer')).not.toBeInTheDocument();
    });
  });

  it('keeps the parked sales overlay intact after an orientation change', async () => {
    window.localStorage.setItem(getParkedCartsStorageKey({ businessId: 'biz-1', storeId: 'store-1' }), JSON.stringify([
      {
        id: 'park-1',
        label: 'Needs change',
        cart: [{ id: 'prod-1:bottle', productId: 'prod-1', unitId: 'bottle', qtyInUnit: 1, discountType: 'NONE', discountValue: '' }],
        customerId: '',
        parkedAt: '2026-03-12T09:50:00.000Z',
        itemCount: 1,
      },
    ]));

    render(<PosClient {...baseProps} />);

    await waitFor(() => {
      expect(screen.getByText('Parked sales ready')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /view parked list/i }));
    expect(screen.getByText('Tap a basket to recall it without losing your place.')).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new Event('orientationchange'));
    });

    expect(screen.getByText('Tap a basket to recall it without losing your place.')).toBeInTheDocument();
  });
});