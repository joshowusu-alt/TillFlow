import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  redirectMock,
  revalidatePathMock,
  revalidateTagMock,
  auditMock,
  MockUserError,
  withBusinessContextMock,
  selectedLinesFindManyMock,
  transactionMock,
  txSalesLineUpdateMock,
  txStockMovementUpdateManyMock,
  txSalesLineFindManyMock,
  txSalesInvoiceUpdateMock,
} = vi.hoisted(() => {
  const redirectMock = vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  });

  const txSalesLineUpdateMock = vi.fn();
  const txStockMovementUpdateManyMock = vi.fn();
  const txSalesLineFindManyMock = vi.fn();
  const txSalesInvoiceUpdateMock = vi.fn();
  class MockUserError extends Error {}

  return {
    redirectMock,
    revalidatePathMock: vi.fn(),
    revalidateTagMock: vi.fn(),
    auditMock: vi.fn(),
    MockUserError,
    withBusinessContextMock: vi.fn(),
    selectedLinesFindManyMock: vi.fn(),
    transactionMock: vi.fn(async (callback: any) => callback({
      salesInvoiceLine: {
        update: txSalesLineUpdateMock,
        findMany: txSalesLineFindManyMock,
      },
      stockMovement: {
        updateMany: txStockMovementUpdateManyMock,
      },
      salesInvoice: {
        update: txSalesInvoiceUpdateMock,
      },
    })),
    txSalesLineUpdateMock,
    txStockMovementUpdateManyMock,
    txSalesLineFindManyMock,
    txSalesInvoiceUpdateMock,
  };
});

vi.mock('next/navigation', () => ({
  redirect: redirectMock,
}));

vi.mock('next/cache', () => ({
  revalidatePath: revalidatePathMock,
  revalidateTag: revalidateTagMock,
}));

vi.mock('@/lib/audit', () => ({
  audit: auditMock,
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    salesInvoiceLine: {
      findMany: selectedLinesFindManyMock,
    },
    $transaction: transactionMock,
  },
}));

vi.mock('@/lib/action-utils', () => ({
  ok: (data?: unknown) => (data === undefined ? { success: true } : { success: true, data }),
  safeAction: async (fn: () => Promise<unknown>) => {
    try {
      return await fn();
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Something unexpected happened. Please try again.',
      };
    }
  },
  UserError: MockUserError,
  withBusinessContext: withBusinessContextMock,
}));

import { correctTargetedSaleCostsAction } from './sale-cost-corrections';

describe('correctTargetedSaleCostsAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    auditMock.mockResolvedValue(undefined);

    withBusinessContextMock.mockResolvedValue({
      businessId: 'biz-1',
      user: {
        id: 'user-1',
        name: 'Owner User',
        role: 'OWNER',
        email: 'owner@example.com',
        businessId: 'biz-1',
      },
    });

    selectedLinesFindManyMock.mockResolvedValue([
      {
        id: 'line-1',
        salesInvoiceId: 'invoice-1',
        productId: 'product-1',
        qtyBase: 2,
        lineCostPence: 1_000,
        lineSubtotalPence: 1_200,
        salesInvoice: { id: 'invoice-1', transactionNumber: 'INV-1001' },
        product: { name: 'Safety Matches', defaultCostBasePence: 300 },
      },
      {
        id: 'line-2',
        salesInvoiceId: 'invoice-1',
        productId: 'product-1',
        qtyBase: 2,
        lineCostPence: 600,
        lineSubtotalPence: 900,
        salesInvoice: { id: 'invoice-1', transactionNumber: 'INV-1001' },
        product: { name: 'Safety Matches', defaultCostBasePence: 300 },
      },
    ]);

    txSalesLineFindManyMock.mockResolvedValue([
      { salesInvoiceId: 'invoice-1', lineSubtotalPence: 1_200, lineCostPence: 600 },
      { salesInvoiceId: 'invoice-1', lineSubtotalPence: 900, lineCostPence: 600 },
    ]);
  });

  it('updates only the selected lines that differ, recalculates invoice GP, and redirects back with success', async () => {
    const formData = new FormData();
    formData.set('q', 'INV-1001');
    formData.set('status', 'below-cost');
    formData.set('period', 'custom');
    formData.set('from', '2026-03-01');
    formData.set('to', '2026-03-31');
    formData.append('lineIds', 'line-1');
    formData.append('lineIds', 'line-2');
    formData.set('reason', 'Old base cost was configured wrongly for this receipt.');
    formData.set('confirmCorrection', 'on');

    await expect(correctTargetedSaleCostsAction(formData)).rejects.toThrow(
      'NEXT_REDIRECT:/settings/data-repair/sale-cost-corrections?q=INV-1001&status=below-cost&period=custom&from=2026-03-01&to=2026-03-31&updated=1&invoices=1',
    );

    expect(txSalesLineUpdateMock).toHaveBeenCalledTimes(1);
    expect(txSalesLineUpdateMock).toHaveBeenCalledWith({
      where: { id: 'line-1' },
      data: { lineCostPence: 600 },
    });
    expect(txStockMovementUpdateManyMock).toHaveBeenCalledTimes(1);
    expect(txSalesInvoiceUpdateMock).toHaveBeenCalledWith({
      where: { id: 'invoice-1' },
      data: { grossMarginPence: 900 },
    });
    expect(auditMock).toHaveBeenCalled();
    expect(revalidateTagMock).toHaveBeenCalledWith('reports');
  });

  it('redirects back with an error when no lines are selected', async () => {
    const formData = new FormData();
    formData.set('status', 'below-cost');
    formData.set('period', '30d');

    await expect(correctTargetedSaleCostsAction(formData)).rejects.toThrow(
      'NEXT_REDIRECT:/settings/data-repair/sale-cost-corrections?status=below-cost&period=30d&error=Select+at+least+one+affected+sale+line+to+correct.',
    );

    expect(selectedLinesFindManyMock).not.toHaveBeenCalled();
  });
});