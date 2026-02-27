import { prisma } from '@/lib/prisma';
import { ACCOUNT_CODES, postJournalEntry } from '@/lib/accounting';
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
  upsertInventoryBalance,
  fetchInventoryMap,
  resolveAvgCost,
} from './shared';
import { getOpenShiftForTill, recordCashDrawerEntryTx } from './cash-drawer';
import { detectExcessiveDiscountRisk, detectNegativeMarginRisk } from './risk-monitor';
import { isDiscountReasonCode } from '@/lib/fraud/reason-codes';
import { resolveBranchIdForStore } from './branches';

export type SalePaymentInput = PaymentInput;

export type DiscountType = 'NONE' | 'PERCENT' | 'AMOUNT';

export type SaleLineInput = {
  productId: string;
  unitId: string;
  qtyInUnit: number;
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
  lines: SaleLineInput[];
};

export async function createSale(input: CreateSaleInput) {
  if (!input.lines.length) {
    throw new Error('No items in cart');
  }

  // Pre-compute values available from input (no DB dependency)
  const productIds = [...new Set(input.lines.map((l) => l.productId))];
  const allAccountCodes = [
    ACCOUNT_CODES.cash,
    ACCOUNT_CODES.bank,
    ACCOUNT_CODES.ar,
    ACCOUNT_CODES.sales,
    ACCOUNT_CODES.vatPayable,
    ACCOUNT_CODES.cogs,
    ACCOUNT_CODES.inventory,
  ];
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
        select: { id: true, storeId: true },
      })
    : Promise.resolve(null);

  // ── SINGLE BATCH: fire ALL lookups in parallel (was 5 sequential batches) ──
  const [
    business, store, productUnits, till, branchId, openShift,
    accounts, inventoryMap, momoResult, customerResult,
  ] = await Promise.all([
    prisma.business.findUnique({ where: { id: input.businessId } }),
    prisma.store.findFirst({
      where: { id: input.storeId, businessId: input.businessId },
      select: { id: true },
    }),
    prisma.productUnit.findMany({
      where: {
        product: { businessId: input.businessId },
        OR: input.lines.map((line) => ({
          productId: line.productId,
          unitId: line.unitId,
        })),
      },
      include: { product: true, unit: true },
    }),
    prisma.till.findFirst({
      where: { id: input.tillId, storeId: input.storeId, active: true },
      select: { id: true },
    }),
    resolveBranchIdForStore({ businessId: input.businessId, storeId: input.storeId }),
    getOpenShiftForTill(input.businessId, input.tillId),
    prisma.account.findMany({
      where: { businessId: input.businessId, code: { in: allAccountCodes } },
    }),
    fetchInventoryMap(input.storeId, productIds),
    momoLookup,
    customerLookup,
  ]);

  if (!business) throw new Error('Business not found');
  if (!store) throw new Error('Store not found');
  if (!till) throw new Error('Till not found');
  if (business.requireOpenTillForSales && !openShift) {
    throw new Error('Open till is required before recording sales.');
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

  const computeDiscount = (
    subtotal: number,
    type?: DiscountType,
    value?: number
  ) => {
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
  };

  const lineDetails = input.lines.map((line) => {
    if (line.qtyInUnit <= 0) {
      throw new Error('Quantity must be at least 1');
    }
    const productUnit = unitMap.get(`${line.productId}:${line.unitId}`);
    if (!productUnit) {
      throw new Error('Unit not configured for product');
    }
    const qtyBase = line.qtyInUnit * productUnit.conversionToBase;
    const unitPricePence = productUnit.product.sellingPriceBasePence * productUnit.conversionToBase;
    const lineSubtotal = unitPricePence * line.qtyInUnit;
    const lineDiscount = computeDiscount(lineSubtotal, line.discountType, line.discountValue);
    const promoBuyQty = productUnit.product.promoBuyQty ?? 0;
    const promoGetQty = productUnit.product.promoGetQty ?? 0;
    const promoGroup = promoBuyQty + promoGetQty;
    const promoFreeUnits =
      promoBuyQty > 0 && promoGetQty > 0 && promoGroup > 0
        ? Math.floor(qtyBase / promoGroup) * promoGetQty
        : 0;
    const promoDiscount = Math.min(
      promoFreeUnits * productUnit.product.sellingPriceBasePence,
      Math.max(lineSubtotal - lineDiscount, 0)
    );
    const lineNetSubtotal = Math.max(lineSubtotal - lineDiscount - promoDiscount, 0);
    const vatRate = business.vatEnabled ? productUnit.product.vatRateBps : 0;
    const lineVat = business.vatEnabled ? Math.round((lineNetSubtotal * vatRate) / 10000) : 0;
    const lineTotal = lineNetSubtotal + lineVat;
    return {
      ...line,
      productUnit,
      qtyBase,
      unitPricePence,
      lineSubtotal,
      lineDiscount,
      promoDiscount,
      lineNetSubtotal,
      lineVat,
      lineTotal
    };
  });

  const qtyByProduct = buildQtyByProductMap(lineDetails);

  for (const [productId, qtyBase] of qtyByProduct.entries()) {
    const onHand = inventoryMap.get(productId)?.qtyOnHandBase ?? 0;
    if (onHand < qtyBase) {
      throw new Error('Insufficient stock on hand');
    }
  }

  const costByProduct = new Map<string, number>();
  for (const line of lineDetails) {
    if (costByProduct.has(line.productId)) continue;
    costByProduct.set(
      line.productId,
      resolveAvgCost(inventoryMap, line.productId, line.productUnit.product.defaultCostBasePence)
    );
  }

  const lineNetSubtotalTotal = lineDetails.reduce((sum, line) => sum + line.lineNetSubtotal, 0);
  const lineVatTotal = lineDetails.reduce((sum, line) => sum + line.lineVat, 0);
  const orderDiscount = computeDiscount(
    lineNetSubtotalTotal,
    input.orderDiscountType,
    input.orderDiscountValue
  );
  const netAfterOrderDiscount = Math.max(lineNetSubtotalTotal - orderDiscount, 0);
  const vatRatio =
    business.vatEnabled && lineNetSubtotalTotal > 0
      ? netAfterOrderDiscount / lineNetSubtotalTotal
      : 1;
  const vatTotal = business.vatEnabled ? Math.round(lineVatTotal * vatRatio) : 0;
  const subtotal = netAfterOrderDiscount;
  const total = subtotal + vatTotal;
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
      throw new Error('Manager discount PIN approval is required for this discount.');
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

  if (finalStatus !== 'PAID' && !input.customerId) {
    throw new Error('Customer is required for credit or part-paid sales');
  }

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

  const invoice = await prisma.$transaction(
    async (tx) => {
    const created = await tx.salesInvoice.create({
      data: {
        businessId: input.businessId,
        storeId: store.id,
        branchId,
        tillId: till.id,
        shiftId: openShift?.id ?? null,
        cashierUserId: input.cashierUserId,
        customerId: input.customerId || null,
        paymentStatus: finalStatus,
        dueDate: input.dueDate || null,
        subtotalPence: subtotal,
        vatPence: vatTotal,
        totalPence: total,
        discountPence: orderDiscount,
        discountOverrideReasonCode: input.discountOverrideReasonCode ?? null,
        discountOverrideReason: input.discountOverrideReason ?? null,
        discountApprovedByUserId,
        grossMarginPence: grossMarginEstimate,
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
            lineTotalPence: line.lineTotal
          }))
        },
        payments: {
          create: payments.map((payment) => ({
            method: payment.method,
            amountPence: payment.amountPence,
            branchId,
            reference: payment.reference ?? input.externalRef ?? null,
            network: payment.network ?? null,
            payerMsisdn: payment.payerMsisdn ?? null,
            provider: payment.provider ?? null,
            status: payment.status ?? 'CONFIRMED',
            collectionId: payment.collectionId ?? null,
          }))
        }
      }
    });

    // Parallelise: MoMo, cash-drawer, inventory updates and stock movements
    const txPromises: Promise<any>[] = [];

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

    if (cashPence > 0 && openShift) {
      const beforeCash = openShift.expectedCashPence ?? 0;
      const afterCash = beforeCash + cashPence;
      txPromises.push(
        tx.cashDrawerEntry.create({
          data: {
            businessId: input.businessId,
            storeId: input.storeId,
            tillId: till.id,
            shiftId: openShift.id,
            createdByUserId: input.cashierUserId,
            cashierUserId: input.cashierUserId,
            entryType: 'CASH_SALE',
            amountPence: cashPence,
            reasonCode: 'SALE',
            reason: 'Cash sale collected',
            referenceType: 'SALES_INVOICE',
            referenceId: created.id,
            beforeExpectedCashPence: beforeCash,
            afterExpectedCashPence: afterCash,
          },
        }),
        tx.shift.update({
          where: { id: openShift.id },
          data: { expectedCashPence: afterCash },
        }),
      );
    }

    for (const [productId, qtyBase] of qtyByProduct.entries()) {
      txPromises.push(decrementInventoryBalance(tx, input.storeId, productId, qtyBase));
    }

    txPromises.push(
      tx.stockMovement.createMany({
        data: lineDetails.map((line) => ({
          storeId: input.storeId,
          productId: line.productId,
          qtyBase: -line.qtyBase,
          unitCostBasePence: costByProduct.get(line.productId) ?? line.productUnit.product.defaultCostBasePence,
          type: 'SALE',
          referenceType: 'SALES_INVOICE',
          referenceId: created.id,
          userId: input.cashierUserId
        }))
      }),
    );

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
      postJournalEntry({
        businessId: input.businessId,
        description: `Sale ${created.id}`,
        referenceType: 'SALES_INVOICE',
        referenceId: created.id,
        lines: journalLines,
        prismaClient: tx as any,
        accountMap,
      }),
    );

    // Execute all parallel tx operations at once
    await Promise.all(txPromises);

    return created;
  },
  { maxWait: 10000, timeout: 15000 },
  );

  // Fire-and-forget: risk detection is non-critical, don't block the sale
  detectExcessiveDiscountRisk({
    businessId: input.businessId,
    storeId: input.storeId,
    cashierUserId: input.cashierUserId,
    salesInvoiceId: invoice.id,
    discountPence: totalDiscountPence,
    grossSalesPence,
    thresholdBps: business.discountApprovalThresholdBps,
  }).catch(() => {});

  detectNegativeMarginRisk({
    businessId: input.businessId,
    storeId: input.storeId,
    cashierUserId: input.cashierUserId,
    salesInvoiceId: invoice.id,
    grossMarginPence: grossMarginEstimate,
  }).catch(() => {});

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
      lines: { include: { product: true } },
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
  let newLineDetails: Array<{
    productId: string;
    unitId: string;
    qtyInUnit: number;
    qtyBase: number;
    unitPricePence: number;
    lineSubtotal: number;
    lineDiscount: number;
    promoDiscount: number;
    lineNetSubtotal: number;
    lineVat: number;
    lineTotal: number;
    conversionToBase: number;
    productUnit: any;
  }> = [];

  if (hasNewLines) {
    const productUnits = await prisma.productUnit.findMany({
      where: {
        product: { businessId: input.businessId },
        OR: input.newLines!.map((line) => ({
          productId: line.productId,
          unitId: line.unitId,
        })),
      },
      include: { product: true, unit: true },
    });

    const unitMap = new Map(
      productUnits.map((pu) => [`${pu.productId}:${pu.unitId}`, pu])
    );

    const computeDiscount = (
      subtotal: number,
      type?: DiscountType,
      value?: number
    ) => {
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
    };

    newLineDetails = input.newLines!.map((line) => {
      if (line.qtyInUnit <= 0) {
        throw new Error('Quantity must be at least 1');
      }
      const productUnit = unitMap.get(`${line.productId}:${line.unitId}`);
      if (!productUnit) {
        throw new Error('Unit not configured for product');
      }
      const qtyBase = line.qtyInUnit * productUnit.conversionToBase;
      const unitPricePence =
        productUnit.product.sellingPriceBasePence * productUnit.conversionToBase;
      const lineSubtotal = unitPricePence * line.qtyInUnit;
      const lineDiscount = computeDiscount(
        lineSubtotal,
        line.discountType,
        line.discountValue
      );
      const promoBuyQty = productUnit.product.promoBuyQty ?? 0;
      const promoGetQty = productUnit.product.promoGetQty ?? 0;
      const promoGroup = promoBuyQty + promoGetQty;
      const promoFreeUnits =
        promoBuyQty > 0 && promoGetQty > 0 && promoGroup > 0
          ? Math.floor(qtyBase / promoGroup) * promoGetQty
          : 0;
      const promoDiscount = Math.min(
        promoFreeUnits * productUnit.product.sellingPriceBasePence,
        Math.max(lineSubtotal - lineDiscount, 0)
      );
      const lineNetSubtotal = Math.max(lineSubtotal - lineDiscount - promoDiscount, 0);
      const vatRate = invoice.business.vatEnabled
        ? productUnit.product.vatRateBps
        : 0;
      const lineVat = invoice.business.vatEnabled
        ? Math.round((lineNetSubtotal * vatRate) / 10000)
        : 0;
      const lineTotal = lineNetSubtotal + lineVat;
      return {
        ...line,
        productUnit,
        qtyBase,
        unitPricePence,
        lineSubtotal,
        lineDiscount,
        promoDiscount,
        lineNetSubtotal,
        lineVat,
        lineTotal,
        conversionToBase: productUnit.conversionToBase,
      };
    });
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
      qtyInUnit: l.qtyInUnit,
      qtyBase: l.qtyBase,
      lineTotalPence: l.lineTotalPence,
    })),
    addedItems: newLineDetails.map((l) => ({
      productId: l.productId,
      productName: l.productUnit.product.name,
      qtyInUnit: l.qtyInUnit,
      qtyBase: l.qtyBase,
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

  const inventoryMap = await fetchInventoryMap(
    invoice.storeId,
    Array.from(allAffectedProductIds)
  );

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
      resolveAvgCost(inventoryMap, line.productId, line.product.defaultCostBasePence)
    );
  }
  for (const line of newLineDetails) {
    if (avgCostMap.has(line.productId)) continue;
    avgCostMap.set(
      line.productId,
      resolveAvgCost(inventoryMap, line.productId, line.productUnit.product.defaultCostBasePence)
    );
  }

  const effectivePaid = oldTotalPaid - refundAmount + additionalPaymentNeeded;
  const newPaymentStatus = derivePaymentStatus(newTotal, effectivePaid);

  const result = await prisma.$transaction(async (tx) => {
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
    // AR adjustment
    const netRevenueChange = (addedSubtotal + addedVat) - (removedSubtotal + removedVatTotal);
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
    },
    refundAmount: result.refundAmount,
    refundMethod: result.refundAmount > 0 ? refundMethod : null,
    additionalPaymentNeeded: result.additionalPaymentNeeded,
    additionalPaymentMethod: result.additionalPaymentNeeded > 0 ? additionalPaymentMethod : null,
  };
}
