import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { prisma } from '@/lib/prisma';
import ReceiptPage from './page';

vi.mock('@/lib/auth', () => ({
  requireUser: async () => ({ id: 'owner', businessId: 'business', role: 'OWNER' }),
}));
vi.mock('@/lib/prisma', () => ({
  prisma: { salesInvoice: { findFirst: vi.fn() } },
}));
vi.mock('@/lib/print-telemetry', () => ({ reportPrintEvent: vi.fn() }));

it('shows what the customer saved on a discounted VAT-inclusive amount line', async () => {
  vi.spyOn(window, 'print').mockImplementation(() => {});
  vi.mocked(prisma.salesInvoice.findFirst).mockResolvedValue({
    id: 'sale',
    createdAt: new Date('2026-11-16T10:00:00Z'),
    business: { id: 'business', name: 'Test Kitchen', currency: 'GHS', vatEnabled: true, printMode: 'BROWSER_DIALOG' },
    store: { id: 'store', name: 'Main' },
    cashierUser: { name: 'Cashier' },
    subtotalPence: 2609,
    vatPence: 391,
    totalPence: 3000,
    paymentStatus: 'PAID',
    payments: [],
    lines: [{
      qtyInUnit: 1,
      qtyBase: 1,
      unitPricePence: 3500,
      lineSubtotalPence: 3043,
      lineTotalPence: 3000,
      lineDiscountPence: 434,
      promoDiscountPence: 0,
      product: { name: 'Fried Rice', vatRateBps: 1500, productUnits: [] },
      plateSnapshotJson: JSON.stringify({
        v: 1, productId: 'rice', dishName: 'Fried Rice', customAmountPence: 3500,
        inclusions: [], addons: [], platePricePence: 3500, stockMode: 'COUNTED', stockPortions: 1,
      }),
    }],
  } as unknown as Awaited<ReturnType<typeof prisma.salesInvoice.findFirst>>);

  render(await ReceiptPage({ params: Promise.resolve({ id: 'sale' }) }));

  expect(screen.getByText('Amount GH₵35.00')).toBeVisible();
  expect(screen.getByText('Discount GH₵5.00')).toBeVisible();
  expect(screen.queryByText('Discount GH₵4.34')).toBeNull();
});
