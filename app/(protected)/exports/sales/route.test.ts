import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
	getUserMock,
	salesInvoiceLineFindManyMock,
	businessFindUniqueMock,
	detectExportFormatMock,
	respondWithExportMock,
} = vi.hoisted(() => ({
	getUserMock: vi.fn(),
	salesInvoiceLineFindManyMock: vi.fn(),
	businessFindUniqueMock: vi.fn(),
	detectExportFormatMock: vi.fn(),
	respondWithExportMock: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
	getUser: getUserMock,
}));

vi.mock('@/lib/prisma', () => ({
	prisma: {
		salesInvoiceLine: { findMany: salesInvoiceLineFindManyMock },
		business: { findUnique: businessFindUniqueMock },
	},
}));

vi.mock('@/lib/exports/branded-export', () => ({
	detectExportFormat: detectExportFormatMock,
	respondWithExport: respondWithExportMock,
}));

import { GET } from './route';

describe('GET /exports/sales', () => {
	beforeEach(() => {
		vi.clearAllMocks();

		getUserMock.mockResolvedValue({ role: 'OWNER', businessId: 'biz-1' });
		businessFindUniqueMock.mockResolvedValue({ name: 'Accra Market Hub', currency: 'GHS' });
		detectExportFormatMock.mockReturnValue('csv');
		respondWithExportMock.mockImplementation((params) => Response.json(params));
	});

	it('filters by the selected date range and excludes reversed sales from the main export', async () => {
		salesInvoiceLineFindManyMock.mockResolvedValue([
			{
				salesInvoice: {
					id: 'invoice-1',
					transactionNumber: 'S-1001',
					createdAt: new Date('2026-04-02T10:00:00.000Z'),
					store: { name: 'Main Branch' },
					customer: { name: 'Ama Retail' },
					salesReturn: null,
				},
				product: { name: 'Tomato Paste', sku: 'TP-01', defaultCostBasePence: 300 },
				unit: { name: 'tin' },
				qtyInUnit: 2,
				qtyBase: 2,
				unitPricePence: 600,
				lineDiscountPence: 0,
				promoDiscountPence: 0,
				lineSubtotalPence: 1_200,
				lineVatPence: 180,
				lineTotalPence: 1_380,
				lineCostPence: 0,
			},
			{
				salesInvoice: {
					id: 'invoice-2',
					transactionNumber: 'S-1002',
					createdAt: new Date('2026-04-02T14:00:00.000Z'),
					store: { name: 'Main Branch' },
					customer: null,
					salesReturn: { id: 'sales-return-1' },
				},
				product: { name: 'Milk Powder', sku: 'MP-01', defaultCostBasePence: 500 },
				unit: { name: 'pack' },
				qtyInUnit: 1,
				qtyBase: 1,
				unitPricePence: 900,
				lineDiscountPence: 0,
				promoDiscountPence: 0,
				lineSubtotalPence: 900,
				lineVatPence: 135,
				lineTotalPence: 1_035,
				lineCostPence: 700,
			},
		]);

		const response = await GET(new Request('https://example.com/exports/sales?period=custom&from=2026-04-01&to=2026-04-03'));
		const body = await response.json();
		const expectedStart = new Date('2026-04-01');
		expectedStart.setHours(0, 0, 0, 0);
		const expectedEnd = new Date('2026-04-03');
		expectedEnd.setHours(23, 59, 59, 999);

		const query = salesInvoiceLineFindManyMock.mock.calls[0][0];
		expect(query.where.salesInvoice.businessId).toBe('biz-1');
		expect(query.where.salesInvoice.createdAt.gte.toISOString()).toBe(expectedStart.toISOString());
		expect(query.where.salesInvoice.createdAt.lte.toISOString()).toBe(expectedEnd.toISOString());
		expect(query.where.salesInvoice.paymentStatus).toEqual({ notIn: ['RETURNED', 'VOID'] });

		expect(body.exportOptions.dateRange).toEqual({
			from: expectedStart.toISOString(),
			to: expectedEnd.toISOString(),
		});
		expect(body.exportOptions.rows).toHaveLength(1);
		expect(body.exportOptions.rows[0]).toMatchObject({
			invoice: 'S-1001',
			product: 'Tomato Paste',
			cost: '6.00',
			margin: '6.00',
		});
	});
});