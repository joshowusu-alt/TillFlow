/**
 * Shared Prisma WHERE builders for Home catalogue recommendations.
 *
 * Single source of truth for:
 * - Home counts (STOCK_SETUP_GAP / UNUSED_CATALOGUE)
 * - Products destination filters
 * - Opening-stock / deactivate eligibility
 *
 * Filtering and aggregation stay in the database — callers must not load the
 * full candidate catalogue into application memory to count or paginate.
 */

import type { Prisma } from '@prisma/client';
import {
  OPENING_STOCK_MOVEMENT_TYPES,
  OPENING_STOCK_REFERENCE_TYPES,
} from '@/lib/improve-records-constants';
import { catalogueCutoffDate } from '@/lib/improve-records-classify';

/** Stock-movement markers that confirm a quantity was recorded somewhere. */
export const CONFIRMED_QUANTITY_MOVEMENT_TYPES = [
  ...OPENING_STOCK_MOVEMENT_TYPES,
  'PURCHASE',
  'TRANSFER_IN',
  'ADJUSTMENT',
  'ADJUSTMENT_IN',
  'STOCKTAKE',
  'STOCK_TAKE',
] as const;

export const CONFIRMED_QUANTITY_REFERENCE_TYPES = [
  ...OPENING_STOCK_REFERENCE_TYPES,
  'PURCHASE_INVOICE',
  'STOCK_ADJUSTMENT',
  'STOCKTAKE',
] as const;

const NON_TRADING_SALE_STATUSES = ['RETURNED', 'VOID'] as const;

export type StockGapIssueFilter = 'UNUSED_CATALOGUE' | 'STOCK_SETUP_GAP';

function confirmedQuantityHistoryNone(
  businessId: string
): Pick<Prisma.ProductWhereInput, 'purchaseLines' | 'stockMovements'> {
  return {
    purchaseLines: {
      none: {
        purchaseInvoice: { businessId },
      },
    },
    stockMovements: {
      none: {
        store: { businessId },
        OR: [
          { type: { in: [...CONFIRMED_QUANTITY_MOVEMENT_TYPES] } },
          { referenceType: { in: [...CONFIRMED_QUANTITY_REFERENCE_TYPES] } },
        ],
      },
    },
  };
}

function qualifyingSaleFilter(
  businessId: string
): Prisma.SalesInvoiceLineWhereInput {
  return {
    salesInvoice: {
      businessId,
      paymentStatus: { notIn: [...NON_TRADING_SALE_STATUSES] },
    },
  };
}

/** Active, priced, no InventoryBalance on any branch. */
export function stockGapBaseCandidateWhere(
  businessId: string
): Prisma.ProductWhereInput {
  return {
    businessId,
    active: true,
    sellingPriceBasePence: { gt: 0 },
    inventoryBalances: { none: {} },
  };
}

/**
 * UNUSED_CATALOGUE: aged past the grace window, never sold (non-void/return),
 * no confirmed quantity history, no balance row.
 */
export function unusedCatalogueProductWhere(
  businessId: string,
  now = new Date()
): Prisma.ProductWhereInput {
  const cutoff = catalogueCutoffDate(now);
  return {
    ...stockGapBaseCandidateWhere(businessId),
    ...confirmedQuantityHistoryNone(businessId),
    createdAt: { lt: cutoff },
    salesLines: { none: qualifyingSaleFilter(businessId) },
  };
}

/**
 * STOCK_SETUP_GAP (genuine-gap): no balance, no confirmed quantity history,
 * and either still inside the grace window or has qualifying sales.
 */
export function stockSetupGapProductWhere(
  businessId: string,
  now = new Date()
): Prisma.ProductWhereInput {
  const cutoff = catalogueCutoffDate(now);
  return {
    ...stockGapBaseCandidateWhere(businessId),
    ...confirmedQuantityHistoryNone(businessId),
    OR: [
      { createdAt: { gte: cutoff } },
      { salesLines: { some: qualifyingSaleFilter(businessId) } },
    ],
  };
}

/** Subset of genuine-gap that has at least one qualifying sale. */
export function soldWithoutConfirmedQtyProductWhere(
  businessId: string
): Prisma.ProductWhereInput {
  return {
    ...stockGapBaseCandidateWhere(businessId),
    ...confirmedQuantityHistoryNone(businessId),
    salesLines: { some: qualifyingSaleFilter(businessId) },
  };
}

export function stockGapIssueProductWhere(
  businessId: string,
  issue: StockGapIssueFilter,
  now = new Date()
): Prisma.ProductWhereInput {
  return issue === 'UNUSED_CATALOGUE'
    ? unusedCatalogueProductWhere(businessId, now)
    : stockSetupGapProductWhere(businessId, now);
}
