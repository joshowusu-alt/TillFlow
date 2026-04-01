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
};

export type MarginAnalysisSnapshot = {
	rows: MarginAnalysisRow[];
	totalProducts: number;
	belowCostCount: number;
	belowTargetMarginCount: number;
	healthyCount: number;
	businessDefaultThresholdBps: number;
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

	return summarizeMarginAnalysis(lines, business?.minimumMarginThresholdBps ?? 1500);
}