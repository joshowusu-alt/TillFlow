import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  supplier: { findFirst: vi.fn(), delete: vi.fn() },
  supplierCreditSettlement: { count: vi.fn() },
}));
vi.mock('@/lib/prisma', () => ({ prisma: db }));

import { deleteSupplier } from './suppliers';

const supplier = {
  id: 'supplier-1',
  purchaseInvoices: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  db.supplier.findFirst.mockResolvedValue(supplier);
  db.supplierCreditSettlement.count.mockResolvedValue(0);
  db.supplier.delete.mockResolvedValue({ id: supplier.id });
});

describe('deleteSupplier', () => {
  it('refuses to delete a supplier who has credit settlements, which are not enforced by a foreign key', async () => {
    db.supplierCreditSettlement.count.mockResolvedValue(2);
    await expect(deleteSupplier('supplier-1', 'biz')).rejects.toThrow(/credit settlements/);
    expect(db.supplierCreditSettlement.count).toHaveBeenCalledWith({
      where: { businessId: 'biz', supplierId: 'supplier-1' },
    });
    expect(db.supplier.delete).not.toHaveBeenCalled();
  });

  it('deletes a supplier with no settlements', async () => {
    await expect(deleteSupplier('supplier-1', 'biz')).resolves.toEqual({ id: 'supplier-1' });
    expect(db.supplier.delete).toHaveBeenCalledWith({ where: { id: 'supplier-1' } });
  });
});
