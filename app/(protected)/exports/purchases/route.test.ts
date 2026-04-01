import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
	getUserMock,
	purchaseInvoiceLineFindManyMock,
	businessFindUniqueMock,
	detectExportFormatMock,
	respondWithExportMock,
} = vi.hoisted(() => ({
	getUserMock: vi.fn(),
	purchaseInvoiceLineFindManyMock: vi.fn(),
	businessFindUniqueMock: vi.fn(),
	detectExportFormatMock: vi.fn(),
	respondWithExportMock: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
	getUser: getUserMock,
}));

vi.mock('@/lib/prisma', () => ({
	prisma: {
		purchaseInvoiceLine: { findMany: purchaseInvoiceLineFindManyMock },
		business: { findUnique: businessFindUniqueMock },
	},
}));

vi.mock('@/lib/exports/branded-export', () => ({
	detectExportFormat: detectExportFormatMock,
	respondWithExport: respondWithExportMock,
}));

import { GET } from './route';

describe('GET /exports/purchases', () => {
	beforeEach(() => {
		vi.clearAllMocks();

		getUserMock.mockResolvedValue({ role: 'MANAGER', businessId: 'biz-1' });
		businessFindUniqueMock.mockResolvedValue({ name: 'Accra Market Hub', currency: 'GHS' });
		detectExportFormatMock.mockReturnValue('csv');
		respondWithExportMock.mockImplementation((params) => Response.json(params));
	});

	it('exports purchase product lines for the selected period and excludes reversed purchase invoices', async () => {
		purchaseInvoiceLineFindManyMock.mockResolvedValue([
			{
				purchaseInvoice: {
					id: 'purchase-1',
					createdAt: new Date('2026-04-05T11:00:00.000Z'),
					store: { name: 'Osu Branch' },
					supplier: { name: 'Fresh Supply Co' },
					payments: [{ amountPence: 1_000 }],
					purchaseReturn: null,
					paymentStatus: 'PART_PAID',
					totalPence: 2_400,
				},
				product: { name: 'Sugar 1kg', sku: 'SG-01' },
				unit: { name: 'bag' },
				qtyInUnit: 4,
				unitCostPence: 500,
				lineSubtotalPence: 2_000,
				lineVatPence: 300,
				lineTotalPence: 2_300,
			},
			{
				purchaseInvoice: {
					id: 'purchase-2',
					createdAt: new Date('2026-04-05T12:00:00.000Z'),
					store: { name: 'Osu Branch' },
					supplier: { name: 'Fresh Supply Co' },
					payments: [],
					purchaseReturn: { id: 'purchase-return-1' },
					paymentStatus: 'UNPAID',
					totalPence: 900,
				},
				product: { name: 'Salt', sku: 'SL-01' },
				unit: { name: 'pack' },
				qtyInUnit: 1,
				unitCostPence: 700,
				lineSubtotalPence: 700,
				lineVatPence: 105,
				lineTotalPence: 805,
			},
		]);

		const response = await GET(new Request('https://example.com/exports/purchases?period=custom&from=2026-04-01&to=2026-04-06'));
		const body = await response.json();
		const expectedStart = new Date('2026-04-01');
		expectedStart.setHours(0, 0, 0, 0);
		const expectedEnd = new Date('2026-04-06');
		expectedEnd.setHours(23, 59, 59, 999);

		const query = purchaseInvoiceLineFindManyMock.mock.calls[0][0];
		expect(query.where.purchaseInvoice.businessId).toBe('biz-1');
		expect(query.where.purchaseInvoice.createdAt.gte.toISOString()).toBe(expectedStart.toISOString());
		expect(query.where.purchaseInvoice.createdAt.lte.toISOString()).toBe(expectedEnd.toISOString());

		expect(body.exportOptions.reportTitle).toBe('Purchases Report — Product Detail');
		expect(body.exportOptions.rows).toHaveLength(1);
		expect(body.exportOptions.rows[0]).toMatchObject({
			product: 'Sugar 1kg',
			unitCost: '5.00',
			paid: '10.00',
			balance: '14.00',
			status: 'PART_PAID',
		});
	});
});