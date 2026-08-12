import { REPORTING_EXCLUDED_SALE_STATUSES } from '@/lib/reports/reporting-scope';

import { averageOrNull, buildChangePair, contributionToChange } from './change-math';
import type {
  BranchMovementRow,
  BusinessMovementScope,
  CashierMovementRow,
  ChangePair,
  EntityMovementKind,
  ProductMovementRow,
  SalesComparisonResult,
  SalesHeadlineMovement,
} from './types';
import { STOCK_AVAILABILITY_READINESS as READINESS } from './types';

export type PeriodSalesFacts = {
  salesValuePence: number;
  transactionCount: number;
  unitsSold: number;
};

export type NamedSalesBucket = {
  id: string;
  name: string;
  salesValuePence: number;
  transactionCount?: number;
  qtyBase?: number;
};

function entityKind(currentValue: number, comparisonValue: number): EntityMovementKind {
  if (comparisonValue === 0 && currentValue > 0) return 'new';
  if (currentValue === 0 && comparisonValue > 0) return 'no_current_sales';
  return 'continuing';
}

export function buildSalesHeadline(
  current: PeriodSalesFacts,
  comparison: PeriodSalesFacts,
): SalesHeadlineMovement {
  const salesValuePence = buildChangePair(current.salesValuePence, comparison.salesValuePence);
  const transactionCount = buildChangePair(current.transactionCount, comparison.transactionCount);
  const unitsSold = buildChangePair(current.unitsSold, comparison.unitsSold);

  const currentAvg = averageOrNull(current.salesValuePence, current.transactionCount);
  const comparisonAvg = averageOrNull(comparison.salesValuePence, comparison.transactionCount);

  let absoluteChange: number | null = null;
  let percentageChange: number | null = null;
  let percentageChangeStatus: SalesHeadlineMovement['averageTransactionValuePence']['percentageChangeStatus'] =
    'insufficient_data';

  if (currentAvg != null && comparisonAvg != null) {
    const pair = buildChangePair(currentAvg, comparisonAvg);
    absoluteChange = pair.absoluteChange;
    percentageChange = pair.percentageChange;
    percentageChangeStatus = pair.percentageChangeStatus;
  } else if (currentAvg != null && comparisonAvg == null) {
    percentageChangeStatus = 'undefined_zero_comparison';
    absoluteChange = null;
  }

  return {
    salesValuePence,
    transactionCount,
    averageTransactionValuePence: {
      current: currentAvg,
      comparison: comparisonAvg,
      absoluteChange,
      percentageChange,
      percentageChangeStatus,
    },
    unitsSold,
  };
}

type MergedBucket = {
  id: string;
  name: string;
  currentSales: number;
  comparisonSales: number;
  currentQty: number;
  comparisonQty: number;
  currentTx: number;
  comparisonTx: number;
};

function collectMergedBuckets(
  current: NamedSalesBucket[],
  comparison: NamedSalesBucket[],
): MergedBucket[] {
  const map = new Map<string, MergedBucket>();

  for (const row of current) {
    const e = map.get(row.id) ?? {
      id: row.id,
      name: row.name,
      currentSales: 0,
      comparisonSales: 0,
      currentQty: 0,
      comparisonQty: 0,
      currentTx: 0,
      comparisonTx: 0,
    };
    e.name = row.name || e.name;
    e.currentSales += row.salesValuePence;
    e.currentQty += row.qtyBase ?? 0;
    e.currentTx += row.transactionCount ?? 0;
    map.set(row.id, e);
  }
  for (const row of comparison) {
    const e = map.get(row.id) ?? {
      id: row.id,
      name: row.name,
      currentSales: 0,
      comparisonSales: 0,
      currentQty: 0,
      comparisonQty: 0,
      currentTx: 0,
      comparisonTx: 0,
    };
    e.name = row.name || e.name;
    e.comparisonSales += row.salesValuePence;
    e.comparisonQty += row.qtyBase ?? 0;
    e.comparisonTx += row.transactionCount ?? 0;
    map.set(row.id, e);
  }

  return [...map.values()];
}

function rankMovementRows<T extends { kind: EntityMovementKind; salesValuePence: ChangePair }>(
  allRows: T[],
  topN: number,
): {
  growers: T[];
  decliners: T[];
  news: T[];
  noCurrent: T[];
  all: T[];
} {
  const news = allRows.filter((r) => r.kind === 'new');
  const noCurrent = allRows.filter((r) => r.kind === 'no_current_sales');
  const continuingOrAll = allRows.filter((r) => r.kind === 'continuing' || r.kind === 'new');

  const growers = [...allRows]
    .filter((r) => r.salesValuePence.absoluteChange > 0)
    .sort((a, b) => b.salesValuePence.absoluteChange - a.salesValuePence.absoluteChange)
    .slice(0, topN);

  const decliners = [...allRows]
    .filter((r) => r.salesValuePence.absoluteChange < 0)
    .sort((a, b) => a.salesValuePence.absoluteChange - b.salesValuePence.absoluteChange)
    .slice(0, topN);

  return {
    growers,
    decliners,
    news: news.sort((a, b) => b.salesValuePence.current - a.salesValuePence.current).slice(0, topN),
    noCurrent: noCurrent
      .sort((a, b) => b.salesValuePence.comparison - a.salesValuePence.comparison)
      .slice(0, topN),
    all: continuingOrAll,
  };
}

function mergeProductBuckets(current: NamedSalesBucket[], comparison: NamedSalesBucket[], topN: number) {
  const merged = collectMergedBuckets(current, comparison);
  const totalSalesDelta = merged.reduce((sum, e) => sum + (e.currentSales - e.comparisonSales), 0);
  const allRows: ProductMovementRow[] = merged.map((e) => {
    const salesValuePence = buildChangePair(e.currentSales, e.comparisonSales);
    const contrib = contributionToChange(salesValuePence.absoluteChange, totalSalesDelta);
    return {
      productId: e.id,
      productName: e.name,
      kind: entityKind(e.currentSales, e.comparisonSales),
      salesValuePence,
      qtyBase: buildChangePair(e.currentQty, e.comparisonQty),
      contributionToSalesChange: contrib.contribution,
      contributionStatus: contrib.status,
    };
  });
  return rankMovementRows(allRows, topN);
}

function mergeBranchBuckets(current: NamedSalesBucket[], comparison: NamedSalesBucket[], topN: number) {
  const merged = collectMergedBuckets(current, comparison);
  const totalSalesDelta = merged.reduce((sum, e) => sum + (e.currentSales - e.comparisonSales), 0);
  const allRows: BranchMovementRow[] = merged.map((e) => {
    const salesValuePence = buildChangePair(e.currentSales, e.comparisonSales);
    const contrib = contributionToChange(salesValuePence.absoluteChange, totalSalesDelta);
    return {
      storeId: e.id,
      storeName: e.name,
      kind: entityKind(e.currentSales, e.comparisonSales),
      salesValuePence,
      transactionCount: buildChangePair(e.currentTx, e.comparisonTx),
      contributionToSalesChange: contrib.contribution,
      contributionStatus: contrib.status,
    };
  });
  return rankMovementRows(allRows, topN);
}

function mergeCashierBuckets(current: NamedSalesBucket[], comparison: NamedSalesBucket[], topN: number) {
  const merged = collectMergedBuckets(current, comparison);
  const totalSalesDelta = merged.reduce((sum, e) => sum + (e.currentSales - e.comparisonSales), 0);
  const allRows: CashierMovementRow[] = merged.map((e) => {
    const salesValuePence = buildChangePair(e.currentSales, e.comparisonSales);
    const contrib = contributionToChange(salesValuePence.absoluteChange, totalSalesDelta);
    return {
      cashierUserId: e.id,
      cashierName: e.name,
      kind: entityKind(e.currentSales, e.comparisonSales),
      salesValuePence,
      transactionCount: buildChangePair(e.currentTx, e.comparisonTx),
      contributionToSalesChange: contrib.contribution,
      contributionStatus: contrib.status,
    };
  });
  return rankMovementRows(allRows, topN);
}

export function compareSalesMovement(input: {
  scope: BusinessMovementScope;
  currentHeadline: PeriodSalesFacts;
  comparisonHeadline: PeriodSalesFacts;
  currentProducts: NamedSalesBucket[];
  comparisonProducts: NamedSalesBucket[];
  currentBranches: NamedSalesBucket[];
  comparisonBranches: NamedSalesBucket[];
  currentCashiers: NamedSalesBucket[];
  comparisonCashiers: NamedSalesBucket[];
  topN?: number;
}): SalesComparisonResult {
  const topN = input.topN ?? 5;
  const headline = buildSalesHeadline(input.currentHeadline, input.comparisonHeadline);

  const products = mergeProductBuckets(input.currentProducts, input.comparisonProducts, topN);
  const branches = mergeBranchBuckets(input.currentBranches, input.comparisonBranches, 50);
  const cashiers = mergeCashierBuckets(input.currentCashiers, input.comparisonCashiers, 50);

  return {
    scope: input.scope,
    headline,
    productGrowers: products.growers,
    productDecliners: products.decliners,
    newProducts: products.news,
    noCurrentSalesProducts: products.noCurrent,
    branches: branches.all.sort(
      (a, b) => b.salesValuePence.absoluteChange - a.salesValuePence.absoluteChange,
    ),
    cashiers: cashiers.all.sort(
      (a, b) => b.salesValuePence.absoluteChange - a.salesValuePence.absoluteChange,
    ),
    stockAvailabilityReadiness: READINESS,
    stockInsightsEmitted: false,
  };
}

/** Shared invoice where for both periods — sales-revenue contract. */
export function businessMovementSalesInvoiceWhere(input: {
  businessId: string;
  branchIds: string[] | null;
  periodStart: Date;
  periodEndExclusive: Date;
}) {
  return {
    businessId: input.businessId,
    createdAt: { gte: input.periodStart, lt: input.periodEndExclusive },
    paymentStatus: { notIn: [...REPORTING_EXCLUDED_SALE_STATUSES] },
    ...(input.branchIds !== null ? { storeId: { in: input.branchIds } } : {}),
  };
}
