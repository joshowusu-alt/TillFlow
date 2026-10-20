import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  db: { business: { findUnique: vi.fn() }, supplier: { findFirst: vi.fn() }, purchaseInvoice: { findMany: vi.fn() } },
}));
vi.mock('@/lib/prisma', () => ({ prisma: mocks.db }));
vi.mock('@/lib/auth', () => ({ getUser: mocks.user }));
import { GET } from './route';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.user.mockResolvedValue({ role: 'OWNER', businessId: 'business-a' });
  mocks.db.business.findUnique.mockResolvedValue({ timezone: 'Africa/Accra' });
});
it('exports the full account balance separately from date-selected purchase balances', async () => {
  const selected = { id: 'purchase-new', createdAt: new Date('2026-10-15'), paymentStatus: 'PART_PAID', totalPence: 10000, payments: [{ amountPence: 2500, paidAt: new Date('2026-11-01') }] };
  const older = { id: 'purchase-old', createdAt: new Date('2025-01-01'), paymentStatus: 'UNPAID', totalPence: 20000, payments: [] };
  mocks.db.supplier.findFirst.mockResolvedValue({ id: 'supplier-a', name: 'Supplier A', purchaseInvoices: [selected] });
  mocks.db.purchaseInvoice.findMany.mockResolvedValue([older, selected]);
  const response = await GET(new Request('https://example.test/suppliers/supplier-a/statement?from=2026-10-01&to=2026-10-31'), { params: { id: 'supplier-a' } });
  const csv = await response.text();
  expect(csv).toContain('Account balance (all purchase dates),275.00');
  expect(csv).toContain('Balance on selected purchases,75.00');
  expect(csv).toContain('Selected purchases totals,100.00,25.00,75.00');
  expect(csv).toContain('not a historical end-date balance');
  expect(csv).not.toContain('purchase-old');
  expect(mocks.db.purchaseInvoice.findMany.mock.calls[0][0].where).toEqual({ businessId: 'business-a', supplierId: 'supplier-a' });
});
it('does not load account totals for a supplier outside the business', async () => {
  mocks.db.supplier.findFirst.mockResolvedValue(null);
  const response = await GET(new Request('https://example.test/suppliers/other/statement'), { params: { id: 'other' } });
  expect(response.status).toBe(404);
  expect(mocks.db.supplier.findFirst.mock.calls[0][0].where).toEqual({ id: 'other', businessId: 'business-a' });
  expect(mocks.db.purchaseInvoice.findMany).not.toHaveBeenCalled();
});
it('requires an owner or manager before reading financial records', async () => {
  mocks.user.mockResolvedValue({ role: 'CASHIER', businessId: 'business-a' });
  const response = await GET(new Request('https://example.test/suppliers/supplier-a/statement'), { params: { id: 'supplier-a' } });
  expect(response.status).toBe(307);
  expect(mocks.db.supplier.findFirst).not.toHaveBeenCalled();
});
