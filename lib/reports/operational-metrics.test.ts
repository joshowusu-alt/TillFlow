import { describe, expect, it } from 'vitest';

import {
	classifyInventoryState,
	computeOutstandingBalance,
	getReceivableAgeBucket,
	summarizeInventoryRisk,
	summarizeReceivables,
} from './operational-metrics';

describe('operational report metrics helpers', () => {
	it('uses due date when bucketting receivables', () => {
		const referenceDate = new Date('2026-03-12T12:00:00.000Z');
		expect(
			getReceivableAgeBucket('2026-01-01T00:00:00.000Z', '2026-02-20T00:00:00.000Z', referenceDate)
		).toBe('61–90 d');
	});

	it('falls back to createdAt when due date is missing', () => {
		const referenceDate = new Date('2026-03-12T12:00:00.000Z');
		expect(
			getReceivableAgeBucket(null, '2025-11-01T00:00:00.000Z', referenceDate)
		).toBe('90+ d');
	});

	it('summarizes outstanding receivables by age bucket using balances not face value', () => {
		const summary = summarizeReceivables(
			[
				{
					totalPence: 10_000,
					dueDate: '2026-02-15T00:00:00.000Z',
					createdAt: '2026-02-10T00:00:00.000Z',
					payments: [{ amountPence: 2_500 }],
				},
				{
					totalPence: 20_000,
					dueDate: '2025-12-01T00:00:00.000Z',
					createdAt: '2025-11-25T00:00:00.000Z',
					payments: [{ amountPence: 5_000 }],
				},
			],
			new Date('2026-03-12T12:00:00.000Z')
		);

		expect(summary.outstandingTotalPence).toBe(22_500);
		expect(summary.byBucket['0–30 d']).toBe(7_500);
		expect(summary.byBucket['90+ d']).toBe(15_000);
		expect(summary.over60Pence).toBe(15_000);
		expect(summary.over90Pence).toBe(15_000);
	});

	it('classifies inventory states consistently', () => {
		expect(classifyInventoryState(0, 10)).toBe('stockout');
		expect(classifyInventoryState(4, 10)).toBe('critical');
		expect(classifyInventoryState(8, 10)).toBe('low');
		expect(classifyInventoryState(12, 10)).toBe('healthy');
	});

	it('summarizes inventory risk counts from shared thresholds', () => {
		const summary = summarizeInventoryRisk([
			{ qtyOnHandBase: 0, reorderPointBase: 10 },
			{ qtyOnHandBase: 4, reorderPointBase: 10 },
			{ qtyOnHandBase: 8, reorderPointBase: 10 },
			{ qtyOnHandBase: 12, reorderPointBase: 10 },
		]);

		expect(summary.totalTrackedProducts).toBe(4);
		expect(summary.productsAboveReorderPoint).toBe(1);
		expect(summary.urgentReorderCount).toBe(3);
		expect(summary.stockoutImminentCount).toBe(1);
		expect(summary.lowStockCount).toBe(3);
		expect(summary.criticalCount).toBe(1);
		expect(summary.stockoutCount).toBe(1);
	});

	it('computes outstanding balances safely', () => {
		expect(computeOutstandingBalance(5_000, [{ amountPence: 2_000 }, { amountPence: 4_000 }])).toBe(0);
	});
});