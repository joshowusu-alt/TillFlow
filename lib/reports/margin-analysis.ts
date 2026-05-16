import { prisma } from '@/lib/prisma';

type MarginAnalysisLine = {
	productId: string;
	qtyBase: number;
	lineSubtotalPence: number;
	lineCostPence: number;
	createdAt: Date;
	product: {
		name: string;
		defaultCostBasePence: number;
		minimumMarginThresholdBps: number | null;
	};
};

export type MarginAnalysisRow = {
	productId: string;
	name: string;
	qtySold: number;
	revenuePence: number;
	costPence: number;
	profitPence: number;
	marginPercent: number;
	marginDeltaPercent: number;
	effectiveThresholdBps: number;
	effectiveThresholdPercent: number;
	thresholdSource: 'business-default' | 'product-override';
	averageSellPricePence: number;
	averageCostPricePence: number;
	belowCost: boolean;
	belowTargetMargin: boolean;
	lastSoldAt: Date;
	costCheck?: MarginCostCheck;
};

export type MarginAnalysisSnapshot = {
	rows: MarginAnalysisRow[];
	totalProducts: number;
	belowCostCount: number;
	belowTargetMarginCount: number;
	healthyCount: number;
	businessDefaultThresholdBps: number;
};

export type MarginCostCheck = {
	defaultCostBasePence: number;
	inventoryAvgCostBasePence: number | null;
	lastPurchaseCostBasePence: number | null;
	lastPurchaseAt: Date | null;
	baseUnitName: string | null;
	packageUnits: Array<{
		name: string;
		conversionToBase: number;
		defaultCostPence: number | null;
	}>;
	costUsedLabel: string;
	likelyIssue: 'real-loss' | 'stale-wac' | 'package-cost-as-base' | 'historical-cost' | 'needs-review' | 'healthy';
	explanation: string;
	recommendedAction: string;
};

type MarginAnalysisQueryOptions = {
	businessId: string;
	storeId?: string;
	start: Date;
	end: Date;
};

export function summarizeMarginAnalysis(
	lines: MarginAnalysisLine[],
	businessDefaultThresholdBps: number,
): MarginAnalysisSnapshot {
	const productStats = new Map<
		string,
		{
			productId: string;
			name: string;
			qtySold: number;
			revenuePence: number;
			costPence: number;
			effectiveThresholdBps: number;
			thresholdSource: 'business-default' | 'product-override';
			lastSoldAt: Date;
		}
	>();

	for (const line of lines) {
		const effectiveThresholdBps = line.product.minimumMarginThresholdBps ?? businessDefaultThresholdBps;
		const thresholdSource = line.product.minimumMarginThresholdBps != null ? 'product-override' : 'business-default';
		const lineCost = line.lineCostPence > 0
			? line.lineCostPence
			: line.product.defaultCostBasePence * line.qtyBase;

		const existing = productStats.get(line.productId) ?? {
			productId: line.productId,
			name: line.product.name,
			qtySold: 0,
			revenuePence: 0,
			costPence: 0,
			effectiveThresholdBps,
			thresholdSource,
			lastSoldAt: line.createdAt,
		};

		existing.qtySold += line.qtyBase;
		existing.revenuePence += line.lineSubtotalPence;
		existing.costPence += lineCost;
		if (line.createdAt > existing.lastSoldAt) {
			existing.lastSoldAt = line.createdAt;
		}

		productStats.set(line.productId, existing);
	}

	const rows = Array.from(productStats.values())
		.map((row) => {
			const profitPence = row.revenuePence - row.costPence;
			const marginPercent = row.revenuePence > 0 ? (profitPence / row.revenuePence) * 100 : 0;
			const effectiveThresholdPercent = row.effectiveThresholdBps / 100;
			const belowCost = row.revenuePence > 0 && profitPence < 0;
			const belowTargetMargin = row.revenuePence > 0 && marginPercent < effectiveThresholdPercent;

			return {
				productId: row.productId,
				name: row.name,
				qtySold: row.qtySold,
				revenuePence: row.revenuePence,
				costPence: row.costPence,
				profitPence,
				marginPercent,
				marginDeltaPercent: marginPercent - effectiveThresholdPercent,
				effectiveThresholdBps: row.effectiveThresholdBps,
				effectiveThresholdPercent,
				thresholdSource: row.thresholdSource,
				averageSellPricePence: row.qtySold > 0 ? Math.round(row.revenuePence / row.qtySold) : 0,
				averageCostPricePence: row.qtySold > 0 ? Math.round(row.costPence / row.qtySold) : 0,
				belowCost,
				belowTargetMargin,
				lastSoldAt: row.lastSoldAt,
			};
		})
		.sort((a, b) => a.name.localeCompare(b.name));

	const belowCostCount = rows.filter((row) => row.belowCost).length;
	const belowTargetMarginCount = rows.filter((row) => row.belowTargetMargin).length;

	return {
		rows,
		totalProducts: rows.length,
		belowCostCount,
		belowTargetMarginCount,
		healthyCount: rows.filter((row) => !row.belowTargetMargin && !row.belowCost).length,
		businessDefaultThresholdBps,
	};
}

export async function getMarginAnalysisSnapshot({
	businessId,
	storeId,
	start,
	end,
}: MarginAnalysisQueryOptions): Promise<MarginAnalysisSnapshot> {
	const [business, rawLines] = await Promise.all([
		prisma.business.findUnique({
			where: { id: businessId },
			select: { minimumMarginThresholdBps: true },
		}),
		prisma.salesInvoiceLine.findMany({
			where: {
				salesInvoice: {
					businessId,
					...(storeId ? { storeId } : {}),
					createdAt: { gte: start, lte: end },
					paymentStatus: { notIn: ['RETURNED', 'VOID'] },
				},
			},
			select: {
				productId: true,
				qtyBase: true,
				lineSubtotalPence: true,
				lineCostPence: true,
				salesInvoice: {
					select: {
						createdAt: true,
						salesReturn: { select: { id: true } },
					},
				},
				product: {
					select: {
						name: true,
						defaultCostBasePence: true,
						minimumMarginThresholdBps: true,
					},
				},
			},
			orderBy: { salesInvoice: { createdAt: 'desc' } },
		}),
	]);

	const lines: MarginAnalysisLine[] = rawLines
		.filter((line) => !line.salesInvoice.salesReturn)
		.map((line) => ({
			productId: line.productId,
			qtyBase: line.qtyBase,
			lineSubtotalPence: line.lineSubtotalPence,
			lineCostPence: line.lineCostPence,
			createdAt: line.salesInvoice.createdAt,
			product: line.product,
		}));

	const snapshot = summarizeMarginAnalysis(lines, business?.minimumMarginThresholdBps ?? 1500);
	return enrichMarginRowsWithCostChecks(snapshot, { businessId, storeId });
}

async function enrichMarginRowsWithCostChecks(
	snapshot: MarginAnalysisSnapshot,
	{ businessId, storeId }: Pick<MarginAnalysisQueryOptions, 'businessId' | 'storeId'>,
): Promise<MarginAnalysisSnapshot> {
	if (snapshot.rows.length === 0) return snapshot;

	const productIds = snapshot.rows.map((row) => row.productId);
	const [products, purchaseLines] = await Promise.all([
		prisma.product.findMany({
			where: { businessId, id: { in: productIds } },
			select: {
				id: true,
				defaultCostBasePence: true,
				productUnits: {
					select: {
						isBaseUnit: true,
						conversionToBase: true,
						defaultCostPence: true,
						unit: { select: { name: true, pluralName: true } },
					},
					orderBy: [{ isBaseUnit: 'desc' }, { conversionToBase: 'asc' }],
				},
				inventoryBalances: {
					where: storeId ? { storeId } : undefined,
					select: { avgCostBasePence: true, qtyOnHandBase: true },
				},
			},
		}),
		prisma.purchaseInvoiceLine.findMany({
			where: {
				productId: { in: productIds },
				purchaseInvoice: {
					businessId,
					...(storeId ? { storeId } : {}),
				},
			},
			select: {
				productId: true,
				unitCostPence: true,
				conversionToBase: true,
				purchaseInvoice: { select: { createdAt: true } },
			},
			orderBy: { createdAt: 'desc' },
		}),
	]);

	const productMap = new Map(products.map((product) => [product.id, product]));
	const lastPurchaseByProduct = new Map<string, { costBasePence: number; purchasedAt: Date }>();
	for (const line of purchaseLines) {
		if (lastPurchaseByProduct.has(line.productId)) continue;
		lastPurchaseByProduct.set(line.productId, {
			costBasePence: Math.round(line.unitCostPence / Math.max(line.conversionToBase, 1)),
			purchasedAt: line.purchaseInvoice.createdAt,
		});
	}

	return {
		...snapshot,
		rows: snapshot.rows.map((row) => {
			const product = productMap.get(row.productId);
			if (!product) return row;

			const inventoryWithCost = product.inventoryBalances.filter((balance) => balance.avgCostBasePence > 0);
			const inventoryAvgCostBasePence =
				inventoryWithCost.length > 0
					? Math.round(
						inventoryWithCost.reduce((sum, balance) => sum + balance.avgCostBasePence * Math.max(balance.qtyOnHandBase, 0), 0)
						/ Math.max(inventoryWithCost.reduce((sum, balance) => sum + Math.max(balance.qtyOnHandBase, 0), 0), 1),
					)
					: null;
			const baseUnit = product.productUnits.find((unit) => unit.isBaseUnit || unit.conversionToBase === 1);
			const packageUnits = product.productUnits
				.filter((unit) => !unit.isBaseUnit && unit.conversionToBase > 1)
				.slice(0, 4)
				.map((unit) => ({
					name: unit.unit.name,
					conversionToBase: unit.conversionToBase,
					defaultCostPence: unit.defaultCostPence,
				}));
			const lastPurchase = lastPurchaseByProduct.get(row.productId) ?? null;

			return {
				...row,
				costCheck: buildCostCheck({
					row,
					defaultCostBasePence: product.defaultCostBasePence,
					inventoryAvgCostBasePence,
					lastPurchaseCostBasePence: lastPurchase?.costBasePence ?? null,
					lastPurchaseAt: lastPurchase?.purchasedAt ?? null,
					baseUnitName: baseUnit?.unit.name ?? null,
					packageUnits,
				}),
			};
		}),
	};
}

export function buildCostCheck(input: {
	row: MarginAnalysisRow;
	defaultCostBasePence: number;
	inventoryAvgCostBasePence: number | null;
	lastPurchaseCostBasePence: number | null;
	lastPurchaseAt: Date | null;
	baseUnitName: string | null;
	packageUnits: MarginCostCheck['packageUnits'];
}): MarginCostCheck {
	const {
		row,
		defaultCostBasePence,
		inventoryAvgCostBasePence,
		lastPurchaseCostBasePence,
		lastPurchaseAt,
		baseUnitName,
		packageUnits,
	} = input;

	const costUsedLabel = row.costPence > 0
		? 'Sale-line cost snapshot'
		: 'Product default fallback';

	const suspiciousPackageUnit = packageUnits.find((unit) =>
		unit.defaultCostPence != null &&
		Math.abs(row.averageCostPricePence - unit.defaultCostPence) <= Math.max(1, Math.round(unit.defaultCostPence * 0.03))
	);

	let likelyIssue: MarginCostCheck['likelyIssue'] = 'healthy';
	let explanation = 'This product is meeting its configured margin target.';
	let recommendedAction = 'No action needed.';

	if (row.belowCost || row.belowTargetMargin) {
		if (suspiciousPackageUnit) {
			likelyIssue = 'package-cost-as-base';
			explanation = `The cost used is close to the ${suspiciousPackageUnit.name} cost, not the base-unit cost. This often means pack/carton cost was stored as per-unit cost.`;
			recommendedAction = 'Check product unit conversion and default costs, then repair current WAC and affected sale lines if needed.';
		} else if (
			inventoryAvgCostBasePence != null &&
			defaultCostBasePence > 0 &&
			inventoryAvgCostBasePence > row.averageSellPricePence &&
			defaultCostBasePence <= row.averageSellPricePence
		) {
			likelyIssue = 'stale-wac';
			explanation = 'The current product default cost is below the selling price, but inventory WAC is still above it. The balance may be carrying an old or bad average cost.';
			recommendedAction = 'Confirm product setup, then run Repair Inventory Average Costs before changing prices.';
		} else if (lastPurchaseCostBasePence != null && lastPurchaseCostBasePence > row.averageSellPricePence) {
			likelyIssue = 'real-loss';
			explanation = 'The latest purchase cost is above the selling price. This is likely a real loss unless that purchase entry was keyed incorrectly.';
			recommendedAction = 'Raise selling price, negotiate buying cost, or confirm this was an intentional promotion/clearance sale.';
		} else if (row.costPence > 0 && defaultCostBasePence > 0 && Math.abs(row.averageCostPricePence - defaultCostBasePence) > Math.max(1, Math.round(defaultCostBasePence * 0.15))) {
			likelyIssue = 'historical-cost';
			explanation = "The report is using historical sale-line cost, which differs meaningfully from today's product default cost.";
			recommendedAction = 'If old sales inherited a bad cost, use Targeted Sale Cost Corrections. Otherwise treat this as true historical margin.';
		} else {
			likelyIssue = 'needs-review';
			explanation = 'The cost basis is above the margin target. It may be genuine low margin, stale cost, or a unit setup issue.';
			recommendedAction = 'Review product setup, recent purchases, and whether the sale was discounted or promotional.';
		}
	}

	return {
		defaultCostBasePence,
		inventoryAvgCostBasePence,
		lastPurchaseCostBasePence,
		lastPurchaseAt,
		baseUnitName,
		packageUnits,
		costUsedLabel,
		likelyIssue,
		explanation,
		recommendedAction,
	};
}
