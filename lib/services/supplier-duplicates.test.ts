import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    supplier: { findMany: vi.fn() },
  },
}));

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('@/lib/accounting', () => ({
  computeOutstandingBalance: vi.fn(({ totalPence, payments }) => {
    const paid = payments.reduce((sum: number, payment: { amountPence: number }) => sum + payment.amountPence, 0);
    return Math.max(totalPence - paid, 0);
  }),
}));

import { findProbableDuplicateSuppliers, normalizeSupplierName } from './supplier-duplicates';

describe('normalizeSupplierName', () => {
  it('trims and case-folds names', () => {
    expect(normalizeSupplierName('  AMA Supplies ')).toBe('ama supplies');
    expect(normalizeSupplierName('Ama   Supplies')).toBe('ama supplies');
  });
});

describe('findProbableDuplicateSuppliers', () => {
  it('groups name-normalised matches and reports balances without merging', async () => {
    prismaMock.supplier.findMany.mockResolvedValue([
      {
        id: 's1',
        name: 'Ama Supplies',
        phone: '020',
        email: null,
        purchaseInvoices: [{ totalPence: 4000, paymentStatus: 'UNPAID', payments: [] }],
      },
      {
        id: 's2',
        name: 'ama supplies',
        phone: null,
        email: null,
        purchaseInvoices: [{ totalPence: 1000, paymentStatus: 'PART_PAID', payments: [{ amountPence: 250 }] }],
      },
      {
        id: 's3',
        name: 'Beta Ltd',
        phone: null,
        email: null,
        purchaseInvoices: [],
      },
    ]);

    const groups = await findProbableDuplicateSuppliers('biz-1');
    expect(groups).toHaveLength(1);
    expect(groups[0].members).toHaveLength(2);
    expect(groups[0].totalOutstandingPence).toBe(4750);
  });
});

describe('duplicates preview page — no merge', () => {
  const src = readFileSync(join(process.cwd(), 'app/(protected)/suppliers/duplicates/page.tsx'), 'utf8');

  it('is owner-only preview and does not expose merge', () => {
    expect(src).toContain("requireBusiness(['OWNER'])");
    expect(src).toContain('findProbableDuplicateSuppliers');
    expect(src).toContain('preview only');
    expect(src).not.toMatch(/merge/i);
  });
});
