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
  fetchInventoryMap,
  resolveAvgCost,
  upsertInventoryBalance
} from './shared';

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
  externalRef?: string | null;
  createdAt?: Date | null;
  lines: SaleLineInput[];
};

export async function createSale(input: CreateSaleInput) {
  const business = await prisma.business.findUnique({ where: { id: input.businessId } });
  if (!business) throw new Error('Business not found');

  const store = await prisma.store.findFirst({
    where: { id: input.storeId, businessId: input.businessId },
    select: { id: true },
  });
  if (!store) throw new Error('Store not found');

  const till = await prisma.till.findFirst({
    where: { id: input.tillId, storeId: store.id, active: true },
    select: { id: true },
  });
  if (!till) throw new Error('Till not found');

  if (input.customerId) {
    const customer = await prisma.customer.findFirst({
      where: { id: input.customerId, businessId: input.businessId },
      select: { id: true },
    });
    if (!customer) throw new Error('Customer not found');
  }

  if (!input.lines.length) {
    throw new Error('No items in cart');
  }

  const productUnits = await prisma.productUnit.findMany({
    where: {
      product: { businessId: input.businessId },
      OR: input.lines.map((line) => ({
        productId: line.productId,
        unitId: line.unitId
      }))
    },
    include: { product: true, unit: true }
  });

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

  const inventoryMap = await fetchInventoryMap(
    input.storeId,
    Array.from(qtyByProduct.keys())
  );

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
    cashPence > 0 ? { method: 'CASH' as const, amountPence: cashPence } : null,
    ...fallbackPayments
      .filter((p) => p.method === 'CARD' && p.amountPence > 0)
      .map((p) => ({ method: 'CARD' as const, amountPence: p.amountPence })),
    ...fallbackPayments
      .filter((p) => p.method === 'TRANSFER' && p.amountPence > 0)
      .map((p) => ({ method: 'TRANSFER' as const, amountPence: p.amountPence }))
  ].filter(Boolean) as SalePaymentInput[];

  const finalStatus =
    balanceDue === 0 ? 'PAID' : totalPaid === 0 ? 'UNPAID' : 'PART_PAID';

  if (finalStatus !== 'PAID' && !input.customerId) {
    throw new Error('Customer is required for credit or part-paid sales');
  }

  const invoice = await prisma.$transaction(async (tx) => {
    const created = await tx.salesInvoice.create({
      data: {
        businessId: input.businessId,
        storeId: store.id,
        tillId: till.id,
        cashierUserId: input.cashierUserId,
        customerId: input.customerId || null,
        paymentStatus: finalStatus,
        dueDate: input.dueDate || null,
        subtotalPence: subtotal,
        vatPence: vatTotal,
        totalPence: total,
        discountPence: orderDiscount,
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
            reference: input.externalRef ?? payment.reference ?? null
          }))
        }
      }
    });

    for (const [productId, qtyBase] of qtyByProduct.entries()) {
      const onHand = inventoryMap.get(productId)?.qtyOnHandBase ?? 0;
      const avgCost = resolveAvgCost(
        inventoryMap,
        productId,
        lineDetails.find((l) => l.productId === productId)?.productUnit.product.defaultCostBasePence ?? 0
      );
      await upsertInventoryBalance(tx, input.storeId, productId, onHand - qtyBase, avgCost);
    }

    await tx.stockMovement.createMany({
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
    });

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

    await postJournalEntry({
      businessId: input.businessId,
      description: `Sale ${created.id}`,
      referenceType: 'SALES_INVOICE',
      referenceId: created.id,
      lines: journalLines,
      prismaClient: tx as any
    });

    return created;
  });

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
  /** Refund method when new total < old total */
  refundMethod?: 'CASH' | 'CARD' | 'TRANSFER';
};

/**
 * Amend an existing sale by removing line items. Handles:
 * - Removing selected lines from the invoice
 * - Restoring inventory for removed items
 * - Recalculating invoice totals  
 * - Posting corrective journal entries
 * - Creating refund payment records if applicable
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

  if (removedLines.length === 0) {
    throw new Error('No items selected for removal');
  }

  if (keptLines.length === 0) {
    throw new Error('Cannot remove all items — use Return/Void instead');
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
  };

  // Recalculate totals from kept lines
  const newSubtotal = keptLines.reduce((sum, l) => sum + l.lineTotalPence - l.lineVatPence, 0);
  const newVat = keptLines.reduce((sum, l) => sum + l.lineVatPence, 0);
  const newTotal = newSubtotal + newVat;

  const oldTotalPaid = invoice.payments.reduce((sum, p) => sum + p.amountPence, 0);
  const refundAmount = Math.max(oldTotalPaid - newTotal, 0);
  const refundMethod = input.refundMethod ?? 'CASH';

  // Build qty map for removed items to restore inventory
  const removedQtyByProduct = buildQtyByProductMap(removedLines);

  const inventoryMap = await fetchInventoryMap(
    invoice.storeId,
    Array.from(removedQtyByProduct.keys())
  );

  // Build avg cost map for removed items
  const avgCostMap = new Map<string, number>();
  for (const line of removedLines) {
    if (avgCostMap.has(line.productId)) continue;
    avgCostMap.set(
      line.productId,
      resolveAvgCost(inventoryMap, line.productId, line.product.defaultCostBasePence)
    );
  }

  const newPaymentStatus = derivePaymentStatus(newTotal, oldTotalPaid - refundAmount);

  const result = await prisma.$transaction(async (tx) => {
    // 1. Delete removed lines
    await tx.salesInvoiceLine.deleteMany({
      where: {
        id: { in: removedLines.map((l) => l.id) },
        salesInvoiceId: invoice.id,
      },
    });

    // 2. Update invoice totals and status
    await tx.salesInvoice.update({
      where: { id: invoice.id },
      data: {
        subtotalPence: newSubtotal,
        vatPence: newVat,
        totalPence: newTotal,
        discountPence: 0, // order-level discount is cleared on amend
        paymentStatus: newPaymentStatus,
      },
    });

    // 3. Restore inventory for removed items
    for (const [productId, qtyBase] of removedQtyByProduct.entries()) {
      const onHand = inventoryMap.get(productId)?.qtyOnHandBase ?? 0;
      const avgCost = avgCostMap.get(productId) ?? 0;
      await upsertInventoryBalance(tx, invoice.storeId, productId, onHand + qtyBase, avgCost);
    }

    // 4. Create stock movements for the restored items
    await tx.stockMovement.createMany({
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
    });

    // 5. Create refund payment if applicable
    if (refundAmount > 0) {
      await tx.salesPayment.create({
        data: {
          salesInvoiceId: invoice.id,
          method: refundMethod,
          amountPence: -refundAmount, // negative = refund
        },
      });
    }

    // 6. Post corrective journal entry
    const removedSubtotal = removedLines.reduce((sum, l) => sum + l.lineTotalPence - l.lineVatPence, 0);
    const removedVat = removedLines.reduce((sum, l) => sum + l.lineVatPence, 0);
    const removedCogs = removedLines.reduce((sum, l) => {
      const avgCost = avgCostMap.get(l.productId) ?? l.product.defaultCostBasePence;
      return sum + avgCost * l.qtyBase;
    }, 0);

    const journalLines: JournalLine[] = [
      // Reverse the removed sales revenue
      { accountCode: ACCOUNT_CODES.sales, debitPence: removedSubtotal },
      // Reverse VAT on removed items
      invoice.business.vatEnabled && removedVat > 0
        ? { accountCode: ACCOUNT_CODES.vatPayable, debitPence: removedVat }
        : null,
      // Reverse COGS — credit COGS, debit inventory
      removedCogs > 0 ? { accountCode: ACCOUNT_CODES.inventory, debitPence: removedCogs } : null,
      removedCogs > 0 ? { accountCode: ACCOUNT_CODES.cogs, creditPence: removedCogs } : null,
      // Refund payment
      refundAmount > 0
        ? refundMethod === 'CASH'
          ? { accountCode: ACCOUNT_CODES.cash, creditPence: refundAmount }
          : { accountCode: ACCOUNT_CODES.bank, creditPence: refundAmount }
        : null,
      // Any balance that remains unpaid becomes AR reversal
      removedSubtotal + removedVat - refundAmount > 0
        ? { accountCode: ACCOUNT_CODES.ar, creditPence: removedSubtotal + removedVat - refundAmount }
        : null,
    ].filter(Boolean) as JournalLine[];

    if (journalLines.length > 0) {
      await postJournalEntry({
        businessId: invoice.businessId,
        description: `Sale amendment ${invoice.id}`,
        referenceType: 'SALES_INVOICE',
        referenceId: invoice.id,
        lines: journalLines,
        prismaClient: tx as any,
      });
    }

    return { newTotal, refundAmount };
  });

  return {
    invoiceId: invoice.id,
    before: beforeSnapshot,
    after: {
      totalPence: newTotal,
      subtotalPence: newSubtotal,
      vatPence: newVat,
      lineCount: keptLines.length,
    },
    refundAmount: result.refundAmount,
    refundMethod: result.refundAmount > 0 ? refundMethod : null,
  };
}
