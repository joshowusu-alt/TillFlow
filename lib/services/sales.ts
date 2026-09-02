import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { ACCOUNT_CODES, postJournalEntry } from '@/lib/accounting';
import { UserError } from '@/lib/action-utils';
import {
  filterPositivePayments,
  splitPayments,
  debitCashBankLines,
  creditCashBankLines,
  derivePaymentStatus,
  type PaymentInput,
  type JournalLine
} from './shared';
import {
  buildQtyByProductMap,
  decrementInventoryBalance,
  batchDecrementInventoryBalance,
  upsertInventoryBalance,
  fetchInventoryMap,
  resolveAvgCost,
  resolveEffectiveSellingPricePence,
  resolveProductUnitBaseValuePence,
} from './shared';
import { getOpenShiftForTill, recordCashDrawerEntryTx } from './cash-drawer';
import { detectExcessiveDiscountRisk, detectNegativeMarginRisk } from './risk-monitor';
import { clampLoyaltyRedemption, computePointsEarned } from '@/lib/loyalty';
import { isDiscountReasonCode } from '@/lib/fraud/reason-codes';
import { resolveBranchIdForStore } from './branches';
import { measureServerOperation, PERFORMANCE_THRESHOLDS_MS, appLog } from '@/lib/observability';
import { isSqliteDatabaseUrl } from '@/lib/database-runtime';
import { RECEIPT_ORIGIN } from '@/lib/payments/receipt-origin';
import { unstable_cache } from 'next/cache';
import { checkoutContextTag } from '@/lib/cache/pos-tags';

// Account codes fetched on every checkout — extracted to module level so the
// unstable_cache key is stable across calls.
const CHECKOUT_ACCOUNT_CODES = [
  ACCOUNT_CODES.cash,
  ACCOUNT_CODES.bank,
  ACCOUNT_CODES.ar,
  ACCOUNT_CODES.sales,
  ACCOUNT_CODES.vatPayable,
  ACCOUNT_CODES.cogs,
  ACCOUNT_CODES.inventory,
] as const;

// ── Checkout context caches ────────────────────────────────────────────────
// These three reads are pre-transaction and contain data that rarely changes
// (business settings, store existence, chart of accounts). Caching them
// eliminates 2–3 serialised Neon RTTs per checkout (~300–450 ms at iad1).
//
// Tag: checkoutContextTag(businessId) — invalidated by app/actions/settings.ts
// whenever that business's settings change, and by refreshCurrentView.
//
// NOT cached: till (active-flag safety gate), branchId (active-flag risk),
// openShift (changes on shift open/close), inventoryMap (changes every sale),
// productUnits (cart-dependent), momoResult, customerResult (per-checkout).

function getCachedBusiness(businessId: string) {
  return unstable_cache(
    () => prisma.business.findUnique({ where: { id: businessId } }),
    ['checkout-context-business', businessId],
    { revalidate: 60, tags: [checkoutContextTag(businessId)] },
  )();
}

function getCachedStore(storeId: string, businessId: string) {
  return unstable_cache(
    () =>
      prisma.store.findFirst({
        where: { id: storeId, businessId },
        select: { id: true },
      }),
    ['checkout-context-store', businessId, storeId],
    { revalidate: 300, tags: [checkoutContextTag(businessId)] },
  )();
}

function getCachedCheckoutAccounts(businessId: string) {
  return unstable_cache(
    () =>
      prisma.account.findMany({
        where: { businessId, code: { in: [...CHECKOUT_ACCOUNT_CODES] } },
      }),
    ['checkout-context-accounts', businessId],
    { revalidate: 300, tags: [checkoutContextTag(businessId)] },
  )();
}

function computeDiscount(
  subtotal: number,
  type?: DiscountType,
  value?: number
): number {
  if (!subtotal || !type || type === 'NONE') return 0;
  if (type === 'PERCENT') {
    const pct = Math.min(Math.max(value ?? 0, 0), 100);
    return Math.round((subtotal * pct) / 100);
  }
  if (type === 'AMOUNT') {
    const amount = Math.max(value ?? 0, 0);
    return Math.min(amount, subtotal);
  }
  return 0;
}

function buildLinePricing(
  lines: SaleLineInput[],
  unitMap: Map<string, { product: SaleCostProduct; conversionToBase: number; productId: string; unitId: string; [key: string]: any }>,
  vatEnabled: boolean
) {
  return lines.map((line) => {
    if (line.qtyInUnit <= 0) {
      throw new Error('Quantity must be at least 1');
    }
    const productUnit = unitMap.get(`${line.productId}:${line.unitId}`);
    if (!productUnit) {
      throw new Error('Unit not configured for product');
    }
    const qtyBase =
      typeof line.qtyBase === 'number' && line.qtyBase > 0
        ? Math.round(line.qtyBase)
        : line.qtyInUnit * productUnit.conversionToBase;
    const lineSubtotal =
      typeof line.lineSubtotalPence === 'number' && line.lineSubtotalPence > 0
        ? Math.round(line.lineSubtotalPence)
        : null;
    const unitPricePence =
      lineSubtotal !== null
        ? Math.max(1, Math.round(lineSubtotal / Math.max(line.qtyInUnit, 1)))
        : typeof line.unitPricePence === 'number' && Number.isFinite(line.unitPricePence) && line.unitPricePence > 0
          ? Math.round(line.unitPricePence)
          : resolveEffectiveSellingPricePence(productUnit.product, productUnit);
    const resolvedLineSubtotal = lineSubtotal ?? unitPricePence * line.qtyInUnit;
    const lineDiscount = computeDiscount(resolvedLineSubtotal, line.discountType, line.discountValue);
    const promoBuyQty = productUnit.product.promoBuyQty ?? 0;
    const promoGetQty = productUnit.product.promoGetQty ?? 0;
    const promoGroup = promoBuyQty + promoGetQty;
    const promoFreeUnits =
      promoBuyQty > 0 && promoGetQty > 0 && promoGroup > 0
        ? Math.floor(qtyBase / promoGroup) * promoGetQty
        : 0;
    const promoDiscount = Math.min(
      resolveProductUnitBaseValuePence(unitPricePence, productUnit, promoFreeUnits),
      Math.max(resolvedLineSubtotal - lineDiscount, 0)
    );
    const lineNetSubtotal = Math.max(resolvedLineSubtotal - lineDiscount - promoDiscount, 0);
    const vatRate = vatEnabled ? productUnit.product.vatRateBps : 0;
    const lineVat = vatEnabled ? Math.round((lineNetSubtotal * vatRate) / 10000) : 0;
    const lineTotal = lineNetSubtotal + lineVat;
    return {
      ...line,
      productUnit,
      qtyBase,
      unitPricePence,
      lineSubtotal: resolvedLineSubtotal,
      lineDiscount,
      promoDiscount,
      lineNetSubtotal,
      lineVat,
      lineTotal,
      conversionToBase: productUnit.conversionToBase,
    };
  });
}

function parseInvoiceSequenceValue(transactionNumber: string | null | undefined): number | null {
  if (!transactionNumber) return null;
  const match = transactionNumber.match(/^INV-(\d+)$/);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function hasPrismaErrorCode(error: unknown, code: string): boolean {
  return (
    !!error &&
    typeof error === 'object' &&
    'code' in error &&
    (error as { code?: unknown }).code === code
  );
}

function isPrismaUniqueConstraintOn(error: unknown, fields: string[]): boolean {
  if (!hasPrismaErrorCode(error, 'P2002')) {
    return false;
  }

  const target = (error as { meta?: { target?: unknown } }).meta?.target;
  if (Array.isArray(target)) {
    const targetFields = target.map((item) => String(item));
    return fields.every((field) => targetFields.includes(field));
  }

  if (typeof target === 'string') {
    return fields.every((field) => target.includes(field));
  }

  return false;
}

async function reserveNextInvoiceNumber(
  tx: Prisma.TransactionClient,
  businessId: string
): Promise<number> {
  const sequenceWhere = {
    businessId_sequenceName: {
      businessId,
      sequenceName: 'invoice',
    },
  };

  try {
    const updatedSequence = await tx.businessSequence.update({
      where: sequenceWhere,
      data: { nextVal: { increment: 1 } },
      select: { nextVal: true },
    });
    return updatedSequence.nextVal;
  } catch (error) {
    if (!hasPrismaErrorCode(error, 'P2025')) {
      throw error;
    }
  }

  const latestInvoice = await tx.salesInvoice.findFirst({
    where: {
      businessId,
      transactionNumber: { startsWith: 'INV-' },
    },
    orderBy: { transactionNumber: 'desc' },
    select: { transactionNumber: true },
  });
  const initialNextVal =
    (parseInvoiceSequenceValue(latestInvoice?.transactionNumber) ?? 0) + 1;

  try {
    const createdSequence = await tx.businessSequence.create({
      data: {
        businessId,
        sequenceName: 'invoice',
        nextVal: initialNextVal,
      },
      select: { nextVal: true },
    });
    return createdSequence.nextVal;
  } catch (error) {
    if (!isPrismaUniqueConstraintOn(error, ['businessId', 'sequenceName'])) {
      throw error;
    }

    const updatedSequence = await tx.businessSequence.update({
      where: sequenceWhere,
      data: { nextVal: { increment: 1 } },
      select: { nextVal: true },
    });
    return updatedSequence.nextVal;
  }
}

type SaleCostProduct = {
  sellingPriceBasePence: number;
  promoBuyQty: number | null;
  promoGetQty: number | null;
  vatRateBps: number;
  defaultCostBasePence: number;
  name: string;
  productUnits?: Array<{
    isBaseUnit: boolean;
    conversionToBase: number;
    defaultCostPence?: number | null;
  }>;
};

/**
 * COGS / unit-cost resolver for a sale line. Trusts the inventory balance's
 * recorded WAC; falls back to the product's `defaultCostBasePence` only when
 * the balance has no positive WAC.
 *
 * Note: a previous version of this function included a "package cost stored as
 * base" heuristic that automatically rewrote any WAC matching a package-level
 * cost (e.g. case-of-24 cost) back to `defaultCostBasePence`. That heuristic
 * silently corrupted legitimate WAC values whenever a real purchase landed at
 * exactly the package price. The heuristic was removed; the manual repair tool
 * (`repairInventoryAverageCostDrift`) remains available for genuine cleanups.
 */
function resolveSaleUnitCostBasePence(
  inventoryMap: Map<string, { qtyOnHandBase: number; avgCostBasePence: number }>,
  productId: string,
  product: SaleCostProduct,
) {
  return resolveAvgCost(inventoryMap, productId, product.defaultCostBasePence);
}

export type SalePaymentInput = PaymentInput;
export type SaleSource = 'POS' | 'ONLINE_ORDER' | 'LATE_OFFLINE' | 'UNRECONCILED_LEGACY';

export type DiscountType = 'NONE' | 'PERCENT' | 'AMOUNT';

export type SaleLineInput = {
  productId: string;
  unitId: string;
  qtyInUnit: number;
  unitPricePence?: number;
  /** When set, used for stock movements instead of qtyInUnit × conversion. */
  qtyBase?: number;
  /** Fixed line subtotal (weighed items). */
  lineSubtotalPence?: number;
  discountType?: DiscountType;
  discountValue?: number;
};

export type CreateSaleInput = {
  businessId: string;
  storeId: string;
  tillId: string;
  cashierUserId: string;
  customerId?: string | null;
  paymentStatus: 'PAID' | 'PART_PAID' | 'UNPAID';
  dueDate?: Date | null;
  payments: SalePaymentInput[];
  orderDiscountType?: DiscountType;
  orderDiscountValue?: number;
  discountOverrideReasonCode?: string | null;
  discountOverrideReason?: string | null;
  discountApprovedByUserId?: string | null;
  momoCollectionId?: string | null;
  externalRef?: string | null;
  createdAt?: Date | null;
  inventoryPolicy?: 'enforce' | 'allow-negative';
  skipInventoryMovements?: boolean;
  /**
   * Allowed only for `lib/services/online-order-commit.ts`. Operational POS
   * sales always require an OPEN shift; this flag is ignored as a way to
   * persist `shiftId = null` from POS or offline sync.
   */
  bypassOpenTillRequirement?: boolean;
  /** Auditable origin. Default POS for new operational sales. */
  saleSource?: SaleSource;
  /**
   * Agent B hook: immutable shift captured when the sale was queued offline.
   * LATE_OFFLINE may attach this original shift even after it has closed.
   * Do not invent a later open shift when this is set.
   */
  capturedShiftId?: string | null;
  /** Points to redeem at checkout (requires customerId). */
  loyaltyPointsToRedeem?: number;
  /** Actual cash tendered (may exceed applied cash when change is due). */
  cashReceivedPence?: number | null;
  /** Calculated change for cash tender; never treated as sales revenue. */
  changeDuePence?: number | null;
  lines: SaleLineInput[];
};

export const IDEMPOTENT_SALE_CONTEXT_MISMATCH_MSG =
  'This sale was already recorded on a different till or shift. Start a new checkout.';

/** Same externalRef may replay only onto the original store, till, and captured shift. */
export function idempotentCheckoutMatchesExisting(
  existing: { storeId: string; tillId: string; shiftId?: string | null },
  input: { storeId: string; tillId: string; capturedShiftId?: string | null },
): boolean {
  if (existing.storeId !== input.storeId) return false;
  if (existing.tillId !== input.tillId) return false;
  const captured = input.capturedShiftId?.trim() || null;
  if (captured && (existing.shiftId ?? null) !== captured) return false;
  return true;
}

type LockedCapturedShift = {
  id: string;
  status: string;
  openKey: string | null;
};

/**
 * Lock the immutable captured offline shift inside the sale transaction.
 * Postgres: SELECT … FOR UPDATE on the tenant-scoped row.
 * SQLite: findFirst on the same tx (serialized writers).
 */
async function lockCapturedShiftForOfflineSale(
  tx: Prisma.TransactionClient,
  input: {
    capturedShiftId: string;
    tillId: string;
    storeId: string;
    businessId: string;
  },
): Promise<LockedCapturedShift | null> {
  if (!isSqliteDatabaseUrl(process.env.DATABASE_URL)) {
    const rows = await tx.$queryRaw<LockedCapturedShift[]>`
      SELECT sh."id", sh."status", sh."openKey"
      FROM "Shift" AS sh
      JOIN "Till" AS t ON t."id" = sh."tillId"
      JOIN "Store" AS st ON st."id" = t."storeId"
      WHERE sh."id" = ${input.capturedShiftId}
        AND sh."tillId" = ${input.tillId}
        AND st."id" = ${input.storeId}
        AND st."businessId" = ${input.businessId}
      FOR UPDATE
    `;
    return rows[0] ?? null;
  }

  return tx.shift.findFirst({
    where: {
      id: input.capturedShiftId,
      tillId: input.tillId,
      till: {
        storeId: input.storeId,
        store: { businessId: input.businessId },
      },
    },
    select: { id: true, status: true, openKey: true },
  });
}

const CHECKOUT_STAGE_THRESHOLDS_MS = {
  validate: 200,
  context: 300,
  cartPricing: 300,
  creditCustomer: 300,
  sequence: 200,
  transactionTotal: 750,
  invoiceCreate: 300,
  inventoryUpdate: 300,
  journalPost: 300,
  shiftUpdate: 300,
  stockMovements: 300,
} as const;

function checkoutPerformanceMetadata(
  input: CreateSaleInput,
  extra: Record<string, unknown> = {},
) {
  const positivePaymentMethods = new Set(
    input.payments
      .filter((payment) => payment.amountPence > 0)
      .map((payment) => payment.method),
  );
  const hasLineDiscount = input.lines.some(
    (line) => (line.discountType && line.discountType !== 'NONE') || (line.discountValue ?? 0) > 0,
  );

  return {
    businessId: input.businessId,
    storeId: input.storeId,
    action: 'completeSaleAction',
    cartLineCount: input.lines.length,
    distinctProductCount: new Set(input.lines.map((line) => line.productId)).size,
    paymentMethodCount: positivePaymentMethods.size,
    hasCredit: input.paymentStatus !== 'PAID',
    hasCustomerId: Boolean(input.customerId),
    hasCashPayment: positivePaymentMethods.has('CASH'),
    hasCardPayment: positivePaymentMethods.has('CARD'),
    hasBankTransferPayment: positivePaymentMethods.has('TRANSFER'),
    hasMobileMoneyPayment: positivePaymentMethods.has('MOBILE_MONEY'),
    hasDiscount:
      hasLineDiscount ||
      Boolean(input.orderDiscountType && input.orderDiscountType !== 'NONE') ||
      (input.orderDiscountValue ?? 0) > 0 ||
      (input.loyaltyPointsToRedeem ?? 0) > 0,
    isOfflineSubmission: Boolean(input.externalRef),
    duplicateCheckPerformed: Boolean(input.externalRef),
    cacheState: 'write-through',
    ...extra,
  };
}

function measureCheckoutStage<T>(
  operation: string,
  input: CreateSaleInput,
  callback: () => Promise<T>,
  metadata: Record<string, unknown>,
  thresholdMs: number,
) {
  return measureServerOperation(
    operation,
    callback,
    checkoutPerformanceMetadata(input, metadata),
    { thresholdMs, operationType: 'action' },
  );
}

export async function createSale(input: CreateSaleInput) {
  return measureServerOperation(
    'action.checkout.create-sale',
    () => createSaleImpl(input),
    checkoutPerformanceMetadata(input, { rowCount: input.lines.length }),
    { thresholdMs: PERFORMANCE_THRESHOLDS_MS.action, operationType: 'action' },
  );
}

async function createSaleImpl(input: CreateSaleInput) {
  await measureCheckoutStage(
    'action.checkout.validate',
    input,
    async () => {
      if (!input.lines.length) {
        throw new UserError('No items in cart');
      }

      if ((input.loyaltyPointsToRedeem ?? 0) > 0 && !input.customerId) {
        throw new UserError('Select a customer to redeem loyalty points.');
      }
    },
    { stage: 'validate', rowCount: input.lines.length },
    CHECKOUT_STAGE_THRESHOLDS_MS.validate,
  );

  // Idempotent retry: return the original committed invoice for the same externalRef.
  if (input.externalRef) {
    const existingByRef = await prisma.salesInvoice.findFirst({
      where: {
        businessId: input.businessId,
        externalRef: input.externalRef,
      },
    });
    if (existingByRef) {
      if (!idempotentCheckoutMatchesExisting(existingByRef, input)) {
        throw new UserError(IDEMPOTENT_SALE_CONTEXT_MISMATCH_MSG);
      }
      return existingByRef;
    }
  }

  // Pre-compute values available from input (no DB dependency)
  const capturedShiftId = input.capturedShiftId?.trim() || null;
  const productIds = [...new Set(input.lines.map((l) => l.productId))];
  const hasMomoPayment = input.payments.some(
    (p) => p.method === 'MOBILE_MONEY' && p.amountPence > 0
  );
  const momoLookup =
    hasMomoPayment && input.momoCollectionId
      ? prisma.mobileMoneyCollection.findFirst({
          where: {
            id: input.momoCollectionId,
            businessId: input.businessId,
            storeId: input.storeId,
            status: 'CONFIRMED',
          },
          select: {
            id: true,
            salesInvoiceId: true,
            amountPence: true,
            providerReference: true,
            providerTransactionId: true,
            network: true,
            payerMsisdn: true,
            provider: true,
          },
        })
      : Promise.resolve(null);
  const customerLookup = input.customerId
    ? prisma.customer.findFirst({
        where: { id: input.customerId, businessId: input.businessId },
        select: {
          id: true,
          storeId: true,
          creditLimitPence: true,
          loyaltyPointsBalance: true,
        },
      })
    : Promise.resolve(null);

  // ── SINGLE BATCH: fire ALL lookups in parallel (was 5 sequential batches) ──
  const [
    business, store, productUnits, till, cashier, branchId, openShift,
    accounts, inventoryMap, momoResult, customerResult,
  ] = await measureCheckoutStage(
    'action.checkout.context',
    input,
    async () => Promise.all([
      getCachedBusiness(input.businessId),
      getCachedStore(input.storeId, input.businessId),
      prisma.productUnit.findMany({
        where: {
          product: { businessId: input.businessId },
          OR: input.lines.map((line) => ({
            productId: line.productId,
            unitId: line.unitId,
          })),
        },
        include: {
          product: {
            include: {
              productUnits: {
                select: {
                  isBaseUnit: true,
                  conversionToBase: true,
                  defaultCostPence: true,
                },
              },
            },
          },
          unit: true,
        },
      }),
      prisma.till.findFirst({
        where: { id: input.tillId },
        select: {
          id: true,
          active: true,
          storeId: true,
          store: { select: { businessId: true } },
        },
      }),
      prisma.user.findFirst({
        where: {
          id: input.cashierUserId,
          businessId: input.businessId,
          ...(capturedShiftId || input.saleSource === 'LATE_OFFLINE' ? {} : { active: true }),
        },
        select: { id: true },
      }),
      resolveBranchIdForStore({ businessId: input.businessId, storeId: input.storeId }),
      getOpenShiftForTill(input.businessId, input.tillId),
      getCachedCheckoutAccounts(input.businessId),
      fetchInventoryMap(input.storeId, productIds),
      momoLookup,
      customerLookup,
    ]),
    { stage: 'context', rowCount: input.lines.length },
    CHECKOUT_STAGE_THRESHOLDS_MS.context,
  );

  if (!business) throw new Error('Business not found');
  if (!store) throw new Error('Store not found');
  if (!till) throw new UserError('Till not found');
  if (till.store.businessId !== input.businessId) {
    throw new UserError('Till does not belong to this business.');
  }
  if (till.storeId !== input.storeId) {
    throw new UserError('Till does not belong to this store.');
  }
  if (!till.active) {
    throw new UserError('Till is inactive.');
  }
  if (!cashier) throw new UserError('Cashier is not authorised for this business.');
  // Offline path: do not decide LATE_OFFLINE vs live money from this pre-tx
  // getOpenShiftForTill read — that happens under the captured-shift lock.
  if (!openShift && !input.bypassOpenTillRequirement && !capturedShiftId) {
    throw new UserError('Open till is required before recording sales.');
  }
  if (input.bypassOpenTillRequirement && input.saleSource && input.saleSource !== 'ONLINE_ORDER') {
    throw new Error('Open-till bypass is restricted to online-order commits.');
  }
  if (input.customerId) {
    if (!customerResult) throw new Error('Customer not found');
    if (
      (business as any).customerScope === 'BRANCH' &&
      customerResult.storeId !== input.storeId
    ) {
      throw new Error('Customer not found');
    }
  }
  const accountMap = new Map(
    accounts.map((acc: { code: string; id: string }) => [acc.code, acc.id])
  );

  const unitMap = new Map(productUnits.map((pu) => [`${pu.productId}:${pu.unitId}`, pu]));

  const lineDetails = await measureCheckoutStage(
    'action.checkout.cart-pricing',
    input,
    async () => buildLinePricing(input.lines, unitMap, business.vatEnabled),
    { stage: 'cart-pricing', rowCount: input.lines.length },
    CHECKOUT_STAGE_THRESHOLDS_MS.cartPricing,
  );

  const qtyByProduct = buildQtyByProductMap(lineDetails);
  const enforceInventory = (input.inventoryPolicy ?? 'enforce') === 'enforce';
  const shouldApplyInventoryMovements = !input.skipInventoryMovements;

  if (enforceInventory && shouldApplyInventoryMovements) {
    for (const [productId, qtyBase] of qtyByProduct.entries()) {
      const onHand = inventoryMap.get(productId)?.qtyOnHandBase ?? 0;
      if (onHand < qtyBase) {
        throw new UserError('Insufficient on hand');
      }
    }
  }

  const costByProduct = new Map<string, number>();
  for (const line of lineDetails) {
    if (costByProduct.has(line.productId)) continue;
    costByProduct.set(
      line.productId,
      resolveSaleUnitCostBasePence(inventoryMap, line.productId, line.productUnit.product)
    );
  }

  const lineNetSubtotalTotal = lineDetails.reduce((sum, line) => sum + line.lineNetSubtotal, 0);
  const lineVatTotal = lineDetails.reduce((sum, line) => sum + line.lineVat, 0);
  const manualOrderDiscount = computeDiscount(
    lineNetSubtotalTotal,
    input.orderDiscountType,
    input.orderDiscountValue
  );
  const netAfterManualDiscount = Math.max(lineNetSubtotalTotal - manualOrderDiscount, 0);

  const businessLoyalty = business as {
    loyaltyEnabled?: boolean;
    loyaltyPointsPerGhsPence?: number;
    loyaltyGhsPerHundredPoints?: number;
  };
  let loyaltyPointsRedeemed = 0;
  let loyaltyPointsValuePence = 0;
  if (
    input.customerId &&
    customerResult &&
    businessLoyalty.loyaltyEnabled &&
    (input.loyaltyPointsToRedeem ?? 0) > 0
  ) {
    const redemption = clampLoyaltyRedemption({
      pointsToRedeem: input.loyaltyPointsToRedeem ?? 0,
      balance: (customerResult as { loyaltyPointsBalance?: number }).loyaltyPointsBalance ?? 0,
      netSubtotalPence: netAfterManualDiscount,
      settings: {
        loyaltyEnabled: true,
        loyaltyPointsPerGhsPence: businessLoyalty.loyaltyPointsPerGhsPence ?? 1,
        loyaltyGhsPerHundredPoints: businessLoyalty.loyaltyGhsPerHundredPoints ?? 100,
      },
    });
    loyaltyPointsRedeemed = redemption.pointsRedeemed;
    loyaltyPointsValuePence = redemption.discountPence;
  }

  const orderDiscount = manualOrderDiscount + loyaltyPointsValuePence;
  const netAfterOrderDiscount = Math.max(lineNetSubtotalTotal - orderDiscount, 0);
  const vatRatio =
    business.vatEnabled && lineNetSubtotalTotal > 0
      ? netAfterOrderDiscount / lineNetSubtotalTotal
      : 1;
  const vatTotal = business.vatEnabled ? Math.round(lineVatTotal * vatRatio) : 0;
  const subtotal = netAfterOrderDiscount;
  const total = subtotal + vatTotal;
  const loyaltyPointsEarned =
    input.customerId && businessLoyalty.loyaltyEnabled
      ? computePointsEarned(total, businessLoyalty.loyaltyPointsPerGhsPence ?? 1)
      : 0;
  const grossSalesPence = lineDetails.reduce((sum, line) => sum + line.lineSubtotal, 0);
  const totalLineDiscountPence = lineDetails.reduce(
    (sum, line) => sum + line.lineDiscount + line.promoDiscount,
    0
  );
  const totalDiscountPence = totalLineDiscountPence + orderDiscount;
  const discountBps =
    grossSalesPence > 0 ? Math.round((totalDiscountPence * 10_000) / grossSalesPence) : 0;

  let discountApprovedByUserId = input.discountApprovedByUserId ?? null;
  if (input.discountOverrideReasonCode && !isDiscountReasonCode(input.discountOverrideReasonCode)) {
    throw new Error('Discount reason code is invalid.');
  }
  if (discountBps > business.discountApprovalThresholdBps) {
    if (!discountApprovedByUserId) {
      throw new UserError('Manager discount PIN approval is required for this discount.');
    }
    if (!input.discountOverrideReasonCode && !input.discountOverrideReason) {
      throw new Error('Discount reason is required for override approval.');
    }

    const approvedBy = await prisma.user.findFirst({
      where: {
        id: discountApprovedByUserId,
        businessId: input.businessId,
        active: true,
        role: { in: ['MANAGER', 'OWNER'] },
      },
      select: { id: true },
    });
    if (!approvedBy) {
      throw new Error('Discount override approval user is invalid.');
    }
    discountApprovedByUserId = approvedBy.id;
  } else {
    discountApprovedByUserId = null;
  }

  const positivePayments = filterPositivePayments(input.payments);
  const fallbackPayments =
    positivePayments.length === 0 && input.paymentStatus === 'PAID'
      ? [{ method: 'CASH' as const, amountPence: total }]
      : positivePayments;

  const split = splitPayments(fallbackPayments);
  let { cashPence } = split;
  const { bankPence } = split;

  let totalPaid = cashPence + bankPence;
  if (totalPaid > total) {
    const overpaid = totalPaid - total;
    if (cashPence < overpaid) {
      throw new Error('Payment exceeds total due');
    }
    cashPence -= overpaid;
    totalPaid -= overpaid;
  }

  const balanceDue = Math.max(total - totalPaid, 0);
  const payments: SalePaymentInput[] = [
    ...(cashPence > 0 ? [{ method: 'CASH' as const, amountPence: cashPence }] : []),
    ...fallbackPayments
      .filter((p) => p.method !== 'CASH' && p.amountPence > 0)
      .map((p) => ({ ...p })),
  ];
  const cardPence = payments
    .filter((payment) => payment.method === 'CARD')
    .reduce((sum, payment) => sum + payment.amountPence, 0);
  const transferPence = payments
    .filter((payment) => payment.method === 'TRANSFER')
    .reduce((sum, payment) => sum + payment.amountPence, 0);
  const liveMomoPence = payments
    .filter((payment) => payment.method === 'MOBILE_MONEY')
    .reduce((sum, payment) => sum + payment.amountPence, 0);

  let confirmedMomoCollection:
    | {
        id: string;
        salesInvoiceId: string | null;
        amountPence: number;
        providerReference: string | null;
        providerTransactionId: string | null;
        network: string;
        payerMsisdn: string;
        provider: string;
      }
    | null = null;

  const momoPaidPence = payments
    .filter((payment) => payment.method === 'MOBILE_MONEY')
    .reduce((sum, payment) => sum + payment.amountPence, 0);

  const cogsEstimate = lineDetails.reduce((sum, line) => {
    const cost = costByProduct.get(line.productId) ?? line.productUnit.product.defaultCostBasePence;
    return sum + cost * line.qtyBase;
  }, 0);
  const grossMarginEstimate = subtotal - cogsEstimate;

  const finalStatus =
    balanceDue === 0 ? 'PAID' : totalPaid === 0 ? 'UNPAID' : 'PART_PAID';

  // Keep UI intent aligned with tender so stale hidden fields cannot rewrite status.
  if (input.paymentStatus === 'UNPAID' && totalPaid > 0) {
    throw new UserError('Unpaid sales cannot include payments. Clear payment amounts or choose Part Paid.');
  }
  if (input.paymentStatus === 'PART_PAID' && (totalPaid <= 0 || balanceDue <= 0)) {
    throw new UserError('Part-paid sales require a payment greater than zero and below the total.');
  }
  if (input.paymentStatus === 'PAID' && finalStatus !== 'PAID') {
    throw new UserError('Full payment is required for paid sales.');
  }

  if (finalStatus !== 'PAID' && !input.customerId) {
    throw new UserError('Customer is required for credit or part-paid sales');
  }

  const cashReceivedPence = Math.max(0, Math.round(input.cashReceivedPence ?? cashPence));
  const changeDuePence = Math.max(
    0,
    Math.round(input.changeDuePence ?? Math.max(cashReceivedPence - cashPence, 0)),
  );

  // When a confirmed MoMo collection exists, attach it; otherwise treat
  // MoMo as a manually-recorded payment (staff verify the receipt visually
  // and end-of-day reconciliation catches discrepancies).
  if (momoPaidPence > 0 && input.momoCollectionId) {
    // A collection ID was provided — it MUST be confirmed before the sale can proceed.
    if (!momoResult) {
      throw new Error('MoMo collection is not confirmed yet.');
    }
    confirmedMomoCollection = momoResult;
    if (confirmedMomoCollection.salesInvoiceId) {
      throw new Error('MoMo collection has already been applied to another sale.');
    }
    if (confirmedMomoCollection.amountPence !== momoPaidPence) {
      throw new Error('MoMo amount does not match the confirmed collection.');
    }

    for (const payment of payments) {
      if (payment.method !== 'MOBILE_MONEY') continue;
      payment.reference =
        confirmedMomoCollection.providerTransactionId ??
        confirmedMomoCollection.providerReference ??
        payment.reference ??
        null;
      payment.network = confirmedMomoCollection.network;
      payment.payerMsisdn = confirmedMomoCollection.payerMsisdn;
      payment.provider = confirmedMomoCollection.provider;
      payment.status = 'CONFIRMED';
      payment.collectionId = confirmedMomoCollection.id;
    }
  } else if (momoPaidPence > 0) {
    // No collection ID — manual MoMo (provider not yet connected).
    // Staff verify the customer's receipt visually; end-of-day reconciliation
    // catches any discrepancies.
    for (const payment of payments) {
      if (payment.method !== 'MOBILE_MONEY') continue;
      payment.status = payment.status ?? 'PENDING_MANUAL';
    }
  }

  let stockMovementInventoryMap = inventoryMap;
  let idempotentExternalRefReplay = false;

  const invoice = await measureCheckoutStage(
    'action.checkout.transaction.total',
    input,
    async () => prisma.$transaction(
      async (tx) => {
    // Credit limit enforcement: reject credit/part-paid sales that would exceed the customer's limit
    if (input.customerId && customerResult && customerResult.creditLimitPence > 0) {
      await measureCheckoutStage(
        'action.checkout.credit-customer',
        input,
        async () => {
          const openInvoices = await tx.salesInvoice.findMany({
            where: {
              customerId: input.customerId,
              businessId: input.businessId,
              paymentStatus: { in: ['UNPAID', 'PART_PAID'] },
            },
            select: {
              totalPence: true,
              payments: { select: { amountPence: true } },
            },
          });
          const outstanding = openInvoices.reduce((sum, invoice) => {
            const paid = invoice.payments.reduce((paidSum, payment) => paidSum + payment.amountPence, 0);
            return sum + Math.max(invoice.totalPence - paid, 0);
          }, 0);
          const newCreditExposure = outstanding + balanceDue;
          if (newCreditExposure > customerResult.creditLimitPence) {
            throw new UserError(
              `This sale would exceed the customer's credit limit.`
            );
          }
        },
        { stage: 'credit-customer' },
        CHECKOUT_STAGE_THRESHOLDS_MS.creditCustomer,
      );
    }

    let liveShiftForMoney: { id: string } | null = null;
    let attachedShiftId: string | null = null;
    let persistedSaleSource: SaleSource = input.bypassOpenTillRequirement
      ? 'ONLINE_ORDER'
      : (input.saleSource && input.saleSource !== 'LATE_OFFLINE' ? input.saleSource : 'POS');

    if (capturedShiftId) {
      const lockedCaptured = await lockCapturedShiftForOfflineSale(tx, {
        capturedShiftId,
        tillId: till.id,
        storeId: input.storeId,
        businessId: input.businessId,
      });
      if (!lockedCaptured) {
        throw new UserError('Captured offline shift does not match this sale context.');
      }
      attachedShiftId = lockedCaptured.id;
      const capturedIsLiveOpen =
        lockedCaptured.status === 'OPEN' && lockedCaptured.openKey === till.id;
      if (capturedIsLiveOpen) {
        // Ordinary sync: money stays on the captured shift, never a later OPEN.
        liveShiftForMoney = { id: lockedCaptured.id };
      } else {
        liveShiftForMoney = null;
        persistedSaleSource = 'LATE_OFFLINE';
      }
    } else {
      liveShiftForMoney = openShift;
      attachedShiftId = openShift?.id ?? null;
    }

    const invoiceCreateData = {
      businessId: input.businessId,
      storeId: store.id,
      branchId,
      tillId: till.id,
      shiftId: attachedShiftId,
      saleSource: persistedSaleSource,
      cashierUserId: input.cashierUserId,
      customerId: input.customerId || null,
      paymentStatus: finalStatus,
      dueDate: finalStatus === 'PAID' ? null : input.dueDate || null,
      subtotalPence: subtotal,
      vatPence: vatTotal,
      totalPence: total,
      discountPence: orderDiscount,
      loyaltyPointsRedeemed,
      loyaltyPointsValuePence,
      loyaltyPointsEarned,
      discountOverrideReasonCode: input.discountOverrideReasonCode ?? null,
      discountOverrideReason: input.discountOverrideReason ?? null,
      discountApprovedByUserId,
      grossMarginPence: grossMarginEstimate,
      cashReceivedPence: cashPence > 0 ? cashReceivedPence : 0,
      changeDuePence: cashPence > 0 ? changeDuePence : 0,
      externalRef: input.externalRef ?? null,
      createdAt: input.createdAt ?? undefined,
      lines: {
        create: lineDetails.map((line) => ({
          productId: line.productId,
          unitId: line.unitId,
          qtyInUnit: line.qtyInUnit,
          conversionToBase: line.productUnit.conversionToBase,
          qtyBase: line.qtyBase,
          unitPricePence: line.unitPricePence,
          lineDiscountPence: line.lineDiscount,
          promoDiscountPence: line.promoDiscount,
          lineSubtotalPence: line.lineSubtotal,
          lineVatPence: line.lineVat,
          lineTotalPence: line.lineTotal,
          lineCostPence: (costByProduct.get(line.productId) ?? line.productUnit.product.defaultCostBasePence) * line.qtyBase,
        }))
      },
      payments: {
        create: payments.map((payment) => ({
          method: payment.method,
          amountPence: payment.amountPence,
          branchId,
          // Prefer explicit payment refs. Offline sync stamps OFFLINE_SYNC refs on
          // each payment before createSale; do not overwrite online POS refs with the
          // invoice externalRef (POS_ONLINE:…) used only for idempotency.
          reference: payment.reference ?? null,
          network: payment.network ?? null,
          payerMsisdn: payment.payerMsisdn ?? null,
          provider: payment.provider ?? null,
          status: payment.status ?? 'CONFIRMED',
          collectionId: payment.collectionId ?? null,
          // Checkout / original sale workflow — including split-tender components
          // and part-paid deposits created with the invoice.
          receiptOrigin: RECEIPT_ORIGIN.RECEIVED_AT_SALE,
        }))
      }
    };

    let idempotentReplayInvoice: { id: string; externalRef?: string | null } | null = null;

    const created = await (async () => {
      for (let attempt = 0; attempt < 3; attempt++) {
        const sequenceValue = await measureCheckoutStage(
          'action.checkout.sequence',
          input,
          async () => reserveNextInvoiceNumber(tx, input.businessId),
          { stage: 'sequence' },
          CHECKOUT_STAGE_THRESHOLDS_MS.sequence,
        );
        const transactionNumber = `INV-${String(sequenceValue).padStart(6, '0')}`;

        try {
          return await measureCheckoutStage(
            'action.checkout.invoice-create',
            input,
            async () => tx.salesInvoice.create({
              data: {
                ...invoiceCreateData,
                transactionNumber,
              }
            }),
            { stage: 'invoice-create', rowCount: lineDetails.length },
            CHECKOUT_STAGE_THRESHOLDS_MS.invoiceCreate,
          );
        } catch (error) {
          // Concurrent retry with the same externalRef: the loser must return the
          // winner's invoice and MUST NOT re-apply stock, drawer, or journal effects.
          if (input.externalRef && isPrismaUniqueConstraintOn(error, ['businessId', 'externalRef'])) {
            const existingByRef = await tx.salesInvoice.findFirst({
              where: {
                businessId: input.businessId,
                externalRef: input.externalRef,
              },
            });
            if (existingByRef) {
              if (!idempotentCheckoutMatchesExisting(existingByRef, input)) {
                throw new UserError(IDEMPOTENT_SALE_CONTEXT_MISMATCH_MSG);
              }
              idempotentReplayInvoice = existingByRef;
              return existingByRef;
            }
          }
          if (!isPrismaUniqueConstraintOn(error, ['businessId', 'transactionNumber'])) {
            throw error;
          }
        }
      }

      throw new Error('Failed to allocate a unique invoice number for this sale.');
    })();

    if (idempotentReplayInvoice) {
      idempotentExternalRefReplay = true;
      return idempotentReplayInvoice;
    }

    if (liveShiftForMoney) {
      if (!isSqliteDatabaseUrl(process.env.DATABASE_URL)) {
        const locked = await tx.$queryRaw<{ id: string }[]>`
          SELECT sh."id"
          FROM "Shift" AS sh
          JOIN "Till" AS t ON t."id" = sh."tillId"
          JOIN "Store" AS st ON st."id" = t."storeId"
          WHERE sh."id" = ${liveShiftForMoney.id}
            AND sh."tillId" = ${till.id}
            AND sh."status" = ${'OPEN'}
            AND t."active" = TRUE
            AND st."id" = ${input.storeId}
            AND st."businessId" = ${input.businessId}
          FOR UPDATE
        `;
        if (locked.length === 0) {
          throw new UserError('The till shift closed during checkout. Reopen the till and try again.');
        }
      }

      const shiftUpdate = await tx.shift.updateMany({
        where: {
          id: liveShiftForMoney.id,
          tillId: till.id,
          status: 'OPEN',
          till: {
            active: true,
            storeId: input.storeId,
            store: { businessId: input.businessId },
          },
        },
        data: {
          cardTotalPence: { increment: cardPence },
          transferTotalPence: { increment: transferPence },
          momoTotalPence: { increment: liveMomoPence },
        },
      });
      if (shiftUpdate.count !== 1) {
        throw new UserError('The till shift closed during checkout. Reopen the till and try again.');
      }
    } else if (!input.bypassOpenTillRequirement && !capturedShiftId) {
      throw new UserError('Open till is required before recording sales.');
    }

    // Parallelise: MoMo, cash-drawer, inventory updates and stock movements
    const txPromises: Promise<any>[] = [];

    if (
      input.customerId &&
      businessLoyalty.loyaltyEnabled &&
      (loyaltyPointsEarned > 0 || loyaltyPointsRedeemed > 0)
    ) {
      txPromises.push(
        tx.customer.update({
          where: { id: input.customerId },
          data: {
            loyaltyPointsBalance: {
              increment: loyaltyPointsEarned - loyaltyPointsRedeemed,
            },
          } as any,
        })
      );
    }

    if (confirmedMomoCollection) {
      txPromises.push(
        tx.mobileMoneyCollection.update({
          where: { id: confirmedMomoCollection.id },
          data: { salesInvoiceId: created.id },
        }),
        tx.mobileMoneyStatusLog.create({
          data: {
            collectionId: confirmedMomoCollection.id,
            status: 'CONFIRMED',
            providerStatus: 'ATTACHED_TO_SALE',
            notes: `Attached to sale ${created.id}`,
          },
        }),
      );
    }

    if (cashPence > 0 && liveShiftForMoney) {
      txPromises.push(
        measureCheckoutStage(
          'action.checkout.shift-update',
          input,
          async () => {
            // Local SQLite cannot execute the Postgres CTE (UPDATE … UPDATE … FROM … NOW()).
            // Keep the production RTT consolidation on Postgres; use the typed drawer helper locally.
            if (isSqliteDatabaseUrl(process.env.DATABASE_URL)) {
              return recordCashDrawerEntryTx(tx, {
                businessId: input.businessId,
                storeId: input.storeId,
                tillId: till.id,
                shiftId: liveShiftForMoney.id,
                createdByUserId: input.cashierUserId,
                cashierUserId: input.cashierUserId,
                entryType: 'CASH_SALE',
                amountPence: cashPence,
                reasonCode: 'SALE',
                reason: 'Cash sale collected',
                referenceType: 'SALES_INVOICE',
                referenceId: created.id,
              });
            }

            const entryId = randomUUID();
            // Single CTE: atomically updates Shift.expectedCashPence and inserts
            // CashDrawerEntry in one DB round-trip. The RETURNING clause supplies
            // the accurate before/after values directly from the UPDATE, eliminating
            // the stale-snapshot race present in the previous two-call approach.
            const rows = await tx.$queryRaw<{ id: string }[]>`
              WITH shift_upd AS (
                UPDATE "Shift" AS sh
                SET "expectedCashPence" = sh."expectedCashPence" + ${cashPence}
                FROM "Till" AS t
                JOIN "Store" AS st ON st."id" = t."storeId"
                WHERE sh."id" = ${liveShiftForMoney.id}
                  AND sh."status" = ${'OPEN'}
                  AND sh."tillId" = ${till.id}
                  AND t."id" = sh."tillId"
                  AND t."active" = TRUE
                  AND st."id" = ${input.storeId}
                  AND st."businessId" = ${input.businessId}
                RETURNING
                  sh."expectedCashPence" - ${cashPence} AS "beforeCash",
                  sh."expectedCashPence"                AS "afterCash"
              ),
              drawer_ins AS (
                INSERT INTO "CashDrawerEntry" (
                  "id", "businessId", "storeId", "tillId", "shiftId",
                  "createdByUserId", "cashierUserId",
                  "entryType", "amountPence",
                  "reasonCode", "reason",
                  "referenceType", "referenceId",
                  "beforeExpectedCashPence", "afterExpectedCashPence",
                  "createdAt"
                )
                SELECT
                  ${entryId},
                  ${input.businessId},
                  ${input.storeId},
                  ${till.id},
                  ${liveShiftForMoney.id},
                  ${input.cashierUserId},
                  ${input.cashierUserId},
                  ${'CASH_SALE'},
                  ${cashPence},
                  ${'SALE'},
                  ${'Cash sale collected'},
                  ${'SALES_INVOICE'},
                  ${created.id},
                  su."beforeCash",
                  su."afterCash",
                  NOW()
                FROM shift_upd su
                RETURNING "id"
              )
              SELECT "id" FROM drawer_ins
            `;
            if (rows.length === 0) {
              throw new Error('Shift not found or already closed during checkout');
            }
            return rows[0];
          },
          { stage: 'shift-update', rowCount: 1, hasCashPayment: true },
          CHECKOUT_STAGE_THRESHOLDS_MS.shiftUpdate,
        ),
      );
    }

    if (enforceInventory && shouldApplyInventoryMovements) {
      // Single SQL UPDATE for all products — 1 RTT regardless of cart size
      txPromises.push(
        measureCheckoutStage(
          'action.checkout.inventory-update',
          input,
          async () => batchDecrementInventoryBalance(tx, input.storeId, qtyByProduct),
          { stage: 'inventory-update', rowCount: qtyByProduct.size },
          CHECKOUT_STAGE_THRESHOLDS_MS.inventoryUpdate,
        ),
      );
    } else if (!enforceInventory && shouldApplyInventoryMovements) {
      const inventoryMapInTx = await measureCheckoutStage(
        'action.checkout.inventory-update',
        input,
        async () => fetchInventoryMap(input.storeId, productIds, tx as any),
        { stage: 'inventory-update', rowCount: productIds.length },
        CHECKOUT_STAGE_THRESHOLDS_MS.inventoryUpdate,
      );
      stockMovementInventoryMap = inventoryMapInTx;

      for (const [productId, qtyBase] of qtyByProduct.entries()) {
        const sampleLine = lineDetails.find((line) => line.productId === productId);
        if (!sampleLine) continue;

        const onHand = inventoryMapInTx.get(productId)?.qtyOnHandBase ?? 0;
        const avgCost = resolveSaleUnitCostBasePence(
          inventoryMapInTx,
          productId,
          sampleLine.productUnit.product,
        );

        txPromises.push(
          upsertInventoryBalance(tx, input.storeId, productId, onHand - qtyBase, avgCost),
        );
      }
    }

    if (shouldApplyInventoryMovements) {
      txPromises.push(
        measureCheckoutStage(
          'action.checkout.stock-movements',
          input,
          async () => tx.stockMovement.createMany({
            data: lineDetails.map((line) => {
              const beforeQtyBase = stockMovementInventoryMap.get(line.productId)?.qtyOnHandBase ?? 0;
              return {
                storeId: input.storeId,
                productId: line.productId,
                qtyBase: -line.qtyBase,
                beforeQtyBase,
                afterQtyBase: beforeQtyBase - line.qtyBase,
                unitCostBasePence:
                  costByProduct.get(line.productId) ??
                  line.productUnit.product.defaultCostBasePence,
                type: 'SALE' as const,
                referenceType: 'SALES_INVOICE' as const,
                referenceId: created.id,
                userId: input.cashierUserId,
              };
            }),
          }),
          { stage: 'stock-movements', rowCount: lineDetails.length },
          CHECKOUT_STAGE_THRESHOLDS_MS.stockMovements,
        ),
      );
    }

    // Journal entry inside tx — accounting must be atomic with the sale
    const paymentSplit = splitPayments(payments);
    const arAmount = total - paymentSplit.totalPence;
    const journalLines: JournalLine[] = [
      ...debitCashBankLines(paymentSplit),
      arAmount > 0 ? { accountCode: ACCOUNT_CODES.ar, debitPence: arAmount } : null,
      { accountCode: ACCOUNT_CODES.sales, creditPence: subtotal },
      business.vatEnabled && vatTotal > 0
        ? { accountCode: ACCOUNT_CODES.vatPayable, creditPence: vatTotal }
        : null
    ].filter(Boolean) as JournalLine[];
    const cogsTotal = lineDetails.reduce((sum, line) => {
      const cost = costByProduct.get(line.productId) ?? line.productUnit.product.defaultCostBasePence;
      return sum + cost * line.qtyBase;
    }, 0);
    journalLines.push({ accountCode: ACCOUNT_CODES.cogs, debitPence: cogsTotal });
    journalLines.push({ accountCode: ACCOUNT_CODES.inventory, creditPence: cogsTotal });
    txPromises.push(
      measureCheckoutStage(
        'action.checkout.journal-post',
        input,
        async () => postJournalEntry({
          businessId: input.businessId,
          description: `Sale ${created.id}`,
          referenceType: 'SALES_INVOICE',
          referenceId: created.id,
          lines: journalLines,
          prismaClient: tx as any,
          accountMap,
        }),
        { stage: 'journal-post', rowCount: journalLines.length },
        CHECKOUT_STAGE_THRESHOLDS_MS.journalPost,
      ),
    );

    // Run inventory batch + journal entry in parallel
    await Promise.all(txPromises);

    return created;
      },
      { maxWait: 10000, timeout: 15000 },
    ),
    { stage: 'transaction-total', rowCount: input.lines.length },
    CHECKOUT_STAGE_THRESHOLDS_MS.transactionTotal,
  );

  // Fire-and-forget: risk detection is non-critical, don't block the sale
  if (!idempotentExternalRefReplay) {
    detectExcessiveDiscountRisk({
      businessId: input.businessId,
      storeId: input.storeId,
      cashierUserId: input.cashierUserId,
      salesInvoiceId: invoice.id,
      discountPence: totalDiscountPence,
      grossSalesPence,
      thresholdBps: business.discountApprovalThresholdBps,
    }).catch((error) => {
      appLog('warn', 'checkout_risk_detection_failed', {
        businessId: input.businessId,
        storeId: input.storeId,
        stage: 'excessive-discount',
      });
      void error;
    });

    detectNegativeMarginRisk({
      businessId: input.businessId,
      storeId: input.storeId,
      cashierUserId: input.cashierUserId,
      salesInvoiceId: invoice.id,
      grossMarginPence: grossMarginEstimate,
    }).catch((error) => {
      appLog('warn', 'checkout_risk_detection_failed', {
        businessId: input.businessId,
        storeId: input.storeId,
        stage: 'negative-margin',
      });
      void error;
    });
  }

  return invoice;
}

// ---------------------------------------------------------------------------
// Amend Sale
// ---------------------------------------------------------------------------

export type AmendSaleInput = {
  salesInvoiceId: string;
  businessId: string;
  userId: string;
  reason: string;
  /** Line IDs to keep — any line NOT in this array is removed. */
  keepLineIds: string[];
  /** New items to add to this sale */
  newLines?: SaleLineInput[];
  /** Refund method when new total < old total */
  refundMethod?: 'CASH' | 'CARD' | 'TRANSFER' | 'MOBILE_MONEY';
  /** Additional payment method when new total > old total */
  additionalPaymentMethod?: 'CASH' | 'CARD' | 'TRANSFER' | 'MOBILE_MONEY';
};

/**
 * Amend an existing sale by removing and/or adding line items. Handles:
 * - Removing selected lines from the invoice
 * - Adding new line items to the invoice
 * - Restoring inventory for removed items / deducting for added items
 * - Recalculating invoice totals  
 * - Posting corrective journal entries
 * - Creating refund or additional payment records if applicable
 *
 * Returns the before/after snapshot for audit logging.
 */
export async function amendSale(input: AmendSaleInput) {
  const invoice = await prisma.salesInvoice.findFirst({
    where: { id: input.salesInvoiceId, businessId: input.businessId },
    include: {
      business: true,
      store: true,
      lines: {
        include: {
          product: {
            include: {
              productUnits: {
                select: {
                  isBaseUnit: true,
                  conversionToBase: true,
                  defaultCostPence: true,
                },
              },
            },
          },
          unit: true,
        },
      },
      payments: true,
      salesReturn: true,
    },
  });

  if (!invoice) throw new Error('Sale not found');
  if (invoice.salesReturn) throw new Error('Cannot amend a returned or voided sale');
  if (['RETURNED', 'VOID'].includes(invoice.paymentStatus)) {
    throw new Error('Cannot amend a returned or voided sale');
  }

  // Validate keepLineIds — they must all belong to this invoice
  const invoiceLineIds = new Set(invoice.lines.map((l) => l.id));
  for (const id of input.keepLineIds) {
    if (!invoiceLineIds.has(id)) {
      throw new Error('Invalid line item reference');
    }
  }

  const keepSet = new Set(input.keepLineIds);
  const removedLines = invoice.lines.filter((l) => !keepSet.has(l.id));
  const keptLines = invoice.lines.filter((l) => keepSet.has(l.id));

  const hasNewLines = input.newLines && input.newLines.length > 0;

  if (removedLines.length === 0 && !hasNewLines) {
    throw new Error('No changes — select items to remove or add new items');
  }

  if (keptLines.length === 0 && !hasNewLines) {
    throw new Error('Cannot remove all items — use Return/Void instead');
  }

  // ── Resolve new line details (product units, pricing) ─────────
  let newLineDetails: ReturnType<typeof buildLinePricing> = [];

  if (hasNewLines) {
    const productUnits = await prisma.productUnit.findMany({
      where: {
        product: { businessId: input.businessId },
        OR: input.newLines!.map((line) => ({
          productId: line.productId,
          unitId: line.unitId,
        })),
      },
      include: {
        product: {
          include: {
            productUnits: {
              select: {
                isBaseUnit: true,
                conversionToBase: true,
                defaultCostPence: true,
              },
            },
          },
        },
        unit: true,
      },
    });

    const unitMap = new Map(
      productUnits.map((pu) => [`${pu.productId}:${pu.unitId}`, pu])
    );

    newLineDetails = buildLinePricing(input.newLines!, unitMap, invoice.business.vatEnabled);
  }

  // Snapshot before state
  const beforeSnapshot = {
    totalPence: invoice.totalPence,
    subtotalPence: invoice.subtotalPence,
    vatPence: invoice.vatPence,
    discountPence: invoice.discountPence,
    lineCount: invoice.lines.length,
    removedItems: removedLines.map((l) => ({
      productId: l.productId,
      productName: l.product.name,
      unitName: l.unit.name,
      qtyInUnit: l.qtyInUnit,
      qtyBase: l.qtyBase,
      unitPricePence: l.unitPricePence,
      lineTotalPence: l.lineTotalPence,
    })),
    addedItems: newLineDetails.map((l) => ({
      productId: l.productId,
      productName: l.productUnit.product.name,
      unitName: l.productUnit.unit?.name ?? l.unitId,
      qtyInUnit: l.qtyInUnit,
      qtyBase: l.qtyBase,
      unitPricePence: l.unitPricePence,
      lineVatPence: l.lineVat,
      lineTotalPence: l.lineTotal,
    })),
  };

  // Recalculate totals from kept lines + new lines
  const keptSubtotal = keptLines.reduce((sum, l) => sum + l.lineTotalPence - l.lineVatPence, 0);
  const keptVat = keptLines.reduce((sum, l) => sum + l.lineVatPence, 0);
  const addedSubtotal = newLineDetails.reduce((sum, l) => sum + l.lineNetSubtotal, 0);
  const addedVat = newLineDetails.reduce((sum, l) => sum + l.lineVat, 0);
  const newSubtotal = keptSubtotal + addedSubtotal;
  const newVat = keptVat + addedVat;
  const newTotal = newSubtotal + newVat;

  const oldTotalPaid = invoice.payments.reduce((sum, p) => sum + p.amountPence, 0);
  const refundAmount = Math.max(oldTotalPaid - newTotal, 0);
  const additionalPaymentNeeded = Math.max(newTotal - oldTotalPaid, 0);
  const refundMethod = input.refundMethod ?? 'CASH';
  const additionalPaymentMethod = input.additionalPaymentMethod ?? 'CASH';

  // Build qty maps for inventory changes
  const removedQtyByProduct = buildQtyByProductMap(removedLines);
  const addedQtyByProduct = hasNewLines ? buildQtyByProductMap(newLineDetails) : new Map<string, number>();

  // Gather all product IDs that need inventory lookups
  const allAffectedProductIds = new Set([
    ...removedQtyByProduct.keys(),
    ...addedQtyByProduct.keys(),
  ]);

  const effectivePaid = oldTotalPaid - refundAmount + additionalPaymentNeeded;
  const newPaymentStatus = derivePaymentStatus(newTotal, effectivePaid);

  const result = await prisma.$transaction(async (tx) => {
    // Re-read inventory inside transaction to prevent TOCTOU race
    const inventoryMap = await fetchInventoryMap(invoice.storeId, Array.from(allAffectedProductIds), tx);

    // Validate stock for newly added items
    for (const [productId, qtyBase] of addedQtyByProduct.entries()) {
      const onHand = inventoryMap.get(productId)?.qtyOnHandBase ?? 0;
      // Account for any stock being restored from removed lines of the same product
      const restoredQty = removedQtyByProduct.get(productId) ?? 0;
      if (onHand + restoredQty < qtyBase) {
        throw new Error('Insufficient stock on hand');
      }
    }

    // Build avg cost map for all affected items
    const avgCostMap = new Map<string, number>();
    for (const line of removedLines) {
      if (avgCostMap.has(line.productId)) continue;
      avgCostMap.set(
        line.productId,
        resolveSaleUnitCostBasePence(inventoryMap, line.productId, line.product)
      );
    }
    for (const line of newLineDetails) {
      if (avgCostMap.has(line.productId)) continue;
      avgCostMap.set(
        line.productId,
        resolveSaleUnitCostBasePence(inventoryMap, line.productId, line.productUnit.product)
      );
    }

    const txPromises: Promise<any>[] = [];

    // 1. Delete removed lines
    if (removedLines.length > 0) {
      txPromises.push(
        tx.salesInvoiceLine.deleteMany({
          where: {
            id: { in: removedLines.map((l) => l.id) },
            salesInvoiceId: invoice.id,
          },
        })
      );
    }

    // 2. Create new lines
    if (newLineDetails.length > 0) {
      txPromises.push(
        tx.salesInvoiceLine.createMany({
          data: newLineDetails.map((line) => ({
            salesInvoiceId: invoice.id,
            productId: line.productId,
            unitId: line.unitId,
            qtyInUnit: line.qtyInUnit,
            conversionToBase: line.conversionToBase,
            qtyBase: line.qtyBase,
            unitPricePence: line.unitPricePence,
            lineDiscountPence: line.lineDiscount,
            promoDiscountPence: line.promoDiscount,
            lineSubtotalPence: line.lineSubtotal,
            lineVatPence: line.lineVat,
            lineTotalPence: line.lineTotal,
            lineCostPence: (avgCostMap.get(line.productId) ?? line.productUnit.product.defaultCostBasePence) * line.qtyBase,
          })),
        })
      );
    }

    // 3. Update invoice totals and status
    txPromises.push(
      tx.salesInvoice.update({
        where: { id: invoice.id },
        data: {
          subtotalPence: newSubtotal,
          vatPence: newVat,
          totalPence: newTotal,
          discountPence: 0, // order-level discount is cleared on amend
          paymentStatus: newPaymentStatus,
        },
      })
    );

    // 4. Update inventory with net effect (handles products in both removed and added)
    for (const productId of allAffectedProductIds) {
      const onHand = inventoryMap.get(productId)?.qtyOnHandBase ?? 0;
      const restored = removedQtyByProduct.get(productId) ?? 0;
      const deducted = addedQtyByProduct.get(productId) ?? 0;
      const finalOnHand = onHand + restored - deducted;
      const avgCost = avgCostMap.get(productId) ?? 0;
      txPromises.push(upsertInventoryBalance(tx, invoice.storeId, productId, finalOnHand, avgCost));
    }

    // 5. Create stock movements for restored items
    if (removedLines.length > 0) {
      txPromises.push(
        tx.stockMovement.createMany({
          data: removedLines.map((line) => ({
            storeId: invoice.storeId,
            productId: line.productId,
            qtyBase: line.qtyBase, // positive = stock returned
            unitCostBasePence: avgCostMap.get(line.productId) ?? line.product.defaultCostBasePence,
            type: 'SALE_AMENDMENT',
            referenceType: 'SALES_INVOICE',
            referenceId: invoice.id,
            userId: input.userId,
          })),
        })
      );
    }

    // 6. Create stock movements for added items
    if (newLineDetails.length > 0) {
      txPromises.push(
        tx.stockMovement.createMany({
          data: newLineDetails.map((line) => ({
            storeId: invoice.storeId,
            productId: line.productId,
            qtyBase: -line.qtyBase, // negative = stock sold
            unitCostBasePence: avgCostMap.get(line.productId) ?? line.productUnit.product.defaultCostBasePence,
            type: 'SALE_AMENDMENT',
            referenceType: 'SALES_INVOICE',
            referenceId: invoice.id,
            userId: input.userId,
          })),
        })
      );
    }

    // 7. Create refund payment if total decreased
    if (refundAmount > 0) {
      txPromises.push(
        tx.salesPayment.create({
          data: {
            salesInvoiceId: invoice.id,
            method: refundMethod,
            amountPence: -refundAmount, // negative = refund
            branchId: invoice.branchId ?? null,
            // Amendment refund: direction is amount sign. Origin is UNCLASSIFIED —
            // the amend workflow does not establish sale-time vs later-collection.
            receiptOrigin: RECEIPT_ORIGIN.UNCLASSIFIED,
          },
        })
      );

      if (refundMethod === 'CASH' && invoice.shiftId) {
        txPromises.push(
          recordCashDrawerEntryTx(tx, {
            businessId: invoice.businessId,
            storeId: invoice.storeId,
            tillId: invoice.tillId,
            shiftId: invoice.shiftId,
            createdByUserId: input.userId,
            cashierUserId: input.userId,
            entryType: 'CASH_REFUND',
            amountPence: -refundAmount,
            reasonCode: 'SALE_AMEND_REFUND',
            reason: input.reason,
            referenceType: 'SALES_INVOICE',
            referenceId: invoice.id,
          })
        );
      }
    }

    // 8. Create additional payment record if total increased
    if (additionalPaymentNeeded > 0) {
      txPromises.push(
        tx.salesPayment.create({
          data: {
            salesInvoiceId: invoice.id,
            method: additionalPaymentMethod,
            amountPence: additionalPaymentNeeded,
            branchId: invoice.branchId ?? null,
            // Amendment add: sale already existed; action is amend, not checkout or
            // debtor collection — persist UNCLASSIFIED rather than inventing meaning.
            receiptOrigin: RECEIPT_ORIGIN.UNCLASSIFIED,
          },
        })
      );

      if (additionalPaymentMethod === 'CASH' && invoice.shiftId) {
        txPromises.push(
          recordCashDrawerEntryTx(tx, {
            businessId: invoice.businessId,
            storeId: invoice.storeId,
            tillId: invoice.tillId,
            shiftId: invoice.shiftId,
            createdByUserId: input.userId,
            cashierUserId: input.userId,
            entryType: 'CASH_SALE',
            amountPence: additionalPaymentNeeded,
            reasonCode: 'SALE_AMEND_ADDITION',
            reason: input.reason,
            referenceType: 'SALES_INVOICE',
            referenceId: invoice.id,
          })
        );
      }
    }

    // 9. Post corrective journal entry
    const removedSubtotal = removedLines.reduce((sum, l) => sum + l.lineTotalPence - l.lineVatPence, 0);
    const removedVatTotal = removedLines.reduce((sum, l) => sum + l.lineVatPence, 0);
    const removedCogs = removedLines.reduce((sum, l) => {
      const avgCost = avgCostMap.get(l.productId) ?? l.product.defaultCostBasePence;
      return sum + avgCost * l.qtyBase;
    }, 0);
    const addedCogs = newLineDetails.reduce((sum, l) => {
      const avgCost = avgCostMap.get(l.productId) ?? l.productUnit.product.defaultCostBasePence;
      return sum + avgCost * l.qtyBase;
    }, 0);

    const journalLines: JournalLine[] = [];

    // Reverse removed sales revenue (debit sales)
    if (removedSubtotal > 0) {
      journalLines.push({ accountCode: ACCOUNT_CODES.sales, debitPence: removedSubtotal });
    }
    // Record added sales revenue (credit sales)
    if (addedSubtotal > 0) {
      journalLines.push({ accountCode: ACCOUNT_CODES.sales, creditPence: addedSubtotal });
    }
    // Reverse VAT on removed items
    if (invoice.business.vatEnabled && removedVatTotal > 0) {
      journalLines.push({ accountCode: ACCOUNT_CODES.vatPayable, debitPence: removedVatTotal });
    }
    // Record VAT on added items
    if (invoice.business.vatEnabled && addedVat > 0) {
      journalLines.push({ accountCode: ACCOUNT_CODES.vatPayable, creditPence: addedVat });
    }
    // Reverse COGS for removed items
    if (removedCogs > 0) {
      journalLines.push({ accountCode: ACCOUNT_CODES.inventory, debitPence: removedCogs });
      journalLines.push({ accountCode: ACCOUNT_CODES.cogs, creditPence: removedCogs });
    }
    // Record COGS for added items
    if (addedCogs > 0) {
      journalLines.push({ accountCode: ACCOUNT_CODES.cogs, debitPence: addedCogs });
      journalLines.push({ accountCode: ACCOUNT_CODES.inventory, creditPence: addedCogs });
    }
    // Refund payment
    if (refundAmount > 0) {
      journalLines.push(
        refundMethod === 'CASH'
          ? { accountCode: ACCOUNT_CODES.cash, creditPence: refundAmount }
          : { accountCode: ACCOUNT_CODES.bank, creditPence: refundAmount }
      );
    }
    // Additional payment received
    if (additionalPaymentNeeded > 0) {
      journalLines.push(
        additionalPaymentMethod === 'CASH'
          ? { accountCode: ACCOUNT_CODES.cash, debitPence: additionalPaymentNeeded }
          : { accountCode: ACCOUNT_CODES.bank, debitPence: additionalPaymentNeeded }
      );
    }
    // Reverse order-level discount that is cleared by the amendment (new discount is always 0)
    const discountDelta = invoice.discountPence;
    if (discountDelta > 0) {
      journalLines.push({ accountCode: ACCOUNT_CODES.sales, debitPence: discountDelta });
    }

    // AR adjustment
    const netRevenueChange = (addedSubtotal + addedVat) - (removedSubtotal + removedVatTotal) - discountDelta;
    const netPaymentChange = additionalPaymentNeeded - refundAmount;
    const arChange = netRevenueChange - netPaymentChange;
    if (arChange > 0) {
      journalLines.push({ accountCode: ACCOUNT_CODES.ar, debitPence: arChange });
    } else if (arChange < 0) {
      journalLines.push({ accountCode: ACCOUNT_CODES.ar, creditPence: -arChange });
    }

    if (journalLines.length > 0) {
      txPromises.push(
        postJournalEntry({
          businessId: invoice.businessId,
          description: `Sale amendment ${invoice.id}`,
          referenceType: 'SALES_INVOICE',
          referenceId: invoice.id,
          lines: journalLines,
          prismaClient: tx as any,
        })
      );
    }

    await Promise.all(txPromises);

    return { newTotal, refundAmount, additionalPaymentNeeded };
  });

  return {
    invoiceId: invoice.id,
    before: beforeSnapshot,
    after: {
      totalPence: newTotal,
      subtotalPence: newSubtotal,
      vatPence: newVat,
      lineCount: keptLines.length + newLineDetails.length,
      addedItems: newLineDetails.map((line) => ({
        productId: line.productId,
        productName: line.productUnit.product.name,
        unitName: line.productUnit.unit?.name ?? line.unitId,
        qtyInUnit: line.qtyInUnit,
        qtyBase: line.qtyBase,
        unitPricePence: line.unitPricePence,
        lineVatPence: line.lineVat,
        lineTotalPence: line.lineTotal,
      })),
    },
    refundAmount: result.refundAmount,
    refundMethod: result.refundAmount > 0 ? refundMethod : null,
    additionalPaymentNeeded: result.additionalPaymentNeeded,
    additionalPaymentMethod: result.additionalPaymentNeeded > 0 ? additionalPaymentMethod : null,
  };
}
