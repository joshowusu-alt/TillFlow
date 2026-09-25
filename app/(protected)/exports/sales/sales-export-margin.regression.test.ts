import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getUserMock, lineFindMany, businessFindUnique } = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  lineFindMany: vi.fn(),
  businessFindUnique: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ getUser: getUserMock }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    salesInvoiceLine: { findMany: lineFindMany },
    business: { findUnique: businessFindUnique },
  },
}));
vi.mock('../_shared', async () => {
  const actual = await vi.importActual<typeof import('../_shared')>('../_shared');
  return {
    ...actual,
    resolveExportDateRange: () => ({
      start: new Date('2026-06-15T21:00:00.000Z'),
      end: new Date('2026-06-16T21:00:00.000Z'),
      fromInputValue: '2026-06-16',
      toInputValue: '2026-06-16',
      periodInputValue: 'custom',
      isCustomRange: true,
    }),
  };
});
vi.mock('@/lib/exports/branded-export', () => ({
  detectExportFormat: () => 'csv',
  respondWithExport: (input: { exportOptions: { rows: unknown[] } }) =>
    new Response(JSON.stringify(input.exportOptions.rows)),
}));

import { GET } from './route';

describe('sales export margin row', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUserMock.mockResolvedValue({ role: 'OWNER', businessId: 'biz-1' });
    businessFindUnique.mockResolvedValue({
      name: 'Till',
      currency: 'GHS',
      timezone: 'Africa/Nairobi',
    });
    lineFindMany.mockResolvedValue([
      {
        qtyInUnit: 1,
        qtyBase: 1,
        unitPricePence: 2000,
        lineDiscountPence: 0,
        promoDiscountPence: 0,
        lineSubtotalPence: 2000,
        lineVatPence: 0,
        lineTotalPence: 2000,
        lineCostPence: 0,
        salesInvoice: {
          id: 'inv-zero',
          transactionNumber: 'S-1',
          createdAt: new Date('2026-06-16T08:00:00.000Z'),
          paymentStatus: 'PAID',
          discountPence: 0,
          store: { name: 'Main' },
          customer: { name: 'Ada' },
          salesReturn: null,
        },
        product: { name: 'Oil', sku: 'OIL', defaultCostBasePence: 400 },
        unit: { name: 'pcs' },
      },
    ]);
  });

  it('publishes no computed margin for an ambiguous stored zero cost', async () => {
    const response = await GET(new Request('http://localhost/exports/sales?from=2026-06-16&to=2026-06-16'));
    const rows = await response.json() as Array<{ cost: string; margin: string }>;
    expect({ cost: rows[0].cost, margin: rows[0].margin }).toEqual({ cost: '0.00', margin: '' });
  });
});
