import { describe, expect, it } from 'vitest';
import { summarizeMarginAnalysis } from './margin-analysis';

describe('summarizeMarginAnalysis', () => {
	it('groups sold lines, applies threshold overrides, and flags below-cost and below-target products', () => {
		const snapshot = summarizeMarginAnalysis(
			[
				{
					productId: 'product-a',
					qtyBase: 10,
					lineSubtotalPence: 5_000,
					lineCostPence: 4_500,
					createdAt: new Date('2026-04-01T08:00:00.000Z'),
					product: {
						name: 'Milk 500ml',
						defaultCostBasePence: 430,
						minimumMarginThresholdBps: null,
					},
				},
				{
					productId: 'product-b',
					qtyBase: 4,
					lineSubtotalPence: 1_200,
					lineCostPence: 0,
					createdAt: new Date('2026-04-01T09:30:00.000Z'),
					product: {
						name: 'Cooking Oil 1L',
						defaultCostBasePence: 400,
						minimumMarginThresholdBps: 2_500,
					},
				},
				{
					productId: 'product-c',
					qtyBase: 5,
					lineSubtotalPence: 2_500,
					lineCostPence: 1_500,
					createdAt: new Date('2026-04-01T10:15:00.000Z'),
					product: {
						name: 'Rice 1kg',
						defaultCostBasePence: 300,
						minimumMarginThresholdBps: null,
					},
				},
			],
			1_500,
		);

		expect(snapshot.totalProducts).toBe(3);
		expect(snapshot.belowCostCount).toBe(1);
		expect(snapshot.belowTargetMarginCount).toBe(2);
		expect(snapshot.healthyCount).toBe(1);

		const milk = snapshot.rows.find((row) => row.productId === 'product-a');
		expect(milk).toMatchObject({
			name: 'Milk 500ml',
			thresholdSource: 'business-default',
			belowCost: false,
			belowTargetMargin: true,
			effectiveThresholdPercent: 15,
			averageSellPricePence: 500,
			averageCostPricePence: 450,
		});

		const oil = snapshot.rows.find((row) => row.productId === 'product-b');
		expect(oil).toMatchObject({
			name: 'Cooking Oil 1L',
			thresholdSource: 'product-override',
			belowCost: true,
			belowTargetMargin: true,
			effectiveThresholdPercent: 25,
			averageSellPricePence: 300,
			averageCostPricePence: 400,
		});

		const rice = snapshot.rows.find((row) => row.productId === 'product-c');
		expect(rice).toMatchObject({
			name: 'Rice 1kg',
			belowCost: false,
			belowTargetMargin: false,
		});
	});
});