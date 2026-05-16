import { describe, expect, it } from 'vitest';
import { buildCostCheck, summarizeMarginAnalysis, type MarginAnalysisRow } from './margin-analysis';

function makeMarginRow(overrides: Partial<MarginAnalysisRow> = {}): MarginAnalysisRow {
	return {
		productId: 'product-a',
		name: 'BEL-COLA',
		qtySold: 10,
		revenuePence: 2_590,
		costPence: 6_700,
		profitPence: -4_110,
		marginPercent: -158.7,
		marginDeltaPercent: -173.7,
		effectiveThresholdBps: 1_500,
		effectiveThresholdPercent: 15,
		thresholdSource: 'business-default',
		averageSellPricePence: 259,
		averageCostPricePence: 670,
		belowCost: true,
		belowTargetMargin: true,
		lastSoldAt: new Date('2026-05-16T10:00:00.000Z'),
		...overrides,
	};
}

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

describe('buildCostCheck', () => {
	it('flags likely package cost keyed as base cost before other checks', () => {
		const check = buildCostCheck({
			row: makeMarginRow(),
			defaultCostBasePence: 240,
			inventoryAvgCostBasePence: 670,
			lastPurchaseCostBasePence: 250,
			lastPurchaseAt: new Date('2026-05-15T10:00:00.000Z'),
			baseUnitName: 'bottle',
			packageUnits: [
				{ name: 'crate', conversionToBase: 24, defaultCostPence: 670 },
			],
		});

		expect(check.likelyIssue).toBe('package-cost-as-base');
		expect(check.recommendedAction).toContain('repair current WAC');
	});

	it('flags stale WAC when current product cost is sane but inventory average is too high', () => {
		const check = buildCostCheck({
			row: makeMarginRow({ averageCostPricePence: 670 }),
			defaultCostBasePence: 240,
			inventoryAvgCostBasePence: 670,
			lastPurchaseCostBasePence: 250,
			lastPurchaseAt: new Date('2026-05-15T10:00:00.000Z'),
			baseUnitName: 'bottle',
			packageUnits: [],
		});

		expect(check.likelyIssue).toBe('stale-wac');
		expect(check.recommendedAction).toContain('Repair Inventory Average Costs');
	});

	it('flags a real loss when recent purchase cost is above the sell price', () => {
		const check = buildCostCheck({
			row: makeMarginRow({ averageCostPricePence: 300, costPence: 3_000 }),
			defaultCostBasePence: 300,
			inventoryAvgCostBasePence: 300,
			lastPurchaseCostBasePence: 310,
			lastPurchaseAt: new Date('2026-05-15T10:00:00.000Z'),
			baseUnitName: 'bottle',
			packageUnits: [],
		});

		expect(check.likelyIssue).toBe('real-loss');
		expect(check.recommendedAction).toContain('Raise selling price');
	});
});
