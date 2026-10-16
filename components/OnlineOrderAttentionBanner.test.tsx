import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, fireEvent } from '@testing-library/react';
import OnlineOrderAttentionBanner from './OnlineOrderAttentionBanner';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it('keeps a ready-for-pickup order visible, refreshes on focus and shows connection failure', async () => {
  const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ count: 1, newestId: 'order1', orders: [{
    id: 'order1', orderNumber: 'WEB-123', status: 'READY_FOR_PICKUP', paymentStatus: 'PAID',
    refundStatus: null, salesInvoiceId: 'invoice', totalPence: 1500, currency: 'GHS', createdAt: new Date().toISOString(), store: { name: 'Main' },
  }] }) });
  vi.stubGlobal('fetch', fetcher);
  render(<OnlineOrderAttentionBanner scopeKey="biz:main" />);
  expect(await screen.findByText('1 online order outstanding')).toBeInTheDocument();
  expect(screen.getByText(/Ready for pickup/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /dismiss|close/i })).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'WEB-123' })).toHaveAttribute('href', '/online-orders?order=order1#order-order1');
  fetcher.mockRejectedValue(new Error('offline'));
  fireEvent(window, new Event('focus'));
  expect(await screen.findByText(/Connection interrupted/)).toBeInTheDocument();
  expect(screen.getByText('1 online order outstanding')).toBeInTheDocument();
  fetcher.mockResolvedValue({ ok: true, json: async () => ({ count: 0, orders: [] }) });
  fireEvent(window, new Event('focus'));
  await waitFor(() => expect(screen.queryByRole('region')).not.toBeInTheDocument());
});
