import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock, auditMock } = vi.hoisted(() => ({
  prismaMock: {
    purchaseInvoice: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    supplier: { findFirst: vi.fn() },
  },
  auditMock: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('@/lib/audit', () => ({ audit: auditMock }));
vi.mock('@/lib/accounting', () => ({
  computeOutstandingBalance: vi.fn(({ totalPence, payments }) => {
    const paid = payments.reduce((sum: number, payment: { amountPence: number }) => sum + payment.amountPence, 0);
    return Math.max(totalPence - paid, 0);
  }),
}));

import { assignOrphanPurchaseSupplier, listOrphanCreditPurchases } from './supplier-orphans';

describe('listOrphanCreditPurchases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists only unpaid or part-paid invoices with null supplierId', async () => {
    prismaMock.purchaseInvoice.findMany.mockResolvedValue([
      {
        id: 'inv-1',
        transactionNumber: null,
        createdAt: new Date('2024-01-01'),
        dueDate: null,
        paymentStatus: 'UNPAID',
        totalPence: 5000,
        payments: [],
      },
    ]);
    const rows = await listOrphanCreditPurchases('biz-1');
    expect(rows).toHaveLength(1);
    expect(rows[0].outstandingPence).toBe(5000);
    expect(prismaMock.purchaseInvoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          businessId: 'biz-1',
          supplierId: null,
          paymentStatus: { in: ['UNPAID', 'PART_PAID'] },
        },
      }),
    );
  });
});

describe('assignOrphanPurchaseSupplier', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requires an explicit invoice and tenant-scoped supplier, then audits before/after', async () => {
    prismaMock.purchaseInvoice.findFirst.mockResolvedValue({
      id: 'inv-1',
      supplierId: null,
      paymentStatus: 'UNPAID',
      totalPence: 5000,
    });
    prismaMock.supplier.findFirst.mockResolvedValue({ id: 'sup-1', name: 'Ama' });
    prismaMock.purchaseInvoice.updateMany.mockResolvedValue({ count: 1 });

    const result = await assignOrphanPurchaseSupplier({
      businessId: 'biz-1',
      invoiceId: 'inv-1',
      supplierId: 'sup-1',
      user: { id: 'u1', name: 'Owner', role: 'OWNER' },
    });

    expect(result).toEqual({ id: 'inv-1', supplierId: 'sup-1' });
    expect(prismaMock.purchaseInvoice.update).not.toHaveBeenCalled();
    expect(prismaMock.purchaseInvoice.updateMany).toHaveBeenCalledWith({
      where: { id: 'inv-1', businessId: 'biz-1', supplierId: null },
      data: { supplierId: 'sup-1' },
    });
    expect(auditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'PURCHASE_LINK_SUPPLIER',
        entityId: 'inv-1',
        details: expect.objectContaining({
          before: { supplierId: null },
          after: { supplierId: 'sup-1', supplierName: 'Ama' },
        }),
      }),
    );
  });

  it('refuses a global or blank invoice id', async () => {
    await expect(
      assignOrphanPurchaseSupplier({
        businessId: 'biz-1',
        invoiceId: '',
        supplierId: 'sup-1',
        user: { id: 'u1', name: 'Owner', role: 'OWNER' },
      }),
    ).rejects.toThrow('Purchase invoice is required.');
    expect(prismaMock.purchaseInvoice.update).not.toHaveBeenCalled();
    expect(prismaMock.purchaseInvoice.updateMany).not.toHaveBeenCalled();
  });

  it('rejects a manager at the service boundary', async () => {
    await expect(
      assignOrphanPurchaseSupplier({
        businessId: 'biz-1',
        invoiceId: 'inv-1',
        supplierId: 'sup-1',
        user: { id: 'u2', name: 'Manager', role: 'MANAGER' },
      }),
    ).rejects.toThrow('Only the owner can assign a supplier to a historic credit purchase.');
    expect(prismaMock.purchaseInvoice.updateMany).not.toHaveBeenCalled();
  });
});

describe('orphan queue page and owner-only action', () => {
  const pageSrc = readFileSync(join(process.cwd(), 'app/(protected)/suppliers/orphans/page.tsx'), 'utf8');
  const actionSrc = readFileSync(join(process.cwd(), 'app/actions/suppliers.ts'), 'utf8');

  it('is owner/manager readable and owner-assignable', () => {
    expect(pageSrc).toContain("requireBusiness(['MANAGER', 'OWNER'])");
    expect(pageSrc).toContain('assignOrphanPurchaseSupplierAction');
    expect(pageSrc).toContain("user.role === 'OWNER'");
    expect(pageSrc).toContain('RemainingBalance');
    expect(actionSrc).toContain("withBusinessContext(['OWNER'])");
    expect(actionSrc).toContain('assignOrphanPurchaseSupplier');
  });
});
