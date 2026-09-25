import type { Prisma, PrismaClient } from '@prisma/client';
import { rankRecognisedProductSales } from '@/lib/reports/product-rank';

import {
  businessMovementSalesInvoiceWhere,
  compareSalesMovement,
  type NamedSalesBucket,
  type PeriodSalesFacts,
} from './sales-comparison';
import type { BusinessMovementScope, SalesComparisonResult } from './types';
import { BUSINESS_MOVEMENT_DEFINITION_VERSION } from './types';
import {
  resolveEqualLengthPeriodPair,
  resolveLastFullCalendarMonthPair,
} from './periods';

export type Db = PrismaClient | Prisma.TransactionClient;

async function loadPeriodHeadline(
  db: Db,
  businessId: string,
  branchIds: string[] | null,
  periodStart: Date,
  periodEndExclusive: Date,
): Promise<PeriodSalesFacts> {
  const where = businessMovementSalesInvoiceWhere({
    businessId,
    branchIds,
    periodStart,
    periodEndExclusive,
  });

  const [invoiceAgg, lineAgg] = await Promise.all([
    db.salesInvoice.aggregate({
      where,
      _sum: { totalPence: true },
      _count: { id: true },
    }),
    db.salesInvoiceLine.aggregate({
      where: { salesInvoice: where },
      _sum: { qtyBase: true },
    }),
  ]);

  return {
    salesValuePence: invoiceAgg._sum.totalPence ?? 0,
    transactionCount: invoiceAgg._count.id,
    unitsSold: lineAgg._sum.qtyBase ?? 0,
  };
}

async function loadProductBuckets(
  db: Db,
  businessId: string,
  branchIds: string[] | null,
  periodStart: Date,
  periodEndExclusive: Date,
): Promise<NamedSalesBucket[]> {
  const where = businessMovementSalesInvoiceWhere({
    businessId,
    branchIds,
    periodStart,
    periodEndExclusive,
  });

  const invoices = await db.salesInvoice.findMany({
    where,
    select: {
      paymentStatus: true,
      discountPence: true,
      vatPence: true,
      totalPence: true,
      lines: {
        select: {
          productId: true,
          qtyBase: true,
          lineSubtotalPence: true,
          lineDiscountPence: true,
          promoDiscountPence: true,
          lineVatPence: true,
          lineTotalPence: true,
        },
      },
    },
  });

  const totals = new Map<string, { salesValuePence: number; qtyBase: number }>();
  let unallocatedSalesDifferencePence = 0;
  for (const invoice of invoices) {
    const ranked = rankRecognisedProductSales(invoice);
    if (!ranked.ok) {
      unallocatedSalesDifferencePence += ranked.differencePence;
      continue;
    }
    const qtyByProduct = new Map<string, number>();
    for (const line of invoice.lines) {
      qtyByProduct.set(line.productId, (qtyByProduct.get(line.productId) ?? 0) + line.qtyBase);
    }
    for (const row of ranked.lines) {
      const current = totals.get(row.productId) ?? { salesValuePence: 0, qtyBase: 0 };
      current.salesValuePence += row.amountPence;
      current.qtyBase += qtyByProduct.get(row.productId) ?? 0;
      qtyByProduct.set(row.productId, 0);
      totals.set(row.productId, current);
    }
  }

  if (totals.size === 0 && unallocatedSalesDifferencePence === 0) return [];

  const products = await db.product.findMany({
    where: { id: { in: [...totals.keys()] } },
    select: { id: true, name: true },
  });
  const nameById = new Map(products.map((p) => [p.id, p.name]));

  const rows = [...totals.entries()].map(([productId, bucket]) => ({
    id: productId,
    name: nameById.get(productId) ?? productId,
    salesValuePence: bucket.salesValuePence,
    qtyBase: bucket.qtyBase,
  }));
  if (unallocatedSalesDifferencePence !== 0) {
    rows.push({
      id: 'unallocated-sales-difference',
      name: 'Unallocated sales difference',
      salesValuePence: unallocatedSalesDifferencePence,
      qtyBase: 0,
    });
  }
  return rows;
}

async function loadBranchBuckets(
  db: Db,
  businessId: string,
  branchIds: string[] | null,
  periodStart: Date,
  periodEndExclusive: Date,
): Promise<NamedSalesBucket[]> {
  const where = businessMovementSalesInvoiceWhere({
    businessId,
    branchIds,
    periodStart,
    periodEndExclusive,
  });

  const grouped = await db.salesInvoice.groupBy({
    by: ['storeId'],
    where,
    _sum: { totalPence: true },
    _count: { id: true },
  });

  if (grouped.length === 0) return [];

  const stores = await db.store.findMany({
    where: { id: { in: grouped.map((g) => g.storeId) } },
    select: { id: true, name: true },
  });
  const nameById = new Map(stores.map((s) => [s.id, s.name]));

  return grouped.map((g) => ({
    id: g.storeId,
    name: nameById.get(g.storeId) ?? g.storeId,
    salesValuePence: g._sum.totalPence ?? 0,
    transactionCount: g._count.id,
  }));
}

/**
 * Cashier movement is supported: SalesInvoice.cashierUserId is required on schema.
 */
async function loadCashierBuckets(
  db: Db,
  businessId: string,
  branchIds: string[] | null,
  periodStart: Date,
  periodEndExclusive: Date,
): Promise<NamedSalesBucket[]> {
  const where = businessMovementSalesInvoiceWhere({
    businessId,
    branchIds,
    periodStart,
    periodEndExclusive,
  });

  const grouped = await db.salesInvoice.groupBy({
    by: ['cashierUserId'],
    where,
    _sum: { totalPence: true },
    _count: { id: true },
  });

  if (grouped.length === 0) return [];

  const users = await db.user.findMany({
    where: { id: { in: grouped.map((g) => g.cashierUserId) } },
    select: { id: true, name: true },
  });
  const nameById = new Map(users.map((u) => [u.id, u.name ?? u.id]));

  return grouped.map((g) => ({
    id: g.cashierUserId,
    name: nameById.get(g.cashierUserId) ?? g.cashierUserId,
    salesValuePence: g._sum.totalPence ?? 0,
    transactionCount: g._count.id,
  }));
}

export async function computeSalesComparisonFromDb(
  db: Db,
  input: {
    businessId: string;
    currency: string;
    timeZone?: string | null;
    branchIds?: string[] | null;
    /** Default: last full calendar month vs prior month */
    period?:
      | { preset: 'last_full_calendar_month'; asOf?: Date }
      | { preset: 'equal_length_custom'; currentFromKey: string; currentToKey: string };
    topN?: number;
    asOf?: Date;
  },
): Promise<SalesComparisonResult> {
  const asOf = input.asOf ?? new Date();
  const periods =
    input.period?.preset === 'equal_length_custom'
      ? resolveEqualLengthPeriodPair({
          timeZone: input.timeZone,
          currentFromKey: input.period.currentFromKey,
          currentToKey: input.period.currentToKey,
        })
      : resolveLastFullCalendarMonthPair({
          timeZone: input.timeZone,
          asOf: input.period && 'asOf' in input.period ? input.period.asOf : asOf,
        });

  const scope: BusinessMovementScope = {
    businessId: input.businessId,
    branchIds: input.branchIds ?? null,
    currency: input.currency,
    periods,
    asOf,
    definitionVersion: BUSINESS_MOVEMENT_DEFINITION_VERSION,
  };

  const branchIds = scope.branchIds;
  const [
    currentHeadline,
    comparisonHeadline,
    currentProducts,
    comparisonProducts,
    currentBranches,
    comparisonBranches,
    currentCashiers,
    comparisonCashiers,
  ] = await Promise.all([
    loadPeriodHeadline(db, scope.businessId, branchIds, periods.currentStart, periods.currentEndExclusive),
    loadPeriodHeadline(
      db,
      scope.businessId,
      branchIds,
      periods.comparisonStart,
      periods.comparisonEndExclusive,
    ),
    loadProductBuckets(db, scope.businessId, branchIds, periods.currentStart, periods.currentEndExclusive),
    loadProductBuckets(
      db,
      scope.businessId,
      branchIds,
      periods.comparisonStart,
      periods.comparisonEndExclusive,
    ),
    loadBranchBuckets(db, scope.businessId, branchIds, periods.currentStart, periods.currentEndExclusive),
    loadBranchBuckets(
      db,
      scope.businessId,
      branchIds,
      periods.comparisonStart,
      periods.comparisonEndExclusive,
    ),
    loadCashierBuckets(db, scope.businessId, branchIds, periods.currentStart, periods.currentEndExclusive),
    loadCashierBuckets(
      db,
      scope.businessId,
      branchIds,
      periods.comparisonStart,
      periods.comparisonEndExclusive,
    ),
  ]);

  return compareSalesMovement({
    scope,
    currentHeadline,
    comparisonHeadline,
    currentProducts,
    comparisonProducts,
    currentBranches,
    comparisonBranches,
    currentCashiers,
    comparisonCashiers,
    topN: input.topN,
  });
}
