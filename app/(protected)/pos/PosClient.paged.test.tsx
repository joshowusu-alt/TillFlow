import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PosClient from './PosClient';

vi.mock('next/link', () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));
vi.mock('next/navigation', () => ({ useSearchParams: () => ({ get: () => null }), useRouter: () => ({ prefetch: vi.fn(), refresh: vi.fn() }) }));
vi.mock('@/app/actions/shifts', () => ({ openShiftAction: vi.fn() }));
vi.mock('@/app/actions/sales', () => ({ completeSaleAction: vi.fn() }));
vi.mock('@/app/actions/mobile-money', () => ({ checkMomoCollectionStatusAction: vi.fn(), initiateMomoCollectionAction: vi.fn() }));
vi.mock('@/lib/offline', () => ({ queueOfflineSale: vi.fn() }));
vi.mock('./components/SummarySidebar', () => ({ default: () => <div /> }));
vi.mock('./components/KeyboardHelpModal', () => ({ default: () => null }));
vi.mock('./components/ProductShortcuts', () => ({ default: () => null }));
vi.mock('./components/QuickAddPanel', () => ({ default: () => null }));
vi.mock('./components/ParkModal', () => ({ default: () => null }));
vi.mock('./components/QuickAddCustomer', () => ({ default: () => null }));
vi.mock('./components/CameraScanner', () => ({ default: () => null }));

const book = {
  id: 'imp_3e4eea42', name: '10 BASIC STEPS', sku: null, barcode: '9781563990281', sellingPriceBasePence: 6500,
  vatRateBps: 0, isTaxable: false, promoBuyQty: 0, promoGetQty: 0, categoryName: 'Christian Literature', onHandBase: 1,
  units: [{ id: 'piece', name: 'piece', pluralName: 'pieces', conversionToBase: 1, isBaseUnit: true, sellingPricePence: 6500 }],
};

describe('POS paged catalogue (more than 2,000 products)', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('lets staff add a server search result that has stock', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () => (String(url).includes('/api/pos/search') ? { products: [book] } : {}) })));
    render(<PosClient
      business={{ id: 'biz', currency: 'GHS', vatEnabled: false, momoEnabled: false, momoProvider: null, requireOpenTillForSales: false, discountApprovalThresholdBps: 1500 } as any}
      store={{ id: 'store', name: 'Main Branch' }} tills={[{ id: 'till', name: 'Till 2' }]} openShiftTillIds={['till']}
      products={[]} posCatalogueMode="paged" catalogueSize={2784}
      customers={[]} units={[{ id: 'piece', name: 'piece' }]} categories={[]} {...({} as any)} />);
    const search = screen.getByPlaceholderText(/type product name/i);
    fireEvent.focus(search);
    fireEvent.change(search, { target: { value: '10 BASIC' } });
    const button = await screen.findByRole('button', { name: /^10 BASIC STEPS/i }, { timeout: 3000 });
    expect(button).not.toBeDisabled();
    expect(screen.queryByText(/None available/i)).toBeNull();
    fireEvent.keyDown(search, { key: 'Enter' });
    expect(screen.getByRole('button', { name: 'Remove 10 BASIC STEPS' })).toBeInTheDocument();
    expect(search).toHaveValue('');
  });

  it('resolves an uncached barcode via the barcode endpoint and adds once', async () => {
    localStorage.clear();
    const fetchMock = vi.fn(async (url: string) => ({ ok: true, json: async () => String(url).includes('/api/pos/barcode')
      ? { kind: 'matched', product: book, baseUnitId: 'piece', qtyInUnit: 1 } : { products: [] } }));
    vi.stubGlobal('fetch', fetchMock);
    render(<PosClient
      business={{ id: 'biz', currency: 'GHS', vatEnabled: false, momoEnabled: false, momoProvider: null, requireOpenTillForSales: false, discountApprovalThresholdBps: 1500 } as any}
      store={{ id: 'store', name: 'Main Branch' }} tills={[{ id: 'till', name: 'Till 2' }]} openShiftTillIds={['till']}
      products={[]} posCatalogueMode="paged" catalogueSize={2784}
      customers={[]} units={[{ id: 'piece', name: 'piece' }]} categories={[]} {...({} as any)} />);
    const search = screen.getByLabelText('Scan barcode or search products');
    fireEvent.change(search, { target: { value: book.barcode } });
    fireEvent.keyDown(search, { key: 'Enter' });
    fireEvent.keyDown(search, { key: 'Enter' });
    await screen.findByRole('button', { name: 'Remove 10 BASIC STEPS' });
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('/api/pos/barcode'))).toHaveLength(1);
    expect(document.querySelector('[data-pos-payment-amounts]')).toHaveTextContent('GH₵65.00');
  });
});
