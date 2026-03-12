import { getOwnerBrief, type OwnerBrief } from '@/lib/owner-intel';
import { prisma } from '@/lib/prisma';
import { computeOutstandingBalance } from '@/lib/accounting';
import { formatMoney } from '@/lib/format';
import { formatMixedUnit, getPrimaryPackagingUnit } from '@/lib/units';
import { getTodayKPIs } from './today-kpis';
import { getCashflowForecast } from './forecast';
import { classifyInventoryState, summarizeInventoryRisk } from './operational-metrics';
import {
	ensureSqliteReportDateColumnsNormalized,
	isDateWithinRange,
	isSqliteRuntime,
} from './sqlite-report-date-normalization';

type Tone = 'primary' | 'success' | 'warning' | 'danger' | 'neutral';

export type DashboardTrend = {
	label: string;
	direction: 'up' | 'down' | 'flat';
	tone: 'positive' | 'negative' | 'neutral';
};

export type BusinessHealthCard = {
	id: string;
	label: string;
	value: number;
	kind: 'money' | 'count';
	subtitle: string;
	trend: DashboardTrend;
	tone: Tone;
	href: string;
};

export type AttentionSeverity = 'critical' | 'warning' | 'monitor';

export type AttentionItem = {
	id: string;
	title: string;
	whyItMatters: string;
	severity: AttentionSeverity;
	ctaLabel: string;
	href: string;
};

export type LeakageMetric = {
	id: string;
	label: string;
	value: number;
	kind: 'money' | 'count';
	helper: string;
	tone: Tone;
	href: string;
};

export type InventoryRiskRow = {
	id: string;
	productId: string;
	name: string;
	currentQtyLabel: string;
	currentQtyBase: number;
	reorderThresholdLabel: string;
	reorderPointBase: number;
	reorderQtyBase: number;
	supplierName?: string;
	state: 'low' | 'critical' | 'stockout';
	ctaLabel: 'Reorder' | 'View item' | 'Receive stock';
	href: string;
};

export type ActivityKind =
	| 'sale'
	| 'supplier-payment'
	| 'stock-adjustment'
	| 'discount-override'
	| 'till-variance'
	| 'purchase-received'
	| 'customer-added'
	| 'momo-confirmed';

export type ActivityItem = {
	id: string;
	kind: ActivityKind;
	text: string;
	timestamp: string;
	actor?: string;
	href: string;
	tone: Tone;
};

export type OwnerDashboardSnapshot = {
	generatedAt: string;
	brief: OwnerBrief;
	overviewCards: BusinessHealthCard[];
	attentionItems: AttentionItem[];
	leakageMetrics: LeakageMetric[];
	inventoryRisk: {
		lowStockCount: number;
		criticalCount: number;
		stockoutCount: number;
		rows: InventoryRiskRow[];
		reorderHref: string;
	};
	recentActivity: ActivityItem[];
	moneyPulseSeries: Array<{ date: string; projectedBalancePence: number }>;
};

function startOfDay(date = new Date()) {
	const value = new Date(date);
	value.setHours(0, 0, 0, 0);
	return value;
}

function endOfDay(date = new Date()) {
	const value = new Date(date);
	value.setHours(23, 59, 59, 999);
	return value;
}

function daysFromToday(date: Date) {
	return Math.floor((startOfDay(date).getTime() - startOfDay().getTime()) / 86_400_000);
}

function describeChange(current: number, previous: number): DashboardTrend {
	if (current === 0 && previous === 0) {
		return { label: 'Flat vs yesterday', direction: 'flat', tone: 'neutral' };
	}
	if (previous === 0) {
		return {
			label: current > 0 ? 'Started moving today' : 'No movement yet',
			direction: current > 0 ? 'up' : 'flat',
			tone: current > 0 ? 'positive' : 'neutral',
		};
	}

	const deltaPct = Math.round(((current - previous) / Math.abs(previous)) * 100);
	if (deltaPct === 0) {
		return { label: 'Flat vs yesterday', direction: 'flat', tone: 'neutral' };
	}

	const direction = deltaPct > 0 ? 'up' : 'down';
	return {
		label: `vs yesterday ${deltaPct > 0 ? '+' : ''}${deltaPct}%`,
		direction,
		tone: deltaPct > 0 ? 'positive' : 'negative',
	};
}

function formatQty(qtyBase: number, units: Array<{ isBaseUnit: boolean; conversionToBase: number; unit: { name: string; pluralName: string } }>) {
	const baseUnit = units.find((unit) => unit.isBaseUnit);
	const packaging = getPrimaryPackagingUnit(units);

	return formatMixedUnit({
		qtyBase,
		baseUnit: baseUnit?.unit.name ?? 'unit',
		baseUnitPlural: baseUnit?.unit.pluralName,
		packagingUnit: packaging?.unit.name,
		packagingUnitPlural: packaging?.unit.pluralName,
		packagingConversion: packaging?.conversionToBase,
	});
}

function severityRank(severity: AttentionSeverity) {
	if (severity === 'critical') return 0;
	if (severity === 'warning') return 1;
	return 2;
}

export async function getOwnerDashboardSnapshot(
	businessId: string,
	currency: string,
	storeId?: string,
): Promise<OwnerDashboardSnapshot> {
	let sqliteRuntime = false;

	try {
		await ensureSqliteReportDateColumnsNormalized();
		sqliteRuntime = isSqliteRuntime();
	} catch (error) {
		console.error('[owner-dashboard] SQLite date normalization failed', {
			businessId,
			storeId: storeId ?? null,
			error,
		});
	}

	const todayStart = startOfDay();
	const todayEnd = endOfDay();
	const yesterdayStart = startOfDay(new Date(todayStart.getTime() - 86_400_000));
	const yesterdayEnd = endOfDay(new Date(todayStart.getTime() - 86_400_000));
	const sevenDaysOut = endOfDay(new Date(todayEnd.getTime() + 7 * 86_400_000));

	const storeFilter = storeId ? { storeId } : {};
	const tillStoreFilter = storeId ? { id: storeId } : {};

	const [brief, kpis, forecast, yesterdaySales, yesterdayCashPayments, openTillCash, overdueDebtors, duePurchases, inventoryBalances, recentSales, recentSupplierPayments, recentStockAdjustments, recentDiscountOverrides, recentTillVariances, recentPurchases, recentCustomers, recentMoMo] = await Promise.all([
		getOwnerBrief(businessId, currency, storeId),
		getTodayKPIs(businessId, storeId),
		getCashflowForecast(businessId, 14),
		sqliteRuntime
			? prisma.salesInvoice.findMany({
				where: { businessId, ...storeFilter },
				select: { totalPence: true, grossMarginPence: true, createdAt: true, paymentStatus: true },
			})
			: prisma.salesInvoice.aggregate({
				where: {
					businessId,
					...storeFilter,
					createdAt: { gte: yesterdayStart, lte: yesterdayEnd },
					paymentStatus: { notIn: ['RETURNED', 'VOID'] },
				},
				_sum: { totalPence: true, grossMarginPence: true },
				_count: { id: true },
			}),
		sqliteRuntime
			? prisma.salesPayment.findMany({
				where: {
					method: 'CASH',
					salesInvoice: { businessId, ...(storeId ? { storeId } : {}) },
				},
				select: { amountPence: true, receivedAt: true },
			})
			: prisma.salesPayment.aggregate({
				where: {
					method: 'CASH',
					receivedAt: { gte: yesterdayStart, lte: yesterdayEnd },
					salesInvoice: { businessId, ...(storeId ? { storeId } : {}) },
				},
				_sum: { amountPence: true },
			}),
		prisma.shift.aggregate({
			where: {
				closedAt: null,
				till: { store: { businessId, ...tillStoreFilter } },
			},
			_sum: { expectedCashPence: true },
			_count: { id: true },
		}),
		prisma.salesInvoice.findMany({
			where: {
				businessId,
				...storeFilter,
				paymentStatus: { in: ['UNPAID', 'PART_PAID'] },
				dueDate: { lte: todayEnd },
			},
			select: {
				id: true,
				totalPence: true,
				dueDate: true,
				createdAt: true,
				customer: { select: { id: true, name: true } },
				payments: { select: { amountPence: true } },
			},
			take: 20,
			orderBy: { dueDate: 'asc' },
		}),
		prisma.purchaseInvoice.findMany({
			where: {
				businessId,
				...storeFilter,
				paymentStatus: { in: ['UNPAID', 'PART_PAID'] },
				dueDate: { lte: sevenDaysOut },
			},
			select: {
				id: true,
				totalPence: true,
				dueDate: true,
				createdAt: true,
				supplier: { select: { id: true, name: true } },
				payments: { select: { amountPence: true } },
			},
			take: 20,
			orderBy: { dueDate: 'asc' },
		}),
		prisma.inventoryBalance.findMany({
			where: storeId
				? {
						storeId,
						product: { active: true, reorderPointBase: { gt: 0 } },
					}
				: {
						store: { businessId },
						product: { active: true, reorderPointBase: { gt: 0 } },
					},
			select: {
				id: true,
				qtyOnHandBase: true,
				product: {
					select: {
						id: true,
						name: true,
						reorderPointBase: true,
						reorderQtyBase: true,
						preferredSupplier: { select: { name: true } },
						productUnits: {
							select: {
								isBaseUnit: true,
								conversionToBase: true,
								unit: { select: { name: true, pluralName: true } },
							},
						},
					},
				},
			},
			orderBy: { qtyOnHandBase: 'asc' },
			take: 20,
		}),
		prisma.salesInvoice.findMany({
			where: {
				businessId,
				...storeFilter,
				paymentStatus: { notIn: ['RETURNED', 'VOID'] },
			},
			select: {
				id: true,
				totalPence: true,
				createdAt: true,
				cashierUser: { select: { name: true } },
			},
			orderBy: { createdAt: 'desc' },
			take: 4,
		}),
		prisma.purchasePayment.findMany({
			where: {
				purchaseInvoice: { businessId, ...(storeId ? { storeId } : {}) },
			},
			select: {
				id: true,
				amountPence: true,
				paidAt: true,
				recordedBy: { select: { name: true } },
			},
			orderBy: { paidAt: 'desc' },
			take: 3,
		}),
		prisma.stockAdjustment.findMany({
			where: {
				store: { businessId },
				...(storeId ? { storeId } : {}),
			},
			select: {
				id: true,
				qtyBase: true,
				createdAt: true,
				user: { select: { name: true } },
			},
			orderBy: { createdAt: 'desc' },
			take: 3,
		}),
		prisma.salesInvoice.findMany({
			where: {
				businessId,
				...storeFilter,
				discountOverrideReason: { not: null },
			},
			select: {
				id: true,
				totalPence: true,
				createdAt: true,
				cashierUser: { select: { name: true } },
			},
			orderBy: { createdAt: 'desc' },
			take: 2,
		}),
		prisma.shift.findMany({
			where: {
				till: { store: { businessId, ...tillStoreFilter } },
				closedAt: { not: null },
				variance: { not: 0 },
			},
			select: {
				id: true,
				variance: true,
				closedAt: true,
				user: { select: { name: true } },
			},
			orderBy: { closedAt: 'desc' },
			take: 3,
		}),
		prisma.purchaseInvoice.findMany({
			where: { businessId, ...storeFilter },
			select: {
				id: true,
				totalPence: true,
				createdAt: true,
				supplier: { select: { name: true } },
			},
			orderBy: { createdAt: 'desc' },
			take: 3,
		}),
		prisma.customer.findMany({
			where: { businessId, ...(storeId ? { storeId } : {}) },
			select: { id: true, name: true, createdAt: true },
			orderBy: { createdAt: 'desc' },
			take: 2,
		}),
		prisma.mobileMoneyCollection.findMany({
			where: {
				businessId,
				...(storeId ? { storeId } : {}),
				status: 'CONFIRMED',
			},
			select: {
				id: true,
				amountPence: true,
				confirmedAt: true,
				updatedAt: true,
				initiatedBy: { select: { name: true } },
			},
			orderBy: { updatedAt: 'desc' },
			take: 2,
		}),
	]);

	const normalizedYesterdaySales = sqliteRuntime
		? (yesterdaySales as Array<{ totalPence: number; grossMarginPence: number; createdAt: Date; paymentStatus: string }>).reduce(
			(acc, sale) => {
				if (!isDateWithinRange(sale.createdAt, yesterdayStart, yesterdayEnd)) return acc;
				if (['RETURNED', 'VOID'].includes(sale.paymentStatus)) return acc;
				acc._sum.totalPence += sale.totalPence;
				acc._sum.grossMarginPence += sale.grossMarginPence ?? 0;
				acc._count.id += 1;
				return acc;
			},
			{ _sum: { totalPence: 0, grossMarginPence: 0 }, _count: { id: 0 } }
		)
		: yesterdaySales as { _sum: { totalPence: number | null; grossMarginPence: number | null }; _count: { id: number } };

	const normalizedYesterdayCashPayments = sqliteRuntime
		? {
			_sum: {
				amountPence: (yesterdayCashPayments as Array<{ amountPence: number; receivedAt: Date }>).reduce(
					(sum, payment) => sum + (isDateWithinRange(payment.receivedAt, yesterdayStart, yesterdayEnd) ? payment.amountPence : 0),
					0,
				),
			},
		}
		: yesterdayCashPayments as { _sum: { amountPence: number | null } };

	const overdueBalances = overdueDebtors
		.map((invoice) => ({
			...invoice,
			balancePence: computeOutstandingBalance(invoice),
		}))
		.filter((invoice) => invoice.balancePence > 0 && invoice.customer);

	const duePurchaseBalances = duePurchases
		.map((invoice) => ({
			...invoice,
			balancePence: computeOutstandingBalance(invoice),
			dueInDays: invoice.dueDate ? daysFromToday(invoice.dueDate) : null,
		}))
		.filter((invoice) => invoice.balancePence > 0);

	const inventoryRows = inventoryBalances
		.filter((balance) => balance.qtyOnHandBase <= balance.product.reorderPointBase)
		.map((balance) => {
			const state = classifyInventoryState(balance.qtyOnHandBase, balance.product.reorderPointBase);
			if (state === 'healthy') return null;
			return {
				id: balance.id,
				productId: balance.product.id,
				name: balance.product.name,
				currentQtyLabel: balance.qtyOnHandBase <= 0 ? 'Out of stock' : formatQty(balance.qtyOnHandBase, balance.product.productUnits),
				currentQtyBase: balance.qtyOnHandBase,
				reorderThresholdLabel: formatQty(balance.product.reorderPointBase, balance.product.productUnits),
				reorderPointBase: balance.product.reorderPointBase,
				reorderQtyBase: balance.product.reorderQtyBase,
				supplierName: balance.product.preferredSupplier?.name,
				state,
				ctaLabel: state === 'stockout' ? 'Receive stock' : balance.product.preferredSupplier ? 'Reorder' : 'View item',
				href: `/products/${balance.product.id}`,
			};
		})
		.filter((row): row is InventoryRiskRow => row !== null)
		.sort((a, b) => {
			const rank = { stockout: 0, critical: 1, low: 2 };
			return rank[a.state] - rank[b.state] || a.currentQtyBase - b.currentQtyBase;
		});

	const inventorySummary = summarizeInventoryRisk(
		inventoryBalances.map((balance) => ({
			qtyOnHandBase: balance.qtyOnHandBase,
			reorderPointBase: balance.product.reorderPointBase,
		}))
	);

	const lowStockCount = inventorySummary.lowStockCount;
	const stockoutCount = inventorySummary.stockoutCount;
	const criticalCount = inventorySummary.criticalCount;

	const salesTrend = describeChange(kpis.totalSalesPence, normalizedYesterdaySales._sum.totalPence ?? 0);
	const grossProfitTrend = describeChange(kpis.grossMarginPence, normalizedYesterdaySales._sum.grossMarginPence ?? 0);
	const transactionTrend = describeChange(kpis.txCount, normalizedYesterdaySales._count.id);
	const cashTodayPence = openTillCash._sum.expectedCashPence && openTillCash._sum.expectedCashPence > 0
		? openTillCash._sum.expectedCashPence
		: kpis.paymentSplit.CASH ?? 0;
	const cashTrend = describeChange(kpis.paymentSplit.CASH ?? 0, normalizedYesterdayCashPayments._sum.amountPence ?? 0);

	const overviewCards: BusinessHealthCard[] = [
		{
			id: 'sales',
			label: "Today's Sales",
			value: kpis.totalSalesPence,
			kind: 'money',
			subtitle: kpis.txCount > 0
				? `Average basket ${formatMoney(Math.round(kpis.totalSalesPence / Math.max(kpis.txCount, 1)), currency)}`
				: 'No completed sales yet today',
			trend: salesTrend,
			tone: 'primary',
			href: '/reports/dashboard',
		},
		{
			id: 'gross-profit',
			label: 'Gross Profit',
			value: kpis.grossMarginPence,
			kind: 'money',
			subtitle: `${kpis.gpPercent}% gross margin on today's sales`,
			trend: grossProfitTrend,
			tone: kpis.gpPercent >= 20 ? 'success' : kpis.gpPercent >= 10 ? 'warning' : 'danger',
			href: '/reports/margins',
		},
		{
			id: 'transactions',
			label: 'Transactions',
			value: kpis.txCount,
			kind: 'count',
			subtitle: kpis.txCount > 0 ? `Average basket built from ${kpis.txCount} till ticket${kpis.txCount === 1 ? '' : 's'}` : 'Waiting for the first till ticket',
			trend: transactionTrend,
			tone: 'neutral',
			href: '/reports/dashboard',
		},
		{
			id: 'cash-in-till',
			label: 'Cash in Till',
			value: cashTodayPence,
			kind: 'money',
			subtitle: openTillCash._count.id > 0
				? `${openTillCash._count.id} open till${openTillCash._count.id === 1 ? '' : 's'} reporting expected cash`
				: 'Estimated from cash takings recorded today',
			trend: cashTrend,
			tone: cashTodayPence > 0 ? 'success' : 'neutral',
			href: '/reports/cash-drawer',
		},
		{
			id: 'debtors',
			label: 'Debtors Outstanding',
			value: kpis.outstandingARPence,
			kind: 'money',
			subtitle: overdueBalances.length > 0
				? `${overdueBalances.length} overdue ${overdueBalances.length === 1 ? 'debtor' : 'debtors'} need follow-up`
				: 'All debtor balances are within agreed terms',
			trend: {
				label: overdueBalances.length > 0 ? `${overdueBalances.length} overdue today` : 'No overdue debtors today',
				direction: overdueBalances.length > 0 ? 'down' : 'flat',
				tone: overdueBalances.length > 0 ? 'negative' : 'neutral',
			},
			tone: overdueBalances.length > 0 ? 'warning' : 'neutral',
			href: '/reports/dashboard',
		},
		{
			id: 'payables',
			label: 'Payables Due',
			value: brief.moneyPulse.apDue7DaysPence,
			kind: 'money',
			subtitle: duePurchaseBalances.length > 0
				? `${duePurchaseBalances.length} supplier payment${duePurchaseBalances.length === 1 ? '' : 's'} due in 7 days`
				: 'No supplier payments due in the next 7 days',
			trend: {
				label: duePurchaseBalances.some((invoice) => (invoice.dueInDays ?? 99) <= 1)
					? `${duePurchaseBalances.filter((invoice) => (invoice.dueInDays ?? 99) <= 1).length} due by tomorrow`
					: 'Next supplier payment is scheduled later',
				direction: duePurchaseBalances.length > 0 ? 'down' : 'flat',
				tone: duePurchaseBalances.some((invoice) => (invoice.dueInDays ?? 99) <= 1) ? 'negative' : 'neutral',
			},
			tone: duePurchaseBalances.some((invoice) => (invoice.dueInDays ?? 99) <= 1) ? 'warning' : 'neutral',
			href: '/payments/supplier-payments',
		},
		{
			id: 'low-stock',
			label: 'Low Stock Items',
			value: lowStockCount,
			kind: 'count',
			subtitle: stockoutCount > 0
				? `${stockoutCount} stockout${stockoutCount === 1 ? '' : 's'} already hurting availability`
				: 'Reorder before fast movers go dark on the shelf',
			trend: {
				label: criticalCount > 0 ? `${criticalCount} critical` : 'No critical shelf risk',
				direction: criticalCount > 0 ? 'down' : 'flat',
				tone: criticalCount > 0 ? 'negative' : 'neutral',
			},
			tone: criticalCount > 0 ? 'danger' : lowStockCount > 0 ? 'warning' : 'success',
			href: brief.stockRisk.reorderHref,
		},
	];

	const attentionItems: AttentionItem[] = [];

	overdueBalances.slice(0, 2).forEach((invoice) => {
		attentionItems.push({
			id: `debtor-${invoice.id}`,
			title: `Debtor overdue: ${invoice.customer?.name}`,
			whyItMatters: `Outstanding balance has passed its due date and is tying up ${currency} cash that should already be back in the business.`,
			severity: 'critical',
			ctaLabel: 'View customer',
			href: invoice.customer ? `/customers/${invoice.customer.id}` : '/customers',
		});
	});

	inventoryRows.slice(0, 2).forEach((row) => {
		attentionItems.push({
			id: `stock-${row.productId}`,
			title: row.state === 'stockout'
				? `Stockout: ${row.name}`
				: `Low stock: ${row.name} (${row.currentQtyLabel})`,
			whyItMatters: row.state === 'stockout'
				? 'Customers can no longer buy this item until stock is received or transferred in.'
				: 'Shelf availability is now below your reorder threshold, so a fast mover can stock out before the next delivery.',
			severity: row.state === 'stockout' ? 'critical' : row.state === 'critical' ? 'warning' : 'monitor',
			ctaLabel: row.ctaLabel,
			href: row.href,
		});
	});

	const biggestVariance = recentTillVariances[0];
	if (biggestVariance && biggestVariance.variance) {
		attentionItems.push({
			id: `variance-${biggestVariance.id}`,
			title: 'Till variance detected yesterday',
			whyItMatters: 'A till closed with a cash variance, which can point to counting errors, missed entries, or control leakage.',
			severity: Math.abs(biggestVariance.variance) >= 5000 ? 'critical' : 'warning',
			ctaLabel: 'Review variance',
			href: '/reports/cash-drawer',
		});
	}

	if (kpis.momoPendingCount > 0) {
		attentionItems.push({
			id: 'momo-pending',
			title: `MoMo pending: ${kpis.momoPendingCount} transaction${kpis.momoPendingCount === 1 ? '' : 's'}`,
			whyItMatters: 'Pending mobile money collections can delay cash visibility and leave payments unreconciled.',
			severity: kpis.momoPendingCount >= 5 ? 'warning' : 'monitor',
			ctaLabel: 'Review MoMo',
			href: '/payments/reconciliation',
		});
	}

	const nextSupplierDue = duePurchaseBalances.find((invoice) => invoice.supplier && (invoice.dueInDays ?? 99) <= 1);
	if (nextSupplierDue) {
		attentionItems.push({
			id: `supplier-${nextSupplierDue.id}`,
			title: `Supplier payment due: ${nextSupplierDue.supplier?.name}`,
			whyItMatters: 'A supplier invoice falls due by tomorrow, so cash planning and vendor relationships need attention now.',
			severity: 'warning',
			ctaLabel: 'Review supplier payment',
			href: '/payments/supplier-payments',
		});
	}

	if (kpis.discountOverrideCount > 0) {
		attentionItems.push({
			id: 'discount-overrides',
			title: 'Discount overrides used today',
			whyItMatters: 'Frequent overrides can signal pricing gaps, cashier pressure, or policy abuse that erodes gross profit.',
			severity: kpis.discountOverrideCount > 5 ? 'warning' : 'monitor',
			ctaLabel: 'Review overrides',
			href: '/reports/risk-monitor',
		});
	}

	if (brief.moneyPulse.daysUntilNegative !== null) {
		attentionItems.push({
			id: 'cash-pressure',
			title: 'Cash pressure in the next 14 days',
			whyItMatters: 'Projected cash drops below zero soon, so collections or supplier timing must be managed before it turns urgent.',
			severity: 'critical',
			ctaLabel: 'Open cash forecast',
			href: '/reports/cashflow-forecast',
		});
	}

	const leakageMetrics: LeakageMetric[] = [
		{
			id: 'discount-overrides',
			label: 'Discount overrides (7d)',
			value: brief.leakageWatch.discountOverrideCount,
			kind: 'count',
			helper: brief.leakageWatch.discountOverrideCount > 10 ? 'Higher than normal override activity' : 'Within normal operating range',
			tone: brief.leakageWatch.discountOverrideCount > 10 ? 'warning' : 'neutral',
			href: '/reports/risk-monitor',
		},
		{
			id: 'negative-margin',
			label: 'Items below cost',
			value: brief.leakageWatch.negativeMarginProductCount,
			kind: 'count',
			helper: brief.leakageWatch.negativeMarginProductCount > 0 ? 'Pricing review needed on loss-making lines' : 'No negative-margin items flagged',
			tone: brief.leakageWatch.negativeMarginProductCount > 0 ? 'danger' : 'success',
			href: '/reports/margins',
		},
		{
			id: 'cash-variance',
			label: 'Cash variances (7d)',
			value: brief.leakageWatch.cashVariancePence,
			kind: 'money',
			helper: brief.leakageWatch.cashVariancePence > 0 ? 'Closed shifts need variance follow-up' : 'No cash variance recorded recently',
			tone: brief.leakageWatch.cashVariancePence > 0 ? 'warning' : 'success',
			href: '/reports/cash-drawer',
		},
	];

	const recentActivity = [
		...recentSales.map<ActivityItem>((sale) => ({
			id: `sale-${sale.id}`,
			kind: 'sale',
			text: `Sale recorded — ${formatMoney(sale.totalPence, currency)}`,
			timestamp: sale.createdAt.toISOString(),
			actor: sale.cashierUser?.name,
			href: '/reports/dashboard',
			tone: 'success',
		})),
		...recentSupplierPayments.map<ActivityItem>((payment) => ({
			id: `supplier-payment-${payment.id}`,
			kind: 'supplier-payment',
			text: `Supplier payment recorded — ${formatMoney(payment.amountPence, currency)}`,
			timestamp: payment.paidAt.toISOString(),
			actor: payment.recordedBy?.name,
			href: '/payments/supplier-payments',
			tone: 'primary',
		})),
		...recentStockAdjustments.map<ActivityItem>((adjustment) => ({
			id: `stock-adjustment-${adjustment.id}`,
			kind: 'stock-adjustment',
			text: `Stock adjustment made — ${adjustment.qtyBase} unit${adjustment.qtyBase === 1 ? '' : 's'}`,
			timestamp: adjustment.createdAt.toISOString(),
			actor: adjustment.user?.name,
			href: '/inventory/adjustments',
			tone: 'warning',
		})),
		...recentDiscountOverrides.map<ActivityItem>((invoice) => ({
			id: `discount-override-${invoice.id}`,
			kind: 'discount-override',
			text: 'Discount override approved',
			timestamp: invoice.createdAt.toISOString(),
			actor: invoice.cashierUser?.name,
			href: '/reports/risk-monitor',
			tone: 'warning',
		})),
		...recentTillVariances.map<ActivityItem>((shift) => ({
			id: `till-variance-${shift.id}`,
			kind: 'till-variance',
			text: `Till closed with variance — ${formatMoney(Math.abs(shift.variance ?? 0), currency)}`,
			timestamp: (shift.closedAt ?? new Date()).toISOString(),
			actor: shift.user?.name,
			href: '/reports/cash-drawer',
			tone: 'danger',
		})),
		...recentPurchases.map<ActivityItem>((purchase) => ({
			id: `purchase-${purchase.id}`,
			kind: 'purchase-received',
			text: `Purchase received — ${formatMoney(purchase.totalPence, currency)}`,
			timestamp: purchase.createdAt.toISOString(),
			actor: purchase.supplier?.name,
			href: '/reports/reorder-suggestions',
			tone: 'primary',
		})),
		...recentCustomers.map<ActivityItem>((customer) => ({
			id: `customer-${customer.id}`,
			kind: 'customer-added',
			text: `New customer added — ${customer.name}`,
			timestamp: customer.createdAt.toISOString(),
			href: '/customers',
			tone: 'neutral',
		})),
		...recentMoMo.map<ActivityItem>((collection) => ({
			id: `momo-${collection.id}`,
			kind: 'momo-confirmed',
			text: `MoMo payment confirmed — ${formatMoney(collection.amountPence, currency)}`,
			timestamp: (collection.confirmedAt ?? collection.updatedAt).toISOString(),
			actor: collection.initiatedBy?.name,
			href: '/payments/reconciliation',
			tone: 'success',
		})),
	]
		.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
		.slice(0, 10);

	return {
		generatedAt: brief.generatedAt,
		brief,
		overviewCards,
		attentionItems: attentionItems.sort((a, b) => severityRank(a.severity) - severityRank(b.severity)).slice(0, 6),
		leakageMetrics,
		inventoryRisk: {
			lowStockCount,
			criticalCount,
			stockoutCount,
			rows: inventoryRows.slice(0, 8),
			reorderHref: brief.stockRisk.reorderHref,
		},
		recentActivity,
		moneyPulseSeries: forecast.days.slice(0, 7).map((day) => ({
			date: day.date,
			projectedBalancePence: day.projectedBalancePence,
		})),
	};
}
