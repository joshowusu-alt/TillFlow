import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import PosClient from './PosClient';
import { getParkedCartsStorageKey, getPosTillStorageKey } from '@/lib/business-scope';
import { completeSaleAction } from '@/app/actions/sales';

const searchParamsGet = vi.hoisted(() => vi.fn((_key?: string) => null as string | null));

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: (key: string) => searchParamsGet(key) }),
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
  sku: 'COKE-330',
  barcode: '12345',
  sellingPriceBasePence: 250,
  vatRateBps: 0,
  isTaxable: true,
  promoBuyQty: 0,
  promoGetQty: 0,
  categoryName: 'Soft Drinks',
  onHandBase: 30,
  units: [
    { id: 'bottle', name: 'Bottle', pluralName: 'Bottles', conversionToBase: 1, isBaseUnit: true, sellingPricePence: 250 },
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
    searchParamsGet.mockReturnValue(null);
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
    searchParamsGet.mockReturnValue(null);
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
      expect(document.querySelector('[data-pos-mobile-cart-bar="true"]')).not.toBeNull();
    });
    // Phase 2: checkout stays in the sheet — not inline under the catalogue.
    expect(document.querySelector('#pos-payment-panel')).toBeNull();
    expect(document.querySelector('[data-pos-mobile-checkout-bar="true"]')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /View cart/i }));
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /Cart & checkout/i })).toBeInTheDocument();
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

    const cartBar = document.querySelector('[data-pos-mobile-cart-bar="true"]');
    expect(cartBar).not.toBeNull();
    expect(cartBar?.className).toContain('keyboard-safe-fixed-bottom');
    expect(cartBar?.className).toContain('safe-area-inset-bottom');
    expect(cartBar?.className).not.toContain('hide-when-keyboard-open');
  });
});

async function addCocaColaOnPhone() {
  const search = screen.getByPlaceholderText(/type product name/i);
  fireEvent.focus(search);
  fireEvent.change(search, { target: { value: 'Coca' } });
  await waitFor(() => {
    expect(screen.getByRole('button', { name: /Coca Cola/i })).toBeInTheDocument();
  });
  fireEvent.click(screen.getByRole('button', { name: /Coca Cola/i }));
  await waitFor(() => {
    expect(document.querySelector('[data-pos-mobile-cart-bar="true"]')).not.toBeNull();
  });
}

describe('PosClient mobile phase 2 cart bar and sheet', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
    searchParamsGet.mockReturnValue(null);
    mockPhoneViewport(true);
  });

  afterEach(() => {
    window.localStorage.clear();
    mockPhoneViewport(false);
  });

  it('hides the cart bar when the cart is empty', async () => {
    render(<PosClient {...baseProps} />);
    await waitFor(() => {
      expect(screen.getByText('Cart is empty')).toBeInTheDocument();
    });
    expect(document.querySelector('[data-pos-mobile-cart-bar="true"]')).toBeNull();
    expect(screen.queryByRole('button', { name: /View cart/i })).not.toBeInTheDocument();
  });

  it('shows the cart bar with count and total after adding an item', async () => {
    render(<PosClient {...baseProps} />);
    await waitFor(() => expect(screen.getByText('Cart is empty')).toBeInTheDocument());
    await addCocaColaOnPhone();

    const openButton = screen.getByRole('button', { name: /View cart, 1 item/i });
    expect(openButton).toBeInTheDocument();
    expect(openButton).toHaveTextContent(/1 item/i);
    expect(openButton.textContent).toMatch(/GH₵|GHS|₵/);
    expect(document.querySelector('#pos-payment-panel')).toBeNull();
    expect(document.querySelector('[data-pos-cart-card="true"]')).toBeNull();
  });

  it('updates the cart bar total when quantity changes inside the sheet', async () => {
    render(<PosClient {...baseProps} />);
    await waitFor(() => expect(screen.getByText('Cart is empty')).toBeInTheDocument());
    await addCocaColaOnPhone();

    const barBefore = screen.getByRole('button', { name: /View cart, 1 item/i }).textContent ?? '';
    fireEvent.click(screen.getByRole('button', { name: /View cart/i }));
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /Cart & checkout/i })).toBeInTheDocument();
    });

    const qtyPlus = screen.getByDisplayValue('1').parentElement?.querySelector('button:last-of-type');
    expect(qtyPlus).toBeTruthy();
    fireEvent.click(qtyPlus!);

    await waitFor(() => {
      expect(screen.getByDisplayValue('2')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /Close cart and checkout/i }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /Cart & checkout/i })).not.toBeInTheDocument();
    });
    const barAfter = screen.getByRole('button', { name: /View cart, 1 item/i }).textContent ?? '';
    expect(barAfter).not.toEqual(barBefore);
    expect(barAfter).toMatch(/5\.00|GH₵5/);
  });

  it('opens an accessible sheet that preserves checkout state across close/reopen', async () => {
    render(<PosClient {...baseProps} />);
    await waitFor(() => expect(screen.getByText('Cart is empty')).toBeInTheDocument());
    await addCocaColaOnPhone();

    fireEvent.click(screen.getByRole('button', { name: /View cart/i }));
    const dialog = await screen.findByRole('dialog', { name: /Cart & checkout/i });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('button', { name: /Close cart and checkout/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'MoMo' }));
    expect(screen.getByRole('button', { name: 'MoMo' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: /Close cart and checkout/i }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /Cart & checkout/i })).not.toBeInTheDocument();
    });
    expect(document.querySelector('#pos-payment-panel')).toBeNull();
    expect(screen.getByRole('button', { name: /View cart, 1 item/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /View cart/i }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'MoMo' })).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByRole('button', { name: 'Cash' })).toHaveAttribute('aria-pressed', 'false');
    });
  });

  it('closes the sheet on Escape and keeps the cart', async () => {
    render(<PosClient {...baseProps} />);
    await waitFor(() => expect(screen.getByText('Cart is empty')).toBeInTheDocument());
    await addCocaColaOnPhone();
    fireEvent.click(screen.getByRole('button', { name: /View cart/i }));
    await screen.findByRole('dialog', { name: /Cart & checkout/i });

    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /Cart & checkout/i })).not.toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /View cart, 1 item/i })).toBeInTheDocument();
  });

  it('keeps the sheet open when sale completion fails', async () => {
    mockedCompleteSaleAction.mockResolvedValueOnce({
      success: false,
      error: 'Validation failed',
    });
    render(<PosClient {...baseProps} />);
    await waitFor(() => expect(screen.getByText('Cart is empty')).toBeInTheDocument());
    await addCocaColaOnPhone();
    fireEvent.click(screen.getByRole('button', { name: /View cart/i }));
    await screen.findByRole('dialog', { name: /Cart & checkout/i });

    const complete = document.querySelector(
      '[data-pos-mobile-sheet-footer="true"] button.btn-primary',
    ) as HTMLButtonElement | null;
    expect(complete).toBeTruthy();
    await waitFor(() => expect(complete!).not.toBeDisabled());
    fireEvent.click(complete!);

    await waitFor(() => {
      expect(mockedCompleteSaleAction).toHaveBeenCalled();
      expect(document.querySelector('[data-pos-mobile-sheet-sale-error="true"]')).not.toBeNull();
    });
    const dialog = screen.getByRole('dialog', { name: /Cart & checkout/i });
    expect(dialog).toBeInTheDocument();
    expect(dialog.querySelector('[data-pos-mobile-sheet-sale-error="true"]')?.textContent).toMatch(
      /Validation failed/,
    );
    // Must not only exist behind the modal on the catalogue page.
    expect(document.querySelector('[data-pos-sale-error="true"]')).toBeNull();
    expect(screen.getByRole('button', { name: /View cart/i })).toBeInTheDocument();
  });

  it('closes the sheet and restores barcode focus after confirmed success', async () => {
    mockedCompleteSaleAction.mockResolvedValueOnce({
      success: true,
      data: { receiptId: 'inv-phase2', totalPence: 250, transactionNumber: 'TX-P2' },
    });
    render(<PosClient {...baseProps} />);
    await waitFor(() => expect(screen.getByText('Cart is empty')).toBeInTheDocument());
    await addCocaColaOnPhone();
    fireEvent.click(screen.getByRole('button', { name: /View cart/i }));
    await screen.findByRole('dialog', { name: /Cart & checkout/i });

    const complete = document.querySelector(
      '[data-pos-mobile-sheet-footer="true"] button.btn-primary',
    ) as HTMLButtonElement | null;
    expect(complete).toBeTruthy();
    await waitFor(() => expect(complete!).not.toBeDisabled());
    fireEvent.click(complete!);

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /Cart & checkout/i })).not.toBeInTheDocument();
      expect(document.querySelector('[data-pos-mobile-cart-bar="true"]')).toBeNull();
    });
    expect(screen.getByPlaceholderText(/scan barcode/i)).toHaveFocus();
  });

  it('does not mount the phone cart bar at tablet/desktop widths', async () => {
    mockPhoneViewport(false);
    render(<PosClient {...baseProps} />);
    expect(screen.getByRole('button', { name: /F2 focus barcode/i })).toBeInTheDocument();
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
    expect(document.querySelector('[data-pos-mobile-cart-bar="true"]')).toBeNull();
    expect(screen.queryByRole('dialog', { name: /Cart & checkout/i })).not.toBeInTheDocument();
    expect(document.querySelector('[data-pos-cart-card="true"]')).not.toBeNull();
  });
});

describe('PosClient P0 transaction safety', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    vi.clearAllMocks();
    searchParamsGet.mockReturnValue(null);
    mockPhoneViewport(true);
    document.documentElement.removeAttribute('data-pos-txn-active');
  });

  afterEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    mockPhoneViewport(false);
    document.documentElement.removeAttribute('data-pos-txn-active');
  });

  it('marks an active POS transaction while the cart has items', async () => {
    render(<PosClient {...baseProps} />);
    await waitFor(() => expect(screen.getByText('Cart is empty')).toBeInTheDocument());
    expect(document.documentElement.getAttribute('data-pos-txn-active')).toBeNull();

    await addCocaColaOnPhone();
    await waitFor(() => {
      expect(document.documentElement.getAttribute('data-pos-txn-active')).toBe('true');
    });
  });

  it('preserves cart, sheet, payment values and does not submit when product props refresh', async () => {
    const { rerender } = render(<PosClient {...baseProps} />);
    await waitFor(() => expect(screen.getByText('Cart is empty')).toBeInTheDocument());
    await addCocaColaOnPhone();
    fireEvent.click(screen.getByRole('button', { name: /View cart/i }));
    await screen.findByRole('dialog', { name: /Cart & checkout/i });
    fireEvent.click(screen.getByRole('button', { name: 'Card' }));
    fireEvent.change(screen.getByPlaceholderText(/card ref/i), { target: { value: 'CARD-SAFE' } });

    const refreshedProduct = {
      ...product,
      sellingPriceBasePence: 9999,
      onHandBase: 1,
    };
    rerender(<PosClient {...baseProps} products={[refreshedProduct]} />);

    expect(screen.getByRole('dialog', { name: /Cart & checkout/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Card' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByPlaceholderText(/card ref/i)).toHaveValue('CARD-SAFE');
    expect(screen.getByText('Coca Cola')).toBeInTheDocument();
    // productOptions are owned by PosClient state — catalogue prop refresh must not
    // silently reprice an open cart line or fire a sale.
    expect(screen.getAllByText(/GH₵2\.50/).length).toBeGreaterThan(0);
    expect(mockedCompleteSaleAction).not.toHaveBeenCalled();
  });

  it('blocks repeated completion taps while a sale is pending', async () => {
    let resolveSale: ((value: {
      success: true;
      data: { receiptId: string; totalPence: number; transactionNumber: string };
    }) => void) | null = null;
    mockedCompleteSaleAction.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSale = resolve;
        }),
    );

    render(<PosClient {...baseProps} />);
    await waitFor(() => expect(screen.getByText('Cart is empty')).toBeInTheDocument());
    await addCocaColaOnPhone();
    fireEvent.click(screen.getByRole('button', { name: /View cart/i }));
    await screen.findByRole('dialog', { name: /Cart & checkout/i });

    const complete = document.querySelector(
      '[data-pos-mobile-sheet-footer="true"] button.btn-primary',
    ) as HTMLButtonElement | null;
    expect(complete).toBeTruthy();
    await waitFor(() => expect(complete!).not.toBeDisabled());

    fireEvent.click(complete!);
    fireEvent.click(complete!);
    fireEvent.click(complete!);

    await waitFor(() => expect(mockedCompleteSaleAction).toHaveBeenCalledTimes(1));
    expect(complete!.disabled).toBe(true);

    resolveSale!({
      success: true,
      data: { receiptId: 'inv-lock', totalPence: 250, transactionNumber: 'TX-LOCK' },
    });
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /Cart & checkout/i })).not.toBeInTheDocument();
    });
  });

  it('keeps cart state and the same idempotency key after an uncertain submission', async () => {
    mockedCompleteSaleAction.mockRejectedValueOnce(new Error('network reset after accept'));

    render(<PosClient {...baseProps} />);
    await waitFor(() => expect(screen.getByText('Cart is empty')).toBeInTheDocument());
    await addCocaColaOnPhone();
    fireEvent.click(screen.getByRole('button', { name: /View cart/i }));
    await screen.findByRole('dialog', { name: /Cart & checkout/i });

    const complete = document.querySelector(
      '[data-pos-mobile-sheet-footer="true"] button.btn-primary',
    ) as HTMLButtonElement | null;
    await waitFor(() => expect(complete!).not.toBeDisabled());
    fireEvent.click(complete!);

    await waitFor(() => {
      expect(screen.getByText(/Sale outcome is unclear/i)).toBeInTheDocument();
    });
    expect(screen.getByRole('dialog', { name: /Cart & checkout/i })).toBeInTheDocument();
    expect(screen.getByText('Coca Cola')).toBeInTheDocument();
    expect(screen.getByText(/Previous submission was unclear/i)).toBeInTheDocument();

    const firstRef = mockedCompleteSaleAction.mock.calls[0][0].externalRef as string;
    mockedCompleteSaleAction.mockResolvedValueOnce({
      success: true,
      data: { receiptId: 'inv-retry', totalPence: 250, transactionNumber: 'TX-RETRY' },
    });
    await waitFor(() => expect(complete!).not.toBeDisabled());
    fireEvent.click(complete!);
    await waitFor(() => expect(mockedCompleteSaleAction).toHaveBeenCalledTimes(2));
    expect(mockedCompleteSaleAction.mock.calls[1][0].externalRef).toBe(firstRef);
  });

  it('restores the persisted sale attempt id after remount with an active cart', async () => {
    const { getPosCartStorageKey } = await import('@/lib/business-scope');
    const key = `pos.saleAttempt:${baseProps.business.id}:${baseProps.store.id}`;
    window.sessionStorage.setItem(
      key,
      JSON.stringify({ attemptId: 'restored-attempt-id', ambiguousFailure: true }),
    );
    window.localStorage.setItem(
      getPosCartStorageKey({
        businessId: baseProps.business.id,
        storeId: baseProps.store.id,
      }),
      JSON.stringify([{ id: 'prod-1:bottle', productId: 'prod-1', unitId: 'bottle', qtyInUnit: 1 }]),
    );

    render(<PosClient {...baseProps} />);
    await waitFor(() => {
      expect(document.querySelector('[data-pos-mobile-cart-bar="true"]')).not.toBeNull();
    });

    fireEvent.click(screen.getByRole('button', { name: /View cart/i }));
    await screen.findByRole('dialog', { name: /Cart & checkout/i });
    await waitFor(() => {
      expect(screen.getByText(/Previous submission was unclear/i)).toBeInTheDocument();
    });
    mockedCompleteSaleAction.mockResolvedValueOnce({
      success: true,
      data: { receiptId: 'inv-restored', totalPence: 250, transactionNumber: 'TX-R' },
    });
    const complete = document.querySelector(
      '[data-pos-mobile-sheet-footer="true"] button.btn-primary',
    ) as HTMLButtonElement | null;
    await waitFor(() => expect(complete!).not.toBeDisabled());
    fireEvent.click(complete!);
    await waitFor(() => expect(mockedCompleteSaleAction).toHaveBeenCalledTimes(1));
    expect(mockedCompleteSaleAction.mock.calls[0][0].externalRef).toBe('POS_ONLINE:restored-attempt-id');
  });
});

describe('PosClient till selection', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
    searchParamsGet.mockImplementation((key?: string) => (key === 'till' ? 'till-3' : null));
  });

  afterEach(() => {
    window.localStorage.clear();
    searchParamsGet.mockReturnValue(null);
  });

  const tills = [
    { id: 'till-1', name: 'Till 1' },
    { id: 'till-3', name: 'Till 3' },
  ];

  it('prefers the till query param when that till is active and has an open shift', async () => {
    render(
      <PosClient
        {...baseProps}
        tills={tills}
        openShiftTillIds={['till-1', 'till-3']}
      />,
    );
    await waitFor(() => {
      expect(document.querySelector('[data-selected-till-id="till-3"]')).not.toBeNull();
    });
  });

  it('exposes the bound open-shift id once checkout extras are ready', async () => {
    render(
      <PosClient
        {...baseProps}
        tills={tills}
        openShiftTillIds={['till-3']}
        openShifts={[{ tillId: 'till-3', shiftId: 'shift-3' }]}
      />,
    );
    await waitFor(() => {
      const select = document.querySelector('#pos-till-select') as HTMLSelectElement | null;
      expect(select).toHaveAttribute('data-checkout-till-state', 'ready');
      expect(select).toHaveAttribute('data-pos-till-id', 'till-3');
      expect(select).toHaveAttribute('data-pos-shift-id', 'shift-3');
      expect(document.querySelector('[data-selected-shift-id="shift-3"]')).not.toBeNull();
    });
  });

  it('ignores localStorage when the saved till has no open shift', async () => {
    searchParamsGet.mockReturnValue(null);
    window.localStorage.setItem(
      getPosTillStorageKey({ businessId: 'biz-1', storeId: 'store-1' }),
      'till-1',
    );
    render(
      <PosClient
        {...baseProps}
        tills={tills}
        openShiftTillIds={['till-3']}
      />,
    );
    await waitFor(() => {
      expect(document.querySelector('[data-selected-till-id="till-3"]')).not.toBeNull();
    });
  });

  it('blocks sales when no till is open even if requireOpenTillForSales is false', async () => {
    searchParamsGet.mockReturnValue(null);
    render(
      <PosClient
        {...baseProps}
        business={{ ...baseProps.business, requireOpenTillForSales: false }}
        openShiftTillIds={[]}
      />,
    );
    await waitFor(() => {
      expect(document.querySelector('[data-pos-till-block="true"]')).not.toBeNull();
    });
  });
});
