import { coerceReportDate } from './sqlite-report-date-normalization';

export type ReceivableAgeBucket = '0–30 d' | '31–60 d' | '61–90 d' | '90+ d';

export type ReceivableLike = {
	totalPence: number;
	dueDate?: Date | string | number | null;
	createdAt: Date | string | number | null | undefined;
	payments: Array<{ amountPence: number }>;
};

export type InventoryRiskState = 'healthy' | 'low' | 'critical' | 'stockout';

export type InventoryRiskLike = {
	qtyOnHandBase: number;
	reorderPointBase: number;
};

export type ReceivableSummary = {
	outstandingTotalPence: number;
	over60Pence: number;
	over90Pence: number;
	byBucket: Record<ReceivableAgeBucket, number>;
};

export type InventoryRiskSummary = {
	totalTrackedProducts: number;
	productsAboveReorderPoint: number;
	urgentReorderCount: number;
	stockoutImminentCount: number;
	lowStockCount: number;
	criticalCount: number;
	stockoutCount: number;
};

export function computeOutstandingBalance(totalPence: number, payments: Array<{ amountPence: number }>) {
	const paid = payments.reduce((sum, payment) => sum + payment.amountPence, 0);
	return Math.max(totalPence - paid, 0);
}

export function getReceivableAgeBucket(
	dueDate: Date | string | number | null | undefined,
	createdAt: Date | string | number | null | undefined,
	referenceDate = new Date(),
): ReceivableAgeBucket {
	const baseline = coerceReportDate(dueDate) ?? coerceReportDate(createdAt) ?? referenceDate;
	const ageDays = Math.floor((referenceDate.getTime() - baseline.getTime()) / 86_400_000);

	if (ageDays <= 30) return '0–30 d';
	if (ageDays <= 60) return '31–60 d';
	if (ageDays <= 90) return '61–90 d';
	return '90+ d';
}

export function summarizeReceivables(invoices: ReceivableLike[], referenceDate = new Date()): ReceivableSummary {
	const byBucket: Record<ReceivableAgeBucket, number> = {
		'0–30 d': 0,
		'31–60 d': 0,
		'61–90 d': 0,
		'90+ d': 0,
	};

	let outstandingTotalPence = 0;

	for (const invoice of invoices) {
		const balancePence = computeOutstandingBalance(invoice.totalPence, invoice.payments);
		if (balancePence <= 0) continue;

		outstandingTotalPence += balancePence;
		const bucket = getReceivableAgeBucket(invoice.dueDate, invoice.createdAt, referenceDate);
		byBucket[bucket] += balancePence;
	}

	return {
		outstandingTotalPence,
		over60Pence: byBucket['61–90 d'] + byBucket['90+ d'],
		over90Pence: byBucket['90+ d'],
		byBucket,
	};
}

export function classifyInventoryState(qtyOnHandBase: number, reorderPointBase: number): InventoryRiskState {
	if (qtyOnHandBase <= 0) return 'stockout';
	if (reorderPointBase <= 0) return 'healthy';
	if (qtyOnHandBase <= Math.ceil(reorderPointBase * 0.5)) return 'critical';
	if (qtyOnHandBase <= reorderPointBase) return 'low';
	return 'healthy';
}

export function summarizeInventoryRisk(items: InventoryRiskLike[]): InventoryRiskSummary {
	let productsAboveReorderPoint = 0;
	let urgentReorderCount = 0;
	let stockoutImminentCount = 0;
	let lowStockCount = 0;
	let criticalCount = 0;
	let stockoutCount = 0;

	const trackedItems = items.filter((item) => item.reorderPointBase > 0);

	for (const item of trackedItems) {
		const state = classifyInventoryState(item.qtyOnHandBase, item.reorderPointBase);
		if (state === 'healthy') {
			productsAboveReorderPoint += 1;
			continue;
		}

		urgentReorderCount += 1;
		lowStockCount += 1;

		if (state === 'critical') {
			criticalCount += 1;
			stockoutImminentCount += 1;
			continue;
		}

		if (state === 'stockout') {
			stockoutCount += 1;
		}
	}

	return {
		totalTrackedProducts: trackedItems.length,
		productsAboveReorderPoint,
		urgentReorderCount,
		stockoutImminentCount,
		lowStockCount,
		criticalCount,
		stockoutCount,
	};
}