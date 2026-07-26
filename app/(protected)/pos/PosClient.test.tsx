import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import PosClient from './PosClient';
import { getParkedCartsStorageKey } from '@/lib/business-scope';
import { completeSaleAction } from '@/app/actions/sales';

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

const mockedCompleteSaleAction = vi.mocked(completeSaleAction);

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
    expect(wrapper?.className).toContain('app-desktop-sidebar-sticky');
    expect(wrapper?.className).toContain('lg:block');
    expect(wrapper?.className).toContain('lg:h-fit');
    expect(wrapper?.className).toContain('lg:self-start');
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

  it('shows preparing checkout while deferred tills are unresolved, not a false no-till state', () => {
    render(<PosClient {...baseProps} tills={[]} openShiftTillIds={[]} checkoutExtrasReady={false} />);

    const tillSelect = document.querySelector('select[name="tillId"]') as HTMLSelectElement;
    expect(tillSelect).toHaveAttribute('data-checkout-till-state', 'loading');
    expect(screen.getAllByText('Preparing checkout…').length).toBeGreaterThan(0);
    expect(screen.queryByText(/No tills are configured/i)).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Complete (Cash )?Sale/i }).every((btn) => (btn as HTMLButtonElement).disabled)).toBe(true);
  });

  it('selects the first till when deferred checkout extras arrive with empty initial till state', async () => {
    const { rerender } = render(
      <PosClient {...baseProps} tills={[]} openShiftTillIds={[]} checkoutExtrasReady={false} />,
    );

    expect(document.querySelector('select[name="tillId"]')).toHaveValue('');

    rerender(
      <PosClient
        {...baseProps}
        tills={[{ id: 'till-1', name: 'Front Till' }]}
        openShiftTillIds={['till-1']}
        checkoutExtrasReady
      />,
    );

    await waitFor(() => {
      expect(document.querySelector('select[name="tillId"]')).toHaveValue('till-1');
    });
    expect(screen.queryByText(/No tills are configured/i)).not.toBeInTheDocument();
  });

  it('keeps a genuine empty-till configuration distinct from loading', () => {
    render(
      <PosClient {...baseProps} tills={[]} openShiftTillIds={[]} checkoutExtrasReady customersUnavailable={false} />,
    );

    const tillSelect = document.querySelector('select[name="tillId"]') as HTMLSelectElement;
    expect(tillSelect).toHaveAttribute('data-checkout-till-state', 'empty');
    expect(screen.getAllByText(/No tills are configured for this store/i).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: /Complete (Cash )?Sale/i }).every((btn) => (btn as HTMLButtonElement).disabled)).toBe(true);
  });

  it('defaults to Paid + Cash and labels TRANSFER as Bank Transfer', () => {
    render(<PosClient {...baseProps} />);
    expect(screen.getByLabelText(/payment status/i)).toHaveValue('PAID');
    expect(screen.getByRole('button', { name: 'Cash' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Bank Transfer' })).toBeInTheDocument();
    expect(screen.queryByLabelText(/^due date$/i)).not.toBeInTheDocument();
  });

  it('treats ordinary method clicks as mutually exclusive outside Split', async () => {
    render(<PosClient {...baseProps} />);
    await addCocaColaToCart();

    fireEvent.change(screen.getByLabelText(/cash tendered/i), { target: { value: '20' } });
    fireEvent.click(screen.getByRole('button', { name: 'MoMo' }));

    expect(screen.getByRole('button', { name: 'MoMo' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Cash' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Card' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByLabelText(/cash tendered/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Confirm that payment has been received/i)).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/transaction ref/i), { target: { value: 'MOMO-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Card' }));

    expect(screen.getByRole('button', { name: 'Card' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'MoMo' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Cash' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByPlaceholderText(/transaction ref/i)).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText(/card ref/i)).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/card ref/i), { target: { value: 'CARD-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Bank Transfer' }));

    expect(screen.getByRole('button', { name: 'Bank Transfer' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Card' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByPlaceholderText(/card ref/i)).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText(/transfer ref/i)).toBeInTheDocument();

    // Selecting a second method without Split still replaces, never accumulates.
    fireEvent.click(screen.getByRole('button', { name: 'Cash' }));
    expect(screen.getByRole('button', { name: 'Cash' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Bank Transfer' })).toHaveAttribute('aria-pressed', 'false');
    const cashTendered = document.querySelector('#pos-cash-tendered') as HTMLInputElement | null;
    expect(cashTendered).not.toBeNull();
    expect(cashTendered?.value ?? '').toBe('');
  });

  it('allows multiple methods only after explicit Split and clears them when leaving Split', async () => {
    render(<PosClient {...baseProps} />);
    await addCocaColaToCart();

    fireEvent.click(screen.getByRole('button', { name: 'Card' }));
    fireEvent.click(screen.getByRole('button', { name: 'MoMo' }));
    expect(screen.getByRole('button', { name: 'MoMo' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Card' })).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(screen.getByRole('button', { name: 'Cash' }));
    fireEvent.click(screen.getByRole('button', { name: 'Split…' }));
    expect(screen.getByRole('button', { name: 'Split…' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/Split payment — select every method/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Card' }));
    expect(screen.getByRole('button', { name: 'Cash' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Card' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Split…' }));
    expect(screen.getByRole('button', { name: 'Split…' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Cash' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Card' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByText(/Split payment — select every method/i)).not.toBeInTheDocument();
  });

  it('keeps a sticky desktop complete action and mobile sticky checkout chrome', async () => {
    render(<PosClient {...baseProps} />);
    const summarySidebar = screen.getByTestId('summary-sidebar');
    expect(summarySidebar.parentElement?.className).toContain('app-desktop-sidebar-sticky');
    expect(document.querySelector('#pos-payment-panel')).not.toBeNull();
    expect(document.querySelector('.keyboard-safe-fixed-bottom')).toBeNull();

    const search = screen.getByPlaceholderText(/type product name/i);
    fireEvent.focus(search);
    fireEvent.change(search, { target: { value: 'Coca' } });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Coca Cola/i })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /Coca Cola/i }));

    await waitFor(() => {
      expect(document.querySelector('.keyboard-safe-fixed-bottom')).not.toBeNull();
    });
    expect(screen.getAllByRole('button', { name: /Complete Cash Sale/i }).length).toBeGreaterThan(0);
  });

  it('hides due date for Paid and requires an explicit decision for Unpaid', async () => {
    render(<PosClient {...baseProps} />);
    fireEvent.change(screen.getByLabelText(/payment status/i), { target: { value: 'UNPAID' } });
    expect(screen.getByRole('button', { name: /no due date/i })).toBeInTheDocument();
    expect(screen.getAllByText(/choose a due date or no due date/i).length).toBeGreaterThan(0);
  });

  async function addCocaColaToCart() {
    const search = screen.getByPlaceholderText(/type product name/i);
    fireEvent.focus(search);
    fireEvent.change(search, { target: { value: 'Coca' } });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Coca Cola/i })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /Coca Cola/i }));
  }

  it('completes an exact-cash sale with one primary action and only resets after success', async () => {
    mockedCompleteSaleAction.mockResolvedValue({
      success: true,
      data: { receiptId: 'inv-1', totalPence: 250, transactionNumber: 'INV-1' },
    });

    render(<PosClient {...baseProps} />);
    await addCocaColaToCart();

    const completeButtons = screen.getAllByRole('button', { name: /Complete Cash Sale/i });
    expect(completeButtons.some((btn) => !(btn as HTMLButtonElement).disabled)).toBe(true);

    fireEvent.click(completeButtons.find((btn) => !(btn as HTMLButtonElement).disabled)!);

    await waitFor(() => {
      expect(mockedCompleteSaleAction).toHaveBeenCalledTimes(1);
    });

    const payload = mockedCompleteSaleAction.mock.calls[0][0];
    expect(payload.paymentStatus).toBe('PAID');
    expect(payload.cashPaid).toBe(250);
    expect(payload.cashReceivedPence).toBe(250);
    expect(payload.changeDuePence).toBe(0);
    expect(payload.dueDate).toBe('');
    expect(payload.externalRef).toMatch(/^POS_ONLINE:/);

    await waitFor(() => {
      expect(screen.getByText(/Sale Complete/i)).toBeInTheDocument();
    });
  });

  it('keeps the cart when completion is rejected', async () => {
    mockedCompleteSaleAction.mockResolvedValue({
      success: false,
      error: 'Till is not open',
    });

    render(<PosClient {...baseProps} />);
    await addCocaColaToCart();
    const completeButtons = screen.getAllByRole('button', { name: /Complete Cash Sale/i });
    fireEvent.click(completeButtons.find((btn) => !(btn as HTMLButtonElement).disabled)!);

    await waitFor(() => {
      expect(screen.getByText('Till is not open')).toBeInTheDocument();
    });
    expect(screen.getByText('Coca Cola')).toBeInTheDocument();
    expect(mockedCompleteSaleAction).toHaveBeenCalledTimes(1);
  });

  it('clears tender state when switching to Unpaid', async () => {
    render(<PosClient {...baseProps} />);
    await addCocaColaToCart();
    fireEvent.change(screen.getByLabelText(/cash tendered/i), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText(/payment status/i), { target: { value: 'UNPAID' } });
    expect(screen.queryByLabelText(/cash tendered/i)).not.toBeInTheDocument();
    expect(screen.getByText(/no payment is recorded/i)).toBeInTheDocument();
  });
});

function mockPhoneViewport(isPhone: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => {
      const matches = isPhone && query.includes('max-width: 767px');
      return {
        matches,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      };
    }),
  });
}

describe('PosClient mobile phase 1 layout', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
    mockPhoneViewport(true);
  });

  afterEach(() => {
    window.localStorage.clear();
    mockPhoneViewport(false);
  });

  it('hides desktop-only shortcut controls on phone widths', async () => {
    render(<PosClient {...baseProps} />);
    await waitFor(() => {
      expect(screen.getByText('Cart is empty')).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: /F2 focus barcode/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /\? keyboard help/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Keyboard help')).not.toBeInTheDocument();
    // Camera remains on the primary barcode field; only the empty-cart duplicate is removed.
    expect(screen.getByLabelText('Scan with camera')).toBeInTheDocument();
    expect(document.querySelector('[data-pos-desktop-shortcut]')).toBeNull();
  });

  it('keeps desktop shortcut controls available off phone widths', () => {
    mockPhoneViewport(false);
    render(<PosClient {...baseProps} />);
    expect(screen.getByRole('button', { name: /F2 focus barcode/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /\? keyboard help/i })).toBeInTheDocument();
    expect(screen.getByLabelText('Keyboard help')).toBeInTheDocument();
  });

  it('uses a compact empty-cart and open-till presentation without duplicated scan guidance', async () => {
    render(<PosClient {...baseProps} />);
    await waitFor(() => {
      expect(document.querySelector('[data-pos-empty-cart="true"]')).not.toBeNull();
      expect(document.querySelector('[data-pos-till-compact="ready"]')).not.toBeNull();
    });
    expect(screen.getByText('Cart is empty')).toBeInTheDocument();
    expect(screen.queryByText(/Scan a barcode or search a product/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Use search or the barcode field above/i)).not.toBeInTheDocument();
    expect(document.querySelector('[data-pos-checkout-collapsed="true"]')).not.toBeNull();
    expect(document.querySelector('#pos-payment-panel')).toBeNull();
  });

  it('keeps loading feedback compact and does not claim a false no-till state', async () => {
    render(<PosClient {...baseProps} tills={[]} openShiftTillIds={[]} checkoutExtrasReady={false} />);
    await waitFor(() => {
      expect(document.querySelector('[data-pos-till-compact="loading"]')).not.toBeNull();
    });
    expect(screen.getAllByText('Preparing checkout…').length).toBeGreaterThan(0);
    expect(screen.queryByText(/No tills are configured/i)).not.toBeInTheDocument();
    expect(document.querySelector('[data-pos-empty-cart="true"]')).not.toBeNull();
    // Compact loading chip — not the former oversized blank checkout stack.
    const loadingChip = document.querySelector('[data-pos-till-compact="loading"]');
    expect(loadingChip?.textContent).toMatch(/Preparing checkout/);
    expect(document.querySelector('#pos-payment-panel')).toBeNull();
  });

  it('surfaces a clear no-open-till blocking action on phone', async () => {
    render(
      <PosClient
        {...baseProps}
        business={{ ...baseProps.business, requireOpenTillForSales: true }}
        openShiftTillIds={[]}
      />,
    );
    await waitFor(() => {
      expect(document.querySelector('[data-pos-till-block="true"]')).not.toBeNull();
    });
    expect(screen.getByRole('link', { name: /Open till/i })).toHaveAttribute('href', '/shifts');
    expect(screen.getByText(/Open a till before completing sales/i)).toBeInTheDocument();
  });

  it('keeps Option B defaults and mutual exclusivity after adding an item on phone', async () => {
    render(<PosClient {...baseProps} />);
    await waitFor(() => {
      expect(screen.getByText('Cart is empty')).toBeInTheDocument();
    });

    const search = screen.getByPlaceholderText(/type product name/i);
    fireEvent.focus(search);
    fireEvent.change(search, { target: { value: 'Coca' } });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Coca Cola/i })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /Coca Cola/i }));

    await waitFor(() => {
      expect(document.querySelector('#pos-payment-panel')).not.toBeNull();
    });
    expect(screen.getByLabelText(/payment status/i)).toHaveValue('PAID');
    expect(screen.getByRole('button', { name: 'Cash' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'MoMo' }));
    expect(screen.getByRole('button', { name: 'MoMo' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Cash' })).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(screen.getByRole('button', { name: 'Split…' }));
    fireEvent.click(screen.getByRole('button', { name: 'Card' }));
    expect(screen.getByRole('button', { name: 'MoMo' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Card' })).toHaveAttribute('aria-pressed', 'true');

    const sticky = document.querySelector('[data-pos-mobile-checkout-bar="true"]');
    expect(sticky).not.toBeNull();
    expect(sticky?.className).toContain('keyboard-safe-fixed-bottom');
    expect(sticky?.className).toContain('safe-area-inset-bottom');
    expect(sticky?.className).not.toContain('hide-when-keyboard-open');
  });
});
