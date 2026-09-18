import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    purchaseInvoice: { findMany: vi.fn() },
  },
}));

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('@/lib/accounting', () => ({
  computeOutstandingBalance: vi.fn(({ totalPence, payments }) => {
    const paid = payments.reduce((sum: number, payment: { amountPence: number }) => sum + payment.amountPence, 0);
    return Math.max(totalPence - paid, 0);
  }),
}));

import {
  getSupplierListKpis,
  supplierKpiFilterScope,
  supplierKpiScopeHelper,
} from './supplier-kpis';

describe('supplier KPI scope helpers', () => {
  it('describes the active filter, never the current page', () => {
    expect(supplierKpiFilterScope({})).toBe('all');
    expect(supplierKpiFilterScope({ search: 'ama' })).toBe('search');
    expect(supplierKpiFilterScope({ amountOwed: true })).toBe('amount_owed');
    expect(supplierKpiFilterScope({ search: 'ama', amountOwed: true })).toBe('search_and_amount_owed');
    expect(supplierKpiScopeHelper('all')).toBe('All supplier accounts');
    expect(supplierKpiScopeHelper('search')).toBe('Matching current search');
    expect(supplierKpiScopeHelper('amount_owed')).toBe('Amount owed only');
    expect(Object.values({
      all: supplierKpiScopeHelper('all'),
      search: supplierKpiScopeHelper('search'),
      amount_owed: supplierKpiScopeHelper('amount_owed'),
      search_and_amount_owed: supplierKpiScopeHelper('search_and_amount_owed'),
    }).join(' ')).not.toMatch(/this page/i);
  });
});

describe('getSupplierListKpis', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('aggregates outstanding across the full filtered population and skips null suppliers', async () => {
    prismaMock.purchaseInvoice.findMany.mockResolvedValue([
      { supplierId: 's1', totalPence: 10_000, paymentStatus: 'UNPAID', payments: [] },
      { supplierId: 's1', totalPence: 4_000, paymentStatus: 'PART_PAID', payments: [{ amountPence: 1_000 }] },
      { supplierId: 's2', totalPence: 2_000, paymentStatus: 'UNPAID', payments: [] },
      { supplierId: null, totalPence: 99_000, paymentStatus: 'UNPAID', payments: [] },
    ]);

    const kpis = await getSupplierListKpis('biz-1', { search: 'ama' });
    expect(kpis.suppliersWithBalanceCount).toBe(2);
    expect(kpis.totalApOutstandingPence).toBe(15_000);
    expect(kpis.scope).toBe('search');
    expect(prismaMock.purchaseInvoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          supplierId: { not: null },
          supplier: expect.objectContaining({
            name: { contains: 'ama', mode: 'insensitive' },
          }),
        }),
      }),
    );
  });
});

describe('supplier list page source — KPI pagination invariance', () => {
  const src = readFileSync(join(process.cwd(), 'app/(protected)/suppliers/page.tsx'), 'utf8');

  it('loads KPIs separately from skip/take rows and shows ShowingRange', () => {
    expect(src).toContain('getSupplierListKpis');
    expect(src).toContain('ShowingRange');
    expect(src.indexOf('skip: (page - 1) * DEFAULT_PAGE_SIZE')).toBeGreaterThan(-1);
    expect(src.indexOf('getSupplierListKpis')).toBeGreaterThan(-1);
    expect(src).not.toContain('this page');
  });
});
