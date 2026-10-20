import { beforeEach, describe, expect, it, vi } from 'vitest';
const db = vi.hoisted(() => ({ purchaseInvoice: { findMany: vi.fn() } }));
vi.mock('@/lib/prisma', () => ({ prisma: db }));
import { getSupplierAccountSummary, summarizeSupplierAccount } from './supplier-account-summary';

const purchase = (totalPence = 1000, createdAt = new Date('2026-10-15'), paymentStatus = 'UNPAID', payments: { amountPence: number; paidAt: Date }[] = []) => ({ totalPence, createdAt, paymentStatus, payments });
beforeEach(() => vi.clearAllMocks());

describe('supplier account totals independent of history selection', () => {
  it('includes an older unpaid invoice beyond the 200 displayed purchases', async () => {
    const invoices = [...Array.from({ length: 200 }, () => purchase(1000, new Date('2026-10-15'), 'PAID', [{ amountPence: 1000, paidAt: new Date('2026-10-16') }])), purchase(4321, new Date('2025-01-01'))];
    db.purchaseInvoice.findMany.mockImplementation(async ({ take, where }) => {
      const selected = where.createdAt ? invoices.filter(i => i.createdAt >= where.createdAt.gte) : invoices;
      return take ? selected.slice(0, take) : selected;
    });
    const result = await getSupplierAccountSummary('business-a', 'supplier-a', { start: new Date('2026-10-01'), endExclusive: new Date('2026-11-01') });
    expect(result.account).toMatchObject({ outstandingPence: 4321, unpaidInvoiceCount: 1, invoiceCount: 201, totalBilledPence: 204321 });
    expect(result.selection).toMatchObject({ outstandingPence: 0, invoiceCount: 200, totalPaidPence: 200000 });
    expect(db.purchaseInvoice.findMany.mock.calls[0][0].where).toEqual({ businessId: 'business-a', supplierId: 'supplier-a' });
  });
  it('keeps the account balance when the selected purchase dates have no matches', async () => {
    db.purchaseInvoice.findMany.mockResolvedValue([purchase(7000, new Date('2025-01-01'))]);
    const result = await getSupplierAccountSummary('business', 'supplier', { start: new Date('2026-10-01') });
    expect(result.account.outstandingPence).toBe(7000);
    expect(result.selection).toMatchObject({ outstandingPence: 0, invoiceCount: 0 });
  });
  it('uses an inclusive start, exclusive end and later recorded payments on selected purchases', async () => {
    db.purchaseInvoice.findMany.mockResolvedValue([purchase(1000, new Date('2026-10-01'), 'PART_PAID', [{ amountPence: 400, paidAt: new Date('2026-11-05') }]), purchase(2000, new Date('2026-11-01')), purchase(3000, new Date('2026-09-30'))]);
    const result = await getSupplierAccountSummary('business', 'supplier', { start: new Date('2026-10-01'), endExclusive: new Date('2026-11-01') });
    expect(result.selection).toMatchObject({ outstandingPence: 600, totalPaidPence: 400, invoiceCount: 1 });
    expect(result.account.outstandingPence).toBe(5600);
  });
  it('keeps the canonical returned/voided and signed excess-payment treatment', () => {
    const paid = [{ amountPence: 1200, paidAt: new Date('2026-10-19') }];
    const result = summarizeSupplierAccount([purchase(1000, undefined, 'RETURNED', paid), purchase(1000, undefined, 'VOID', paid), purchase(1000, undefined, 'PAID', paid), purchase(500)]);
    expect(result).toMatchObject({ outstandingPence: 300, totalBilledPence: 1500, totalPaidPence: 1200, unpaidInvoiceCount: 1 });
    expect(result.lastPaymentAt).toEqual(new Date('2026-10-19'));
  });
});
