import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import StorefrontClient from './StorefrontClient';
import type { PublicStorefront } from '@/lib/services/online-orders';

vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
vi.mock('@/components/MerchantBrandBadge', () => ({ default: () => <span>Brand</span> }));
const product = (id: string, name: string) => ({ id, name, barcode: null, sellingPriceBasePence: 1500,
  vatRateBps: 0, promoBuyQty: 0, promoGetQty: 0, categoryId: 'food', categoryName: 'Food', categoryImageUrl: null,
  publicCategoryId: 'food', publicCategoryName: 'Food', publicCategoryPriority: 1, imageUrl: null,
  storefrontDescription: null, units: [{ id: 'piece', name: 'Piece', pluralName: 'Pieces', conversionToBase: 1, isBaseUnit: true }],
  onHandBase: 20, onHandByStore: { main: 20 } });
const toffee = product('toffee', 'Toffee');
const rice = product('rice', 'Rice');
const shop = { businessId: 'biz', name: 'Shop', currency: 'GHS', vatEnabled: false, slug: 'shop',
  headline: null, description: null, pickupInstructions: null, phone: null, address: null,
  branding: { logoUrl: null, logoWidth: null, logoHeight: null, compactLogoUrl: null, compactLogoWidth: null,
    compactLogoHeight: null, squareLogoUrl: null, squareLogoWidth: null, squareLogoHeight: null, initials: null,
    brandPrimaryColor: null, compactMode: null, logoBackground: null, primaryColor: null, accentColor: null, tagline: null }, stores: [{ id: 'main', name: 'Main', address: null, phone: null }], products: [toffee],
  categories: [], totalProductCount: 1, initialProductCount: 1, openStatus: null, prepMinutes: 0,
  paymentConfig: { mode: 'MOMO_NUMBER', momoNumber: '0241234567', momoNetwork: 'MTN', merchantShortcode: null, bankName: null, bankAccountName: null, bankAccountNumber: null, bankBranch: null, paymentNote: null },
} as PublicStorefront;

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('IntersectionObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('fetch', vi.fn(async (input: string) => {
    const url = new URL(input, 'https://example.com');
    const products = url.searchParams.get('q') === 'rice' || url.searchParams.has('ids') ? [rice] : [toffee];
    return { ok: true, json: async () => ({ products, total: products.length, offset: 0, limit: 24 }) };
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('storefront basket continuity', () => {
  it('keeps an existing item and total when a search replaces the catalogue', async () => {
    render(<StorefrontClient storefront={shop} customer={null} />);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: 'Add Toffee to cart' }));
    const cart = screen.getByRole('complementary');
    expect(within(cart).getByText('1 × Piece')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search products' }), { target: { value: 'rice' } });
    await screen.findByRole('button', { name: 'Add Rice to cart' });
    expect(within(cart).getByText('Toffee')).toBeInTheDocument();
    expect(within(cart).getByText('1 × Piece')).toBeInTheDocument();
    expect(within(cart).queryByText('Cart is empty')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add Rice to cart' }));
    expect(within(cart).getByText('Toffee')).toBeInTheDocument();
    expect(within(cart).getByText('Rice')).toBeInTheDocument();
    expect(within(cart).getAllByText(/30\.00/).length).toBeGreaterThan(0);
  });

  it('restores a saved item absent from the first catalogue page', async () => {
    localStorage.setItem('tillflow_cart_shop', JSON.stringify({ savedAt: Date.now(), storeId: 'main',
      lines: [{ id: 'rice:piece', productId: 'rice', unitId: 'piece', qtyInUnit: 2 }] }));
    render(<StorefrontClient storefront={shop} customer={null} />);
    const cart = screen.getByRole('complementary');
    await waitFor(() => expect(within(cart).getByText('2 × Piece')).toBeInTheDocument());
    expect(within(cart).getByText('Rice')).toBeInTheDocument();
    expect(within(cart).getAllByText(/30\.00/).length).toBeGreaterThan(0);
  });
});

it('states pickup expectations and does not claim sales popularity for generated selections', async () => {
  render(<StorefrontClient storefront={shop} customer={null} />);
  await waitFor(() => expect(screen.queryByText('Loading products…')).not.toBeInTheDocument());
  expect(screen.getByText('Explore this shop')).toBeInTheDocument();
  expect(screen.queryByText('Popular in this shop')).not.toBeInTheDocument();
  expect(within(screen.getByRole('complementary')).queryByRole('heading', { name: 'Checkout' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Add Toffee to cart' }));
  expect(within(screen.getByRole('complementary')).getByRole('heading', { name: 'Checkout' })).toBeInTheDocument();
  expect(within(screen.getByRole('complementary')).getByText(/Wait until your order is marked ready before travelling/)).toBeInTheDocument();
  expect(within(screen.getByRole('complementary')).getByText(/Opening hours have not been provided/)).toBeInTheDocument();
});
