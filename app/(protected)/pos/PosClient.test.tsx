import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import PosClient from './PosClient';
import { getParkedCartsStorageKey, getPosTillStorageKey } from '@/lib/business-scope';
import { openShiftAction } from '@/app/actions/shifts';
import { completeSaleAction } from '@/app/actions/sales';
import { queueOfflineSale } from '@/lib/offline';

const searchParamsGet = vi.hoisted(() => vi.fn((_key?: string) => null as string | null));
const refreshMock = vi.hoisted(() => vi.fn());
const summarySidebarSpy = vi.hoisted(() => ({
  props: null as null | { onCompleteSale?: () => void },
}));

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: (key: string) => searchParamsGet(key) }),
  useRouter: () => ({ prefetch: vi.fn(), refresh: refreshMock }),
}));

vi.mock('@/app/actions/shifts', () => ({ openShiftAction: vi.fn() }));
vi.mock('@/app/actions/sales', () => ({ completeSaleAction: vi.fn() }));
vi.mock('@/app/actions/mobile-money', () => ({
  checkMomoCollectionStatusAction: vi.fn(),
  initiateMomoCollectionAction: vi.fn(),
}));
vi.mock('@/lib/offline', () => ({ queueOfflineSale: vi.fn() }));

const mockedCompleteSaleAction = vi.mocked(completeSaleAction);

vi.mock('./components/SummarySidebar', () => ({
  default: (props: { onCompleteSale?: () => void }) => {
    summarySidebarSpy.props = props;
    return <div data-testid="summary-sidebar">Summary Sidebar</div>;
  },
}));
vi.mock('./components/KeyboardHelpModal', () => ({
  default: ({ show }: { show: boolean }) => (show ? <div data-testid="keyboard-help-modal" /> : null),
}));
vi.mock('./components/ProductShortcuts', () => ({ default: () => null }));
vi.mock('./components/QuickAddPanel', () => ({
  default: ({ initialBarcode }: { initialBarcode?: string }) => <div data-testid="quick-add-panel" data-barcode={initialBarcode} />,
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

async function addCocaColaToCart() {
  const search = screen.getByPlaceholderText(/type product name/i);
  fireEvent.focus(search);
  fireEvent.change(search, { target: { value: 'Coca' } });
  await waitFor(() => {
    expect(screen.getByRole('button', { name: /^Coca Cola/i })).toBeInTheDocument();
  });
  fireEvent.click(screen.getByRole('button', { name: /^Coca Cola/i }));
}

describe('PosClient desktop layout', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
    searchParamsGet.mockReturnValue(null);
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it('uses one input, searches without adding, and adds the top result with Enter', async () => {
    render(<PosClient {...baseProps} />);
    const search = screen.getByLabelText('Scan barcode or search products');
    expect(document.querySelectorAll('[data-pos-search-card] input')).toHaveLength(1);
    fireEvent.change(search, { target: { value: 'coca' } });
    await screen.findByRole('button', { name: /^Coca Cola/i });
    expect(screen.getByText('Cart is empty')).toBeInTheDocument();
    fireEvent.keyDown(search, { key: 'Enter' });
    expect(screen.getByRole('button', { name: 'Remove Coca Cola' })).toBeInTheDocument();
    expect(search).toHaveValue('');
    expect(search).toHaveFocus();
  });

  it.each(['12345', 'COKE-330'])('adds an exact barcode or SKU %s', async code => {
    render(<PosClient {...baseProps} />);
    const search = screen.getByLabelText('Scan barcode or search products');
    fireEvent.change(search, { target: { value: code } });
    fireEvent.keyDown(search, { key: 'Enter' });
    expect(screen.getByRole('button', { name: 'Remove Coca Cola' })).toBeInTheDocument();
    expect(search).toHaveValue('');
  });

  it.each([true, false])('adds a fast scan once (focused=%s)', async focused => {
    render(<PosClient {...baseProps} />);
    const search = screen.getByLabelText('Scan barcode or search products');
    const target = focused ? search : document.body;
    if (focused) search.focus();
    for (const [i, key] of [...'12345'].entries()) {
      fireEvent.keyDown(target, { key });
      if (focused) fireEvent.change(search, { target: { value: '12345'.slice(0, i + 1) } });
      expect(document.querySelector('#pos-product-results')).toBeNull();
    }
    fireEvent.keyDown(target, { key: 'Enter' });
    fireEvent.keyDown(search, { key: 'Enter' });
    expect(screen.getByRole('button', { name: 'Remove Coca Cola' })).toBeInTheDocument();
    expect(document.querySelector('[data-pos-payment-amounts]')).toHaveTextContent('GH₵2.50');
    expect(search).toHaveValue('');
    expect(search).toHaveFocus();
  });

  it('preserves available stock and its warning when a subsequent scan exceeds it', () => {
    render(<PosClient {...baseProps} products={[{ ...product, onHandBase: 1 }]} />);
    const search = screen.getByLabelText('Scan barcode or search products');
    const clock = vi.spyOn(Date, 'now');
    try {
      const start = Date.now();
      const scan = () => {
        fireEvent.change(search, { target: { value: '12345' } });
        fireEvent.keyDown(search, { key: 'Enter' });
      };
      clock.mockReturnValue(start);
      scan();
      clock.mockReturnValue(start + 100);
      scan();
      expect(screen.queryByText(/Only .* available for Coca Cola/)).not.toBeInTheDocument();
      clock.mockReturnValue(start + 301);
      scan();
      expect(screen.getByText(/Only .* available for Coca Cola/)).toBeInTheDocument();
      expect(screen.queryByText(/No stock available for Coca Cola/)).not.toBeInTheDocument();
      expect(document.querySelector('[data-pos-payment-amounts]')).toHaveTextContent('GH₵2.50');
      expect(screen.getAllByRole('button', { name: 'Remove Coca Cola' })).toHaveLength(1);
      expect(search).toHaveValue('');
    } finally {
      clock.mockRestore();
    }
  });

  it('refocuses unified input with F2 and blocks an unavailable search result', async () => {
    render(<PosClient {...baseProps} products={[{ ...product, onHandBase: 0 }]} />);
    const search = screen.getByLabelText('Scan barcode or search products');
    fireEvent.keyDown(document.body, { key: 'F2' });
    expect(search).toHaveFocus();
    fireEvent.change(search, { target: { value: 'coca' } });
    expect(await screen.findByRole('button', { name: /^Coca Cola/i })).toBeDisabled();
    fireEvent.keyDown(search, { key: 'Enter' });
    expect(screen.getByText('Cart is empty')).toBeInTheDocument();
    fireEvent.keyDown(search, { key: 'Escape' });
    expect(search).toHaveValue('coca');
    expect(document.querySelector('#pos-product-results')).toBeNull();
  });

  it('preserves the missing barcode quick-add flow', () => {
    render(<PosClient {...baseProps} />);
    const search = screen.getByLabelText('Scan barcode or search products');
    fireEvent.change(search, { target: { value: '999999' } });
    fireEvent.keyDown(search, { key: 'Enter' });
    expect(screen.getByTestId('quick-add-panel')).toHaveAttribute('data-barcode', '999999');
    expect(screen.getByText(/Barcode "999999" not found/)).toBeInTheDocument();
  });

  it('keeps additional and weighed barcode lookup offline', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    try {
      const weighed = { ...product, id: 'weighed', name: 'Loose rice', barcode: '200123', onHandBase: 5000,
        sellingPriceBasePence: 2000, units: [{ ...product.units[0], sellingPricePence: 2000 }] };
      render(<PosClient {...baseProps} products={[{ ...product, additionalBarcodes: ['987654'] }, weighed]} />);
      const search = screen.getByLabelText('Scan barcode or search products');
      fireEvent.change(search, { target: { value: '987654' } });
      fireEvent.keyDown(search, { key: 'Enter' });
      expect(screen.getByRole('button', { name: 'Remove Coca Cola' })).toBeInTheDocument();
      fireEvent.change(search, { target: { value: '2001230123456' } });
      fireEvent.keyDown(search, { key: 'Enter' });
      expect(screen.getByRole('button', { name: 'Remove Loose rice' })).toBeInTheDocument();
      expect(document.querySelector('[data-pos-payment-amounts]')).toHaveTextContent('GH₵27.18');
      expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('/api/pos/'))).toHaveLength(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('uses arrows to select a different result instead of the first', async () => {
    render(<PosClient {...baseProps} products={[product, { ...product, id: 'prod-2', name: 'Coca Zero', barcode: '99999', sku: 'COKE-ZERO' }]} />);
    const search = screen.getByLabelText('Scan barcode or search products');
    fireEvent.change(search, { target: { value: 'Coca' } });
    await screen.findByRole('button', { name: /^Coca Zero/i });
    fireEvent.keyDown(search, { key: 'ArrowDown' });
    fireEvent.keyDown(search, { key: 'Enter' });
    expect(screen.getByRole('button', { name: 'Remove Coca Zero' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove Coca Cola' })).not.toBeInTheDocument();
  });

  it('keeps readable change and completion with the actual checkout controls', () => {
    render(<PosClient {...baseProps} />);
    const checkout = document.querySelector('[data-pos-checkout-card]');
    expect(checkout?.querySelector('#pos-cash-tendered')).not.toBeNull();
    expect(checkout?.querySelector('[data-pos-change-due]')?.textContent).toContain('Change to give');
    expect(checkout?.querySelector('[data-pos-change-due]')?.textContent).toContain('0.00');
    expect(checkout?.querySelector('[data-testid="pos-complete-checkout"]')).not.toBeNull();
    expect(screen.queryByTestId('summary-sidebar')).not.toBeInTheDocument();
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

    fireEvent.click(screen.getByRole('button', { name: 'Change customer' }));
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

  it('treats ordinary method clicks as mutually exclusive for full payment', async () => {
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

    // Selecting another method before entering a partial amount replaces it.
    fireEvent.click(screen.getByRole('button', { name: 'Cash' }));
    expect(screen.getByRole('button', { name: 'Cash' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Bank Transfer' })).toHaveAttribute('aria-pressed', 'false');
    const cashTendered = document.querySelector('#pos-cash-tendered') as HTMLInputElement | null;
    expect(cashTendered).not.toBeNull();
    expect(cashTendered?.value ?? '').toBe('');
  });

  it('adds the remainder automatically and preserves edited amounts', async () => {
    render(<PosClient {...baseProps} />);
    await addCocaColaToCart();

    fireEvent.click(screen.getByRole('button', { name: 'Card' }));
    fireEvent.click(screen.getByRole('button', { name: 'MoMo' }));
    expect(screen.getByRole('button', { name: 'MoMo' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Card' })).toHaveAttribute('aria-pressed', 'false');

    expect(screen.queryByRole('button', { name: /split/i })).not.toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('Amount due'), { target: { value: '1.00' } });
    expect(screen.getByText('Still owed GH₵1.50')).toBeInTheDocument();
    expect(screen.getByText('Pay the rest with:')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cash' }));
    expect(screen.getByRole('button', { name: 'Cash' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'MoMo' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('Cash tendered')).toHaveValue(1.5);
    fireEvent.change(screen.getByLabelText('MoMo amount'), { target: { value: '0.50' } });
    expect(screen.getByLabelText('Cash tendered')).toHaveValue(1.5);
    expect(screen.getByText('Still owed GH₵0.50')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Card' }));
    expect(screen.getByLabelText('Card amount')).toHaveValue(0.5);
    expect(screen.getByLabelText('MoMo amount')).toHaveValue(0.5);
    fireEvent.click(screen.getByRole('button', { name: 'MoMo' }));
    expect(screen.getByRole('button', { name: 'Cash' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'MoMo' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByPlaceholderText(/transaction ref/i)).not.toBeInTheDocument();
  });

  it('submits Cash and MoMo amounts and queues the same applied amounts when offline', async () => {
    render(<PosClient {...baseProps} />);
    await addCocaColaToCart();
    fireEvent.click(screen.getByRole('button', { name: 'MoMo' }));
    fireEvent.change(screen.getByPlaceholderText('Amount due'), { target: { value: '1.00' } });
    expect(screen.getByTestId('pos-complete-checkout')).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Cash' }));
    await waitFor(() => expect(screen.getByTestId('pos-complete-checkout')).not.toBeDisabled());
    mockedCompleteSaleAction.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    vi.mocked(queueOfflineSale).mockResolvedValueOnce('queued-multi');
    fireEvent.click(screen.getByTestId('pos-complete-checkout'));
    await waitFor(() => expect(mockedCompleteSaleAction).toHaveBeenCalledWith(expect.objectContaining({
      cashPaid: 150, momoPaid: 100, cardPaid: 0, transferPaid: 0,
    })));
    await waitFor(() => expect(queueOfflineSale).toHaveBeenCalledWith(expect.objectContaining({
      payments: [{ method: 'CASH', amountPence: 150 }, { method: 'MOBILE_MONEY', amountPence: 100 }],
    })));
  });

  it.each([
    ['Card', 'Cash', { cardPaid: 100, cashPaid: 150 }],
    ['MoMo', 'Bank Transfer', { momoPaid: 100, transferPaid: 150 }],
  ] as const)('submits %s followed by %s', async (first, second, amounts) => {
    render(<PosClient {...baseProps} />);
    await addCocaColaToCart();
    fireEvent.click(screen.getByRole('button', { name: first }));
    fireEvent.change(screen.getByPlaceholderText('Amount due'), { target: { value: '1.00' } });
    fireEvent.click(screen.getByRole('button', { name: second }));
    await waitFor(() => expect(screen.getByTestId('pos-complete-checkout')).toBeEnabled());
    mockedCompleteSaleAction.mockResolvedValueOnce({
      success: true, data: { receiptId: 'inv-multi', totalPence: 250, transactionNumber: 'TX-MULTI' },
    });
    fireEvent.click(screen.getByTestId('pos-complete-checkout'));
    await waitFor(() => expect(mockedCompleteSaleAction).toHaveBeenCalledWith(expect.objectContaining(amounts)));
  });

  it('clears all tender amounts and references on switching to unpaid', async () => {
    render(<PosClient {...baseProps} />);
    await addCocaColaToCart();
    fireEvent.click(screen.getByRole('button', { name: 'MoMo' }));
    fireEvent.change(screen.getByLabelText('MoMo amount'), { target: { value: '1' } });
    fireEvent.change(screen.getByPlaceholderText('Transaction ref (optional)'), { target: { value: 'REF' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cash' }));
    fireEvent.change(screen.getByLabelText('Payment status'), { target: { value: 'UNPAID' } });
    expect(screen.queryByRole('button', { name: 'Cash' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Payment status'), { target: { value: 'PAID' } });
    expect(screen.getByLabelText(/Cash tendered/)).toHaveValue(null);
    fireEvent.click(screen.getByRole('button', { name: 'MoMo' }));
    expect(screen.getByLabelText('MoMo amount')).toHaveValue(null);
    expect(screen.getByPlaceholderText('Transaction ref (optional)')).toHaveValue('');
  });

  it('rotates the sale attempt when a mixed tender changes but retains it on unchanged retry', async () => {
    render(<PosClient {...baseProps} />);
    await addCocaColaToCart();
    fireEvent.click(screen.getByRole('button', { name: 'MoMo' }));
    fireEvent.change(screen.getByLabelText('MoMo amount'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cash' }));
    const complete = screen.getByTestId('pos-complete-checkout');
    mockedCompleteSaleAction.mockRejectedValueOnce(new Error('uncertain sale'));
    await waitFor(() => expect(complete).toBeEnabled());
    fireEvent.click(complete);
    await waitFor(() => expect(screen.getByText(/Sale outcome is unclear/i)).toBeInTheDocument());
    const initial = mockedCompleteSaleAction.mock.calls[0][0].externalRef;
    mockedCompleteSaleAction.mockRejectedValueOnce(new Error('uncertain sale'));
    fireEvent.click(complete);
    await waitFor(() => expect(mockedCompleteSaleAction).toHaveBeenCalledTimes(2));
    expect(mockedCompleteSaleAction.mock.calls[1][0].externalRef).toBe(initial);
    await waitFor(() => expect(complete).toBeEnabled());
    fireEvent.change(screen.getByLabelText('Cash tendered'), { target: { value: '2' } });
    mockedCompleteSaleAction.mockRejectedValueOnce(new Error('uncertain sale'));
    await waitFor(() => expect(complete).toBeEnabled());
    fireEvent.click(complete);
    await waitFor(() => expect(mockedCompleteSaleAction).toHaveBeenCalledTimes(3));
    expect(mockedCompleteSaleAction.mock.calls[2][0].externalRef).not.toBe(initial);
    expect(mockedCompleteSaleAction.mock.calls[2][0].cashPaid).toBe(150);
    const edited = mockedCompleteSaleAction.mock.calls[2][0].externalRef;
    await waitFor(() => expect(complete).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Cash' }));
    fireEvent.click(screen.getByRole('button', { name: 'Card' }));
    mockedCompleteSaleAction.mockResolvedValueOnce({
      success: true, data: { receiptId: 'inv-multi', totalPence: 250, transactionNumber: 'TX-MULTI' },
    });
    await waitFor(() => expect(complete).toBeEnabled());
    fireEvent.click(complete);
    await waitFor(() => expect(mockedCompleteSaleAction).toHaveBeenCalledTimes(4));
    expect(mockedCompleteSaleAction.mock.calls[3][0].externalRef).not.toBe(edited);
    expect(mockedCompleteSaleAction.mock.calls[3][0]).toMatchObject({ cashPaid: 0, cardPaid: 150, momoPaid: 100 });
  });

  it('keeps a sticky desktop complete action and mobile sticky checkout chrome', async () => {
    render(<PosClient {...baseProps} />);
    expect(document.querySelector('.pos-checkout-footer [data-pos-payment-summary]')).not.toBeNull();
    expect(document.querySelector('#pos-payment-panel')).not.toBeNull();
    expect(document.querySelector('.keyboard-safe-fixed-bottom')).toBeNull();

    const search = screen.getByPlaceholderText(/type product name/i);
    fireEvent.focus(search);
    fireEvent.change(search, { target: { value: 'Coca' } });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^Coca Cola/i })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /^Coca Cola/i }));

    await waitFor(() => {
      expect(document.querySelector('.keyboard-safe-fixed-bottom')).not.toBeNull();
    });
    expect(screen.getAllByRole('button', { name: /Complete Cash Sale/i }).length).toBeGreaterThan(0);
    const inlineComplete = screen.getByTestId('pos-complete-checkout');
    expect(inlineComplete.className).toContain('hidden');
    expect(inlineComplete.className).toContain('lg:inline-flex');
    expect(inlineComplete.className).not.toContain('md:inline-flex');
    expect(inlineComplete).not.toHaveAttribute('aria-hidden');
    expect(inlineComplete).not.toHaveAttribute('tabindex');
    const tabletBar = document.querySelector('[data-pos-mobile-checkout-bar="true"]');
    expect(tabletBar).toBeNull();
    expect(document.querySelector('[data-pos-mobile-cart-bar="true"]')?.parentElement?.className).toContain('lg:hidden');
    expect(summarySidebarSpy.props?.onCompleteSale).toBeUndefined();
  });

  it('hides due date for Paid and requires an explicit decision for Unpaid', async () => {
    render(<PosClient {...baseProps} />);
    fireEvent.change(screen.getByLabelText(/payment status/i), { target: { value: 'UNPAID' } });
    expect(screen.getByRole('button', { name: /no due date/i })).toBeInTheDocument();
    expect(screen.getAllByText(/choose a due date or no due date/i).length).toBeGreaterThan(0);
  });


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
    expect(refreshMock).toHaveBeenCalled();
    expect(sessionStorage.getItem('tillflow:setup-banner-dismissed:biz-1')).toBe('1');

    const payload = mockedCompleteSaleAction.mock.calls[0][0];
    expect(payload.paymentStatus).toBe('PAID');
    expect(payload.cashPaid).toBe(250);
    expect(payload.cashReceivedPence).toBe(250);
    expect(payload.changeDuePence).toBe(0);
    expect(payload.dueDate).toBe('');
    expect(payload.externalRef).toMatch(/^POS_ONLINE:/);

    await waitFor(() => {
      expect(screen.getByTestId('pos-sale-complete')).toBeVisible();
      expect(screen.getByTestId('pos-ready-next-customer')).toBeVisible();
      expect(screen.getByText('Sale Complete!')).toBeInTheDocument();
      expect(screen.getByText('Ready for next customer')).toBeInTheDocument();
      expect(screen.getAllByTestId('pos-sale-complete')).toHaveLength(1);
      expect(screen.getAllByTestId('pos-ready-next-customer')).toHaveLength(1);
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

function expectClassName(el: Element | null, fragment: string) {
  expect(el).not.toBeNull();
  expect(el!.className).toContain(fragment);
}

function expectHiddenBelowMd(el: Element | null) {
  expectClassName(el, 'max-md:hidden');
}

describe('PosClient CSS-first layout contract', () => {
  it('does not swap phone vs desktop POS structure with useMatchMedia', () => {
    const src = readFileSync(join(process.cwd(), 'app/(protected)/pos/PosClient.tsx'), 'utf8');
    expect(src).not.toContain('useMatchMedia');
    expect(src).not.toContain('isPhoneViewport');
    expect(src).toContain('data-pos-checkout-full');
    expect(src).toContain('data-pos-checkout-collapsed');
  });
});

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
    expectClassName(document.querySelector('[data-pos-desktop-empty-actions="true"]'), 'hidden');
    expectClassName(document.querySelector('[data-pos-desktop-empty-actions="true"]'), 'md:flex');
    expectClassName(screen.getByLabelText('Keyboard help'), 'hidden');
    expectClassName(screen.getByLabelText('Keyboard help'), 'md:inline-flex');
    // Camera remains on the primary barcode field; empty-cart duplicate stays desktop-only via CSS.
    expect(screen.getByLabelText('Scan with camera')).toBeInTheDocument();
  });

  it('keeps desktop shortcut controls available off phone widths', () => {
    mockPhoneViewport(false);
    render(<PosClient {...baseProps} />);
    expect(screen.getByRole('button', { name: /F2 focus scan\/search/i })).toBeInTheDocument();
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
    expectClassName(screen.getByText(/Scan a barcode or search a product/i), 'hidden');
    expect(screen.queryByText(/Use search or the barcode field above/i)).not.toBeInTheDocument();
    expect(document.querySelector('[data-pos-checkout-collapsed="true"]')).not.toBeNull();
    const checkoutFull = document.querySelector('[data-pos-checkout-full="true"]');
    expectHiddenBelowMd(checkoutFull);
    expect(checkoutFull?.querySelector('#pos-payment-panel')).not.toBeNull();
  });

  it('unmounts the empty-cart cash-ready hint once a line is in the cart', async () => {
    render(<PosClient {...baseProps} />);
    await waitFor(() => {
      expect(document.querySelector('[data-pos-checkout-collapsed="true"]')).not.toBeNull();
    });
    const search = screen.getByPlaceholderText(/type product name/i);
    fireEvent.focus(search);
    fireEvent.change(search, { target: { value: 'Coca' } });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^Coca Cola/i })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /^Coca Cola/i }));
    await waitFor(() => {
      expect(document.querySelector('[data-pos-checkout-collapsed="true"]')).toBeNull();
    });
    expect(screen.getByText(/✓ Ready —/i)).toBeInTheDocument();
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
    expectHiddenBelowMd(document.querySelector('[data-pos-checkout-full="true"]'));
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
    expect(screen.getByText(/Open a till to complete sales/i)).toBeInTheDocument();
  });

  it('opens a till in food checkout and keeps the cart ready to complete', async () => {
    vi.mocked(openShiftAction).mockResolvedValueOnce({ success: true, data: { id: 'new-shift', tillId: baseProps.tills[0].id } });
    render(<PosClient {...baseProps} business={{ ...baseProps.business, foodBusiness: true }} openShiftTillIds={[]} />);
    const search = screen.getByPlaceholderText(/type product name/i);
    fireEvent.change(search, { target: { value: 'Coca' } });
    fireEvent.focus(search);
    fireEvent.click(await screen.findByRole('button', { name: /^Coca Cola/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Open till' }));
    fireEvent.change(screen.getByLabelText('Opening cash (GH₵)'), { target: { value: '50' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm opening' }));
    await waitFor(() => expect(document.querySelector('[data-pos-shift-id="new-shift"]')).not.toBeNull());
    expect(vi.mocked(openShiftAction).mock.calls.at(-1)?.[0].get('openingCash')).toBe('50');
    expect(screen.queryByText('Cart is empty')).not.toBeInTheDocument();
    mockedCompleteSaleAction.mockResolvedValueOnce({
      success: true, data: { receiptId: 'new-receipt', totalPence: 250, transactionNumber: 'INV-NEW' },
    });
    const complete = screen.getAllByRole('button', { name: /Complete Cash Sale/i })
      .find(button => !(button as HTMLButtonElement).disabled);
    expect(complete).toBeDefined();
    fireEvent.click(complete!);
    await waitFor(() => expect(mockedCompleteSaleAction).toHaveBeenCalledWith(expect.objectContaining({
      tillId: baseProps.tills[0].id, cashPaid: 250,
    })));
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
      expect(screen.getByRole('button', { name: /^Coca Cola/i })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /^Coca Cola/i }));

    await waitFor(() => {
      expect(document.querySelector('[data-pos-mobile-cart-bar="true"]')).not.toBeNull();
    });
    // Phase 2: phone chrome hides the inline sale panel with CSS; checkout stays in the sheet.
    expectClassName(document.querySelector('[data-pos-cart-card="true"]')?.parentElement ?? null, 'max-lg:hidden');
    const tabletBar = document.querySelector('[data-pos-mobile-checkout-bar="true"]');
    expect(tabletBar).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /View cart/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Payment' }));
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /Cart & checkout/i })).toBeInTheDocument();
      expect(document.querySelector('#pos-payment-panel')).not.toBeNull();
    });
    expect(screen.getByLabelText(/payment status/i)).toHaveValue('PAID');
    expect(screen.getByRole('button', { name: 'Cash' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'MoMo' }));
    expect(screen.getByRole('button', { name: 'MoMo' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Cash' })).toHaveAttribute('aria-pressed', 'false');

    fireEvent.change(screen.getByPlaceholderText('Amount due'), { target: { value: '1.00' } });
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
    expect(screen.getByRole('button', { name: /^Coca Cola/i })).toBeInTheDocument();
  });
  fireEvent.click(screen.getByRole('button', { name: /^Coca Cola/i }));
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
    expectClassName(document.querySelector('[data-pos-cart-card="true"]')?.parentElement ?? null, 'max-lg:hidden');
  });

  it('updates the cart bar total when quantity changes inside the sheet', async () => {
    render(<PosClient {...baseProps} />);
    await waitFor(() => expect(screen.getByText('Cart is empty')).toBeInTheDocument());
    await addCocaColaOnPhone();

    const barBefore = screen.getByRole('button', { name: /View cart, 1 item/i }).textContent ?? '';
    fireEvent.click(screen.getByRole('button', { name: /View cart/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Payment' }));
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
    fireEvent.click(screen.getByRole('button', { name: 'Payment' }));
    const dialog = await screen.findByRole('dialog', { name: /Cart & checkout/i });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('button', { name: /Close cart and checkout/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'MoMo' }));
    expect(screen.getByRole('button', { name: 'MoMo' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: /Close cart and checkout/i }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /Cart & checkout/i })).not.toBeInTheDocument();
    });
    expectClassName(document.querySelector('[data-pos-cart-card="true"]')?.parentElement ?? null, 'max-lg:hidden');
    expect(screen.getByRole('button', { name: /View cart, 1 item/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /View cart/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Payment' }));
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
    fireEvent.click(screen.getByRole('button', { name: 'Payment' }));
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
    fireEvent.click(screen.getByRole('button', { name: 'Payment' }));
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
    fireEvent.click(screen.getByRole('button', { name: 'Payment' }));
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

  it('CSS-hides the unified narrow-screen cart bar at desktop widths', async () => {
    mockPhoneViewport(false);
    render(<PosClient {...baseProps} />);
    expect(screen.getByRole('button', { name: /F2 focus scan\/search/i })).toBeInTheDocument();
    const search = screen.getByPlaceholderText(/type product name/i);
    fireEvent.focus(search);
    fireEvent.change(search, { target: { value: 'Coca' } });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^Coca Cola/i })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /^Coca Cola/i }));
    await waitFor(() => {
      expect(document.querySelector('#pos-payment-panel')).not.toBeNull();
    });
    expect(document.querySelector('[data-pos-mobile-cart-bar="true"]')?.closest('[class*="lg:hidden"]')).not.toBeNull();
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
    fireEvent.click(screen.getByRole('button', { name: 'Payment' }));
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
    fireEvent.click(screen.getByRole('button', { name: 'Payment' }));
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
    fireEvent.click(screen.getByRole('button', { name: 'Payment' }));
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
    fireEvent.click(screen.getByRole('button', { name: 'Payment' }));
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

  it('rotates the online idempotency key when the cashier switches till after an unclear sale', async () => {
    mockedCompleteSaleAction.mockRejectedValueOnce(new Error('network reset after accept'));
    render(
      <PosClient
        {...baseProps}
        tills={tills}
        openShiftTillIds={['till-1', 'till-3']}
        openShifts={[
          { tillId: 'till-1', shiftId: 'shift-1' },
          { tillId: 'till-3', shiftId: 'shift-3' },
        ]}
      />,
    );
    const search = screen.getByPlaceholderText(/type product name/i);
    fireEvent.focus(search);
    fireEvent.change(search, { target: { value: 'Coca' } });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^Coca Cola/i })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /^Coca Cola/i }));
    const completeButtons = screen.getAllByRole('button', { name: /Complete Cash Sale/i });
    const complete = completeButtons.find((btn) => !(btn as HTMLButtonElement).disabled)!;
    fireEvent.click(complete);
    await waitFor(() => expect(mockedCompleteSaleAction).toHaveBeenCalledTimes(1));
    const firstRef = mockedCompleteSaleAction.mock.calls[0][0].externalRef as string;

    const select = document.querySelector('#pos-till-select') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'till-1' } });
    await waitFor(() => {
      expect(document.querySelector('[data-selected-till-id="till-1"]')).not.toBeNull();
    });
    mockedCompleteSaleAction.mockResolvedValueOnce({
      success: true,
      data: { receiptId: 'inv-other-till', totalPence: 250, transactionNumber: 'INV-2' },
    });
    const retry = screen.getAllByRole('button', { name: /Complete Cash Sale/i })
      .find((btn) => !(btn as HTMLButtonElement).disabled)!;
    fireEvent.click(retry);
    await waitFor(() => expect(mockedCompleteSaleAction).toHaveBeenCalledTimes(2));
    expect(mockedCompleteSaleAction.mock.calls[1][0].externalRef).not.toBe(firstRef);
    expect(mockedCompleteSaleAction.mock.calls[1][0].tillId).toBe('till-1');
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

it('preserves cash received and readable change when moving between mobile cart and payment', async () => {
  window.localStorage.clear();
  searchParamsGet.mockReturnValue(null);
  mockPhoneViewport(true);
  render(<PosClient {...baseProps} />);
  const search = screen.getByLabelText('Scan barcode or search products');
  fireEvent.focus(search);
  fireEvent.change(search, { target: { value: 'Coca' } });
  fireEvent.click(await screen.findByRole('button', { name: /^Coca Cola/i }));
  fireEvent.click(screen.getByRole('button', { name: /View cart/i }));
  fireEvent.click(screen.getByRole('button', { name: /Continue to payment/ }));
  fireEvent.change(screen.getByLabelText(/Cash tendered/), { target: { value: '20' } });
  const footer = document.querySelector('[data-pos-mobile-sheet-footer]');
  expect(footer?.querySelector('[data-pos-change-due]')?.textContent).toContain('GH₵17.50');
  fireEvent.click(screen.getByRole('button', { name: 'Cart' }));
  expect(screen.getByRole('button', { name: /Continue to payment/ })).toBeInTheDocument();
  expect(footer?.querySelector('[data-pos-change-due]')?.textContent).toContain('GH₵17.50');
  fireEvent.click(screen.getByRole('button', { name: 'Payment' }));
  expect(screen.getByLabelText(/Cash tendered/)).toHaveValue(20);
});

it('does not let an earlier search blur close a newly reopened catalogue dropdown', async () => {
  window.localStorage.clear();
  searchParamsGet.mockReturnValue(null);
  render(<PosClient {...baseProps} />);
  const search = screen.getByLabelText('Scan barcode or search products');
  fireEvent.focus(search);
  fireEvent.change(search, { target: { value: 'Coca' } });
  fireEvent.click(await screen.findByRole('button', { name: /^Coca Cola/i }));
  fireEvent.blur(search);
  fireEvent.focus(search);
  fireEvent.change(search, { target: { value: 'Coca' } });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 250)); });
  expect(screen.getByRole('button', { name: /^Coca Cola/i })).toBeInTheDocument();
});

describe('POS checkout clarity', () => {
  beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); searchParamsGet.mockReturnValue(null); });
it('shows a genuine closed-till reason without pretending to prepare or select a till', async () => {
  render(<PosClient {...baseProps} openShiftTillIds={[]} openShifts={[]} />);
  await addCocaColaToCart();
  await waitFor(() => expect(document.querySelector('select[name="tillId"]')).toHaveValue(''));
  expect(screen.getByRole('option', { name: 'No open till — open a shift' })).toBeInTheDocument();
  expect(screen.queryByText('Preparing checkout…')).not.toBeInTheDocument();
  expect(document.querySelector('[data-pos-completion-status]')).toHaveTextContent('Open a till shift before recording sales.');
  expect(screen.getByTestId('pos-complete-checkout')).toBeDisabled();
});
it('distinguishes tendered cash from the amount applied to the sale', async () => {
  render(<PosClient {...baseProps} />);
  await addCocaColaToCart();
  fireEvent.change(screen.getByLabelText(/cash tendered/i), { target: { value: '20' } });
  const amounts = document.querySelector('[data-pos-payment-amounts]');
  expect(amounts).toHaveTextContent('Cash tenderedGH₵20.00');
  expect(amounts).toHaveTextContent('Applied to saleGH₵2.50');
  expect(document.querySelector('[data-pos-change-due]')).toHaveTextContent('GH₵17.50');
});
it('keeps walk-in checkout compact and automatically opens customer selection for credit', async () => {
  render(<PosClient {...baseProps} />);
  expect(screen.getByText('Walk-in')).toBeInTheDocument();
  expect(screen.queryByRole('textbox', { name: 'Search customers' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Change customer' }));
  fireEvent.change(screen.getByLabelText('Customer'), { target: { value: 'cust-1' } });
  fireEvent.click(screen.getByRole('button', { name: 'Done' }));
  expect(document.querySelector('[data-pos-customer-summary]')).toHaveTextContent('Walk In Customer');
  fireEvent.change(screen.getByLabelText(/payment status/i), { target: { value: 'UNPAID' } });
  expect(screen.getByRole('textbox', { name: 'Search customers' })).toBeInTheDocument();
  expect(screen.getByLabelText('Customer (required)')).toHaveValue('cust-1');
});

});

describe('POS clear cart confirmation and recovery', () => {
  beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); searchParamsGet.mockReturnValue(null); });

  it('cancels without changing cash and Escape keeps the phone cart sheet open', async () => {
    render(<PosClient {...baseProps} />);
    await addCocaColaToCart();
    fireEvent.change(screen.getByLabelText(/cash tendered/i), { target: { value: '20' } });
    fireEvent.click(screen.getByRole('button', { name: /View cart,/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }));
    const keep = await screen.findByRole('button', { name: 'Keep cart' });
    await waitFor(() => expect(keep).toHaveFocus());
    fireEvent.keyDown(keep, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Clear this cart?' })).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: /Cart & checkout/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Payment' }));
    expect(screen.getByLabelText(/cash tendered/i)).toHaveValue(20);
    expect(screen.getByText('Coca Cola')).toBeInTheDocument();
  });

  it('resets stale sale details, restores them with Undo, then starts a clean next sale', async () => {
    render(<PosClient {...baseProps} />);
    await addCocaColaToCart();
    fireEvent.click(screen.getByRole('button', { name: 'Change customer' }));
    fireEvent.change(screen.getByLabelText('Customer'), { target: { value: 'cust-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    const discount = document.querySelector('[data-pos-till-form] details')!;
    fireEvent.change(discount.querySelector('select')!, { target: { value: 'PERCENT' } });
    fireEvent.change(discount.querySelector('input[type="number"]')!, { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText(/cash tendered/i), { target: { value: '20' } });
    const clear = async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Clear all' }));
      fireEvent.click(await screen.findByRole('button', { name: 'Clear cart' }));
    };
    await clear();
    expect(screen.getByText('Cart is empty')).toBeInTheDocument();
    expect(screen.getByLabelText(/cash tendered/i)).toHaveValue(null);
    expect(document.querySelector('[data-pos-customer-summary]')).toHaveTextContent('Walk-in');
    expect(discount.querySelector('select')).toHaveValue('NONE');
    expect(document.querySelector('select[name="tillId"]')).toHaveValue('till-1');
    fireEvent.click(screen.getByRole('button', { name: 'Undo clear' }));
    expect(screen.getByText('Coca Cola')).toBeInTheDocument();
    expect(screen.getByLabelText(/cash tendered/i)).toHaveValue(20);
    expect(document.querySelector('[data-pos-customer-summary]')).toHaveTextContent('Walk In Customer');
    expect(discount.querySelector('select')).toHaveValue('PERCENT');
    expect(document.querySelector('[data-pos-change-due]')).toHaveTextContent('GH₵17.75');
    await clear();
    await addCocaColaToCart();
    expect(screen.queryByRole('button', { name: 'Undo clear' })).not.toBeInTheDocument();
    expect(screen.getByText('Exact cash assumed')).toBeInTheDocument();
    expect(document.querySelector('[data-pos-payment-amounts]')).toHaveTextContent('Applied to saleGH₵2.50');
  });

  it('restores required customer and due-date decisions when undoing a cleared part-paid sale', async () => {
    render(<PosClient {...baseProps} />); await addCocaColaToCart();
    fireEvent.change(screen.getByLabelText(/payment status/i), { target: { value: 'PART_PAID' } });
    fireEvent.change(screen.getByLabelText('Customer (required)'), { target: { value: 'cust-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'No due date' }));
    fireEvent.change(screen.getByLabelText(/cash tendered/i), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Clear cart' }));
    expect(screen.getByLabelText(/payment status/i)).toHaveValue('PAID');
    fireEvent.click(screen.getByRole('button', { name: 'Undo clear' }));
    expect(screen.getByLabelText(/payment status/i)).toHaveValue('PART_PAID');
    expect(screen.getByLabelText('Customer (required)')).toHaveValue('cust-1');
    expect(screen.getByLabelText(/cash tendered/i)).toHaveValue(1);
    expect(screen.getByTestId('pos-complete-checkout')).toBeEnabled();
  });
});

it.each([
  ['NOT_COUNTED', true, 0, true, true],
  ['NOT_COUNTED', false, 0, true, false],
  ['COUNTED', true, 3, true, true],
  ['COUNTED', false, 0, true, true],
  ['COUNTED', false, 2, true, false],
  ['NOT_COUNTED', true, 0, false, false],
] as const)('offers dish management for sold-out %s results only to authorised users', async (stockMode, soldOut, onHandBase, canManageDishes, showLink) => {
  const dish = {
    ...product, id: 'banku', name: 'Banku', onHandBase,
    food: { productId: 'banku', name: 'Banku', stockMode, soldOut, lowAt: 1, sizes: [], inclusions: [], groups: [] },
  };
  render(<PosClient {...baseProps} business={{ ...baseProps.business, canManageDishes }} products={[dish, { ...product, onHandBase: 0 }]} />);
  const search = screen.getByLabelText('Scan barcode or search products');
  fireEvent.focus(search);
  fireEvent.change(search, { target: { value: 'Banku' } });
  const result = await screen.findByRole('button', { name: /^Banku/i });
  if (soldOut || (stockMode === 'COUNTED' && onHandBase === 0)) expect(result).toBeDisabled();
  else expect(result).toBeEnabled();
  const link = screen.queryByRole('link', { name: 'Manage dish: Banku' });
  if (showLink) expect(link).toHaveAttribute('href', '/products/dishes/banku');
  else expect(link).toBeNull();

  fireEvent.change(search, { target: { value: 'Coca' } });
  expect(await screen.findByRole('button', { name: /^Coca Cola/i })).toBeDisabled();
  expect(screen.queryByRole('link', { name: /Manage dish/ })).toBeNull();
});

it.each([null, 1500])('edits a food cart amount with minimum %s', async minimumAmountPence => {
  window.localStorage.clear();
  const dish = {
    ...product, id: 'banku', name: 'Banku', sellingPriceBasePence: 3000,
    food: {
      productId: 'banku', name: 'Banku', stockMode: 'NOT_COUNTED' as const,
      soldOut: false, lowAt: 1, sizes: [], inclusions: [], groups: [],
      allowCustomAmount: true, minimumAmountPence,
    },
  };
  render(<PosClient {...baseProps} business={{ ...baseProps.business, foodBusiness: true }} products={[dish]} />);
  const search = screen.getByLabelText('Scan barcode or search products');
  fireEvent.focus(search);
  fireEvent.change(search, { target: { value: 'Banku' } });
  fireEvent.click(await screen.findByRole('button', { name: /^Banku/i }));
  fireEvent.click(screen.getByRole('button', { name: 'Other amount' }));
  fireEvent.change(screen.getByLabelText('Amount (GH₵)'), { target: { value: '20' } });
  fireEvent.click(screen.getByRole('button', { name: /Add GH₵20.00/ }));
  fireEvent.click(screen.getByRole('button', { name: /Edit amount for Banku, GH₵20.00/ }));
  expect(screen.getByLabelText('Amount (GH₵)')).toHaveValue('20.00');

  fireEvent.change(screen.getByLabelText('Amount (GH₵)'), { target: { value: minimumAmountPence ? '14' : '0' } });
  expect(screen.getByRole('button', { name: 'Save amount' })).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Amount (GH₵)'), { target: { value: '16.50' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save amount' }));
  expect(screen.getByRole('button', { name: /Edit amount for Banku, GH₵16.50/ })).toBeVisible();
  expect(screen.getAllByRole('button', { name: 'Remove Banku' })).toHaveLength(1);
});

describe('converting a size to an amount in the food cart', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
  });

  async function addSize({ allowCustomAmount = true, minimumAmountPence = null as number | null, extras = false, vat = false, foodBusiness = true } = {}) {
    const dish = {
      ...product, id: 'jollof', name: 'Jollof', sellingPriceBasePence: 3000, vatRateBps: 1500,
      food: {
        productId: 'jollof', name: 'Jollof', stockMode: 'COUNTED' as const, soldOut: false, lowAt: 1,
        sizes: [{ id: 'regular', name: 'Regular', pricePence: 3000, isDefault: true }],
        inclusions: [],
        groups: extras ? [{
          id: 'extras', name: 'Extras', selection: 'SINGLE' as const, required: false,
          addons: [{ id: 'egg', name: 'Egg', pricePence: 500, maxQty: 1, stockPortions: 1 }],
        }] : [],
        allowCustomAmount, minimumAmountPence,
      },
    };
    render(<PosClient {...baseProps} business={{ ...baseProps.business, foodBusiness, vatEnabled: vat }} products={[dish]} />);
    const search = screen.getByLabelText('Scan barcode or search products');
    fireEvent.focus(search);
    fireEvent.change(search, { target: { value: 'Jollof' } });
    fireEvent.click(await screen.findByRole('button', { name: /^Jollof/i }));
    if (extras) fireEvent.click(screen.getByRole('button', { name: 'Choose' }));
    const add = screen.queryByRole('button', { name: 'Add plate' });
    if (add) {
      fireEvent.click(screen.getByRole('button', { name: /Regular · GH₵30.00/ }));
      fireEvent.click(add);
    }
    return screen.getByRole('button', { name: 'Remove Jollof' }).closest<HTMLElement>('.pos-cart-line')!;
  }

  it('converts a size to GH₵20 with a blank lowest amount', async () => {
    const row = within(await addSize());
    fireEvent.click(row.getByRole('button', { name: 'Change amount for Jollof' }));
    expect(row.getByLabelText('Amount (GH₵)')).toHaveValue('30.00');
    fireEvent.change(row.getByLabelText('Amount (GH₵)'), { target: { value: '20' } });
    fireEvent.click(row.getByRole('button', { name: 'Save amount' }));
    expect(row.getByText('Amount GH₵20.00')).toBeVisible();
    expect(row.getByRole('button', { name: 'Edit amount for Jollof, GH₵20.00' })).toBeVisible();
  });

  it('keeps the size when the entered amount is below the lowest amount', async () => {
    const row = within(await addSize({ minimumAmountPence: 2500 }));
    fireEvent.click(row.getByRole('button', { name: 'Change amount for Jollof' }));
    fireEvent.change(row.getByLabelText('Amount (GH₵)'), { target: { value: '20' } });
    expect(row.getByRole('button', { name: 'Save amount' })).toBeDisabled();
    expect(row.getByText('Lowest amount for this dish is GH₵25.00.')).toBeVisible();
    expect(row.getByText('Regular')).toBeVisible();
  });

  it.each([{ allowCustomAmount: false }, { foodBusiness: false }])('hides Change amount with settings %j', async options => {
    const row = within(await addSize(options));
    expect(row.getByText('Regular')).toBeVisible();
    expect(row.queryByRole('button', { name: /Change amount/ })).toBeNull();
  });

  it('prefills the gross price including extras and queues the converted line offline', async () => {
    const row = within(await addSize({ extras: true, vat: true }));
    fireEvent.click(row.getByRole('button', { name: '+' }));
    expect(row.getByText('GH₵80.50')).toBeVisible();
    fireEvent.click(row.getByRole('button', { name: 'Change amount for Jollof' }));
    expect(row.getByLabelText('Amount (GH₵)')).toHaveValue('40.25');
    expect(row.getByLabelText('Amount (GH₵)')).toHaveAccessibleDescription('Per plate, including extras and VAT.');
    fireEvent.click(row.getByRole('button', { name: 'Save amount' }));
    expect(row.getByRole('button', { name: 'Edit amount for Jollof, GH₵80.50' })).toBeVisible();

    mockedCompleteSaleAction.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    vi.mocked(queueOfflineSale).mockResolvedValueOnce('queued-converted-size');
    fireEvent.click(screen.getByTestId('pos-complete-checkout'));
    await waitFor(() => expect(queueOfflineSale).toHaveBeenCalledWith(expect.objectContaining({
      lines: [expect.objectContaining({
        productId: 'jollof', qtyInUnit: 2, qtyBase: 4, unitPricePence: 3950,
        plate: { sizeId: null, customAmountPence: 3450, addons: [{ addonId: 'egg', qty: 1 }], expectedPricePence: 3950 },
      })],
      payments: [expect.objectContaining({ method: 'CASH', amountPence: 8050 })],
    })));
  });
});
