import type { ComponentProps } from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import OrderStatusClient from './OrderStatusClient';
const order: ComponentProps<typeof OrderStatusClient>['order'] = { id: 'order', orderNumber: 'WEB-1', status: 'AWAITING_PAYMENT', paymentStatus: 'PENDING',
  fulfillmentStatus: 'PENDING', fulfillmentMethod: 'PICKUP', customerName: 'Customer', customerPhone: '',
  storefrontSlug: 'business', storefrontName: 'Business', createdAt: '2026-10-29T10:00:00Z',
  currency: 'GHS', totalPence: 1000, subtotalPence: 1000, vatPence: 0, lines: [], branding: { logoUrl: null, logoWidth: null, logoHeight: null, compactLogoUrl: null, compactLogoWidth: null, compactLogoHeight: null, squareLogoUrl: null, squareLogoWidth: null, squareLogoHeight: null, initials: null, brandPrimaryColor: null, compactMode: null, logoBackground: null, primaryColor: null, accentColor: null, tagline: null },
  business: { id: 'business', name: 'Business', storefrontPickupInstructions: null, storefrontSlug: 'business' }, paymentMode: 'MOMO_NUMBER', paidAt: null,
  customerEmail: null, customerNotes: null, fulfilledAt: null, paymentCollectionId: null, storefrontPhone: null, pickupInstructions: null, momoPayoutNumber: null, momoPayoutNetwork: null, merchantShortcode: null, bankName: null, bankAccountName: null, bankAccountNumber: null, bankBranch: null, storeMessage: null, pickupStoreName: null, pickupStoreAddress: null, paymentCollection: null,
};
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); Object.defineProperty(navigator, 'onLine', { value: true }); });
it('closes the status stream while hidden and reconnects only when online and visible', async () => {
  let visible = true;
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visible ? 'visible' : 'hidden');
  const close = vi.fn(); const create = vi.fn();
  vi.stubGlobal('EventSource', class { constructor(url: string) { create(url); } close = close; addEventListener = vi.fn(); });
  render(<OrderStatusClient order={order} />);
  expect(create).toHaveBeenCalledOnce();
  act(() => { visible = false; document.dispatchEvent(new Event('visibilitychange')); }); expect(close).toHaveBeenCalledOnce();
  act(() => { Object.defineProperty(navigator, 'onLine', { value: false }); visible = true; document.dispatchEvent(new Event('visibilitychange')); });
  expect(create).toHaveBeenCalledOnce();
  act(() => { Object.defineProperty(navigator, 'onLine', { value: true }); window.dispatchEvent(new Event('online')); });
  expect(create).toHaveBeenCalledTimes(2);
});
it('pauses polling fallback offline and resumes with the same order token', async () => {
  vi.useFakeTimers(); vi.stubGlobal('EventSource', undefined);
  const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ order }) }); vi.stubGlobal('fetch', fetcher);
  await act(async () => { render(<OrderStatusClient order={order} />); }); expect(fetcher).toHaveBeenCalledOnce();
  await act(async () => { Object.defineProperty(navigator, 'onLine', { value: false }); window.dispatchEvent(new Event('offline')); await vi.advanceTimersByTimeAsync(60000); });
  expect(fetcher).toHaveBeenCalledOnce();
  await act(async () => { Object.defineProperty(navigator, 'onLine', { value: true }); window.dispatchEvent(new Event('online')); });
  expect(fetcher).toHaveBeenCalledTimes(2); expect(fetcher.mock.calls[1][0]).toBe('/api/storefront/orders/order/status');
});
