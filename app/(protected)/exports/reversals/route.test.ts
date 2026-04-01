import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
	getUserMock,
	salesReturnFindManyMock,
	purchaseReturnFindManyMock,
	businessFindUniqueMock,
	detectExportFormatMock,
	respondWithExportMock,
} = vi.hoisted(() => ({
	getUserMock: vi.fn(),
	salesReturnFindManyMock: vi.fn(),
	purchaseReturnFindManyMock: vi.fn(),
	businessFindUniqueMock: vi.fn(),
	detectExportFormatMock: vi.fn(),
	respondWithExportMock: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
	getUser: getUserMock,
}));

vi.mock('@/lib/prisma', () => ({
	prisma: {
		salesReturn: { findMany: salesReturnFindManyMock },
		purchaseReturn: { findMany: purchaseReturnFindManyMock },
		business: { findUnique: businessFindUniqueMock },
	},
}));

vi.mock('@/lib/exports/branded-export', () => ({
	detectExportFormat: detectExportFormatMock,
	respondWithExport: respondWithExportMock,
}));

import { GET } from './route';

describe('GET /exports/reversals', () => {
	beforeEach(() => {
		vi.clearAllMocks();

		getUserMock.mockResolvedValue({ role: 'OWNER', businessId: 'biz-1' });
		businessFindUniqueMock.mockResolvedValue({ name: 'Accra Market Hub', currency: 'GHS' });
		detectExportFormatMock.mockReturnValue('csv');
		respondWithExportMock.mockImplementation((params) => Response.json(params));
	});

	it('exports sales and purchase reversals separately from the main ledgers', async () => {
		salesReturnFindManyMock.mockResolvedValue([
			{
				createdAt: new Date('2026-04-07T09:00:00.000Z'),
				type: 'VOID',
				refundMethod: 'CASH',
				refundAmountPence: 1_500,
				reasonCode: 'VOID_PRICE_ERROR',
				reason: 'Price entered wrongly',
				user: { name: 'Akosua' },
				managerApprovedBy: { name: 'Kojo Manager' },
				managerApprovalMode: 'PIN',
				salesInvoice: {
					id: 'invoice-1',
					transactionNumber: 'S-1008',
					createdAt: new Date('2026-04-07T08:45:00.000Z'),
					store: { name: 'Main Branch' },
					customer: { name: 'Ama Retail' },
				},
			},
		]);

		purchaseReturnFindManyMock.mockResolvedValue([
			{
				createdAt: new Date('2026-04-06T16:30:00.000Z'),
				type: 'RETURN',
				refundMethod: 'TRANSFER',
				refundAmountPence: 900,
				reasonCode: 'DAMAGED_STOCK',
				reason: 'Supplier picked damaged stock',
				user: { name: 'Yaw' },
				purchaseInvoice: {
					id: 'purchase-1',
					createdAt: new Date('2026-04-06T11:00:00.000Z'),
					store: { name: 'Main Branch' },
					supplier: { name: 'Fresh Supply Co' },
				},
			},
		]);

		const response = await GET(new Request('https://example.com/exports/reversals?period=custom&from=2026-04-01&to=2026-04-07'));
		const body = await response.json();

		expect(body.exportOptions.reportTitle).toBe('Reversals Report — Returns & Voids');
		expect(body.exportOptions.rows).toHaveLength(2);
		expect(body.exportOptions.rows[0]).toMatchObject({
			category: 'Sales',
			type: 'Sale void',
			reference: 'S-1008',
			refundAmount: '15.00',
			recordedBy: 'Akosua',
			approvedBy: 'Kojo Manager',
		});
		expect(body.exportOptions.rows[1]).toMatchObject({
			category: 'Purchases',
			type: 'Purchase return',
			counterparty: 'Fresh Supply Co',
			refundAmount: '9.00',
			recordedBy: 'Yaw',
		});
	});
});