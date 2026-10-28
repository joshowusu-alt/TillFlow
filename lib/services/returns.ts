import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { receiveStockValue, removeRecordedStockValue, INVENTORY_VALUE_V1, UNVERIFIED_STOCK_V1 } from '@/lib/inventory-value';
import { lockInventoryValues } from './shared/inventory-utils';
import { RECEIPT_LEDGER_V1, isPendingMomo } from '@/lib/payments/receipt-ledger';
import { ACCOUNT_CODES, postJournalEntry } from '@/lib/accounting';
import { UserError } from '@/lib/action-utils';
import { type JournalLine } from './shared';
import {
  buildQtyByProductMap,
  fetchInventoryMap,
  resolveAvgCost,
  upsertInventoryBalance
} from './shared';
import { getOpenCashShiftForPayment, recordCashDrawerEntryTx } from './cash-drawer';
import { assertMoneyMovementTenantChain, lockSalesInvoiceForUpdate, lockPurchaseInvoiceForUpdate } from './money-idempotency';
import { detectVoidFrequencyRisk } from './risk-monitor';
import { measureServerOperation, PERFORMANCE_THRESHOLDS_MS } from '@/lib/observability';

// ---------------------------------------------------------------------------
// Shared helper — accumulate payments by method
// ---------------------------------------------------------------------------
function summarisePayments(payments: { method: string; amountPence: number }[]) {
  return payments.reduce(
    (acc, p) => {
      acc.total += p.amountPence;
      if (p.method === 'CASH') acc.cash += p.amountPence;
      if (p.method === 'CARD') acc.card += p.amountPence;
      if (p.method === 'TRANSFER') acc.transfer += p.amountPence;
      return acc;
    },
    { total: 0, cash: 0, card: 0, transfer: 0 }
  );
}

// ---------------------------------------------------------------------------
// Shared helper — build avgCost map from inventory + product defaults
// ---------------------------------------------------------------------------
function buildAvgCostMap(
  lines: { productId: string; product: { defaultCostBasePence: number } }[],
  inventoryMap: Map<string, { qtyOnHandBase: number; avgCostBasePence: number }>
): Map<string, number> {
  const map = new Map<string, number>();
  for (const line of lines) {
    if (map.has(line.productId)) continue;
    map.set(line.productId, resolveAvgCost(inventoryMap, line.productId, line.product.defaultCostBasePence));
  }
  return map;
}

export async function createSalesReturn(input: {
  businessId: string;
  salesInvoiceId: string;
  userId: string;
  reasonCode?: string | null;
  refundMethod?: 'CASH' | 'CARD' | 'TRANSFER' | 'MOBILE_MONEY' | null;
  refundAmountPence?: number | null;
  reason?: string | null;
  managerApprovedByUserId?: string | null;
  managerApprovalMode?: string | null;
  type: 'RETURN' | 'VOID';
  tx?: Prisma.TransactionClient;
  /** Record an authorised refund liability; no money has left the business yet. */
  deferRefund?: boolean;
}) {
  return measureServerOperation(
    'action.sales-return.create',
    () => createSalesReturnImpl(input),
    {
      businessId: input.businessId,
      action: 'createSalesReturnAction',
      cacheState: 'write-through',
    },
    { thresholdMs: PERFORMANCE_THRESHOLDS_MS.action, operationType: 'action' },
  );
}

async function createSalesReturnImpl(input: {
  businessId: string;
  salesInvoiceId: string;
  userId: string;
  reasonCode?: string | null;
  refundMethod?: 'CASH' | 'CARD' | 'TRANSFER' | 'MOBILE_MONEY' | null;
  refundAmountPence?: number | null;
  reason?: string | null;
  managerApprovedByUserId?: string | null;
  managerApprovalMode?: string | null;
  type: 'RETURN' | 'VOID';
  tx?: Prisma.TransactionClient;
  /** Record an authorised refund liability; no money has left the business yet. */
  deferRefund?: boolean;
}) {
  const db = input.tx ?? prisma;
  const invoice = await db.salesInvoice.findFirst({
    where: { id: input.salesInvoiceId, businessId: input.businessId },
    include: {
      business: true,
      store: true,
      payments: true,
      lines: { include: { product: true } }
    }
  });
  if (!invoice) throw new UserError('Sale not found');
  if (!input.managerApprovedByUserId) {
    throw new UserError('Manager approval is required for returns and voids.');
  }
  if (!input.reasonCode) {
    throw new UserError('Reason code is required for returns and voids.');
  }

  const approvedBy = await db.user.findFirst({
    where: {
      id: input.managerApprovedByUserId,
      businessId: input.businessId,
      active: true,
      role: { in: ['MANAGER', 'OWNER'] },
    },
    select: { id: true },
  });
  if (!approvedBy) {
    throw new Error('Manager approval user is invalid.');
  }

  const existingReturn = await db.salesReturn.findUnique({
    where: { salesInvoiceId: invoice.id }
  });
  if (existingReturn) throw new Error('Sale already returned');

  const invoiceId = invoice.id;
  const execute = async (tx: Prisma.TransactionClient) => {
    await lockSalesInvoiceForUpdate(tx as any, input.businessId, invoiceId);
    const invoice = await tx.salesInvoice.findFirst({
      where: { id: invoiceId, businessId: input.businessId },
      include: { business: true, store: true, payments: true, lines: { include: { product: true } } },
    });
    if (!invoice || ['RETURNED', 'VOID'].includes(invoice.paymentStatus)) throw new UserError('Sale already returned or voided');
    const pending = invoice.payments.filter(isPendingMomo);
    if (pending.some(p => p.ledgerTreatment != null && p.ledgerTreatment !== RECEIPT_LEDGER_V1)) {
      throw new UserError('Receipt posting treatment requires reconciliation.');
    }
    const settled = invoice.payments.filter(p => !isPendingMomo(p));
    const totalPaid = summarisePayments(settled).total;
    const pendingTotal = pending.reduce((sum, p) => sum + p.amountPence, 0);
    const legacyPending = pending.filter(p => p.ledgerTreatment == null).reduce((sum, p) => sum + p.amountPence, 0);
    if (legacyPending > 0) {
      // Legacy receipt rows lack a posting discriminator. Require matching original
      // ledger evidence before reversing Bank; never invent an historical debit.
      const originalEntries = await tx.journalEntry.findMany({
        where: { businessId: input.businessId, referenceId: { in: [invoice.id, ...invoice.payments.map(p => p.id)] },
          referenceType: { in: ['SALES_INVOICE', 'CUSTOMER_RECEIPT', 'MOMO_PAYMENT_CONFIRM'] } },
        include: { lines: { include: { account: true } } },
      });
      const bookedBank = originalEntries.flatMap(entry => entry.lines)
        .filter(line => line.account.code === ACCOUNT_CODES.bank)
        .reduce((sum, line) => sum + line.debitPence - line.creditPence, 0);
      const expectedBank = legacyPending + settled.filter(p => p.method !== 'CASH')
        .reduce((sum, p) => sum + p.amountPence, 0);
      if (bookedBank !== expectedBank) {
        throw new UserError('Legacy Bank postings require reconciliation before reversing this sale.');
      }
    }
    const tenderMethods = [...new Set(settled.filter(p => p.amountPence > 0).map(p => p.method))];
    if (input.type === 'VOID' && tenderMethods.length > 1) {
      throw new UserError('Use a return with an explicit refund method for a sale with mixed confirmed tender.');
    }
    const refundAmount = input.type === 'VOID' ? totalPaid : Math.min(input.refundAmountPence ?? totalPaid, totalPaid);
    if (refundAmount < 0 || refundAmount !== totalPaid || totalPaid + pendingTotal > invoice.totalPence) {
      throw new UserError('A full-sale reversal must refund confirmed receipts in full. Reconcile partial refunds separately.');
    }
    const refundMethod = input.type === 'VOID'
      ? (tenderMethods[0] ?? null)
      : input.refundMethod ?? 'CASH';
    const arReversal = invoice.totalPence - totalPaid - legacyPending;
    const qtyByProduct = buildQtyByProductMap(invoice.lines);
    await lockInventoryValues(tx, invoice.storeId, Array.from(qtyByProduct.keys()));
    // Re-read inventory inside transaction to prevent TOCTOU race
    const inventoryMap = await fetchInventoryMap(invoice.storeId, Array.from(qtyByProduct.keys()), tx);
    const avgCostMap = buildAvgCostMap(invoice.lines, inventoryMap);

    const created = await tx.salesReturn.create({
      data: {
        salesInvoiceId: invoice.id,
        storeId: invoice.storeId,
        userId: input.userId,
        type: input.type,
        reasonCode: input.reasonCode ?? null,
        refundMethod,
        refundAmountPence: refundAmount,
        reason: input.reason ?? null,
        managerApprovedByUserId: approvedBy.id,
        managerApprovalMode: input.managerApprovalMode ?? null,
      }
    });

    await tx.salesInvoice.update({
      where: { id: invoice.id },
      data: { paymentStatus: input.type === 'VOID' ? 'VOID' : 'RETURNED' }
    });

    if (refundAmount > 0 && refundMethod === 'CASH' && !input.deferRefund) {
      if (!invoice.tillId) {
        throw new UserError('Open till is required before recording a cash refund.');
      }
      const openShift = await getOpenCashShiftForPayment(tx, {
        businessId: invoice.businessId,
        storeId: invoice.storeId,
        tillId: invoice.tillId,
      });
      if (!openShift) {
        throw new UserError('Open shift is required before recording a cash refund.');
      }
      await assertMoneyMovementTenantChain(tx, {
        businessId: invoice.businessId,
        storeId: invoice.storeId,
        userId: input.userId,
        tillId: invoice.tillId,
        shiftId: openShift.id,
      });
      await recordCashDrawerEntryTx(tx, {
        businessId: invoice.businessId,
        storeId: invoice.storeId,
        tillId: invoice.tillId,
        shiftId: openShift.id,
        createdByUserId: input.userId,
        cashierUserId: input.userId,
        entryType: 'CASH_REFUND',
        amountPence: -refundAmount,
        reasonCode: input.type === 'VOID' ? 'VOID' : 'RETURN',
        reason: input.reason ?? null,
        referenceType: 'SALES_RETURN',
        referenceId: created.id,
      });
    }

    for (const [productId, qtyBase] of qtyByProduct.entries()) {
      const originalLines = invoice.lines.filter(line => line.productId === productId);
      const originalCost = originalLines.reduce((sum, line) => sum + (line.lineCostPence ?? (avgCostMap.get(productId) ?? 0) * line.qtyBase), 0);
      const unknownQty = originalLines.filter(line => line.costBasis === UNVERIFIED_STOCK_V1 ||
        (line.lineCostPence === 0 && line.costBasis !== INVENTORY_VALUE_V1)).reduce((sum, line) => sum + line.qtyBase, 0);
      const value = receiveStockValue(inventoryMap.get(productId), qtyBase, originalCost, unknownQty);
      await upsertInventoryBalance(tx, invoice.storeId, productId, value.qtyOnHandBase, value.avgCostBasePence, value);
    }

    await tx.stockMovement.createMany({
      data: invoice.lines.map((line) => ({
        storeId: invoice.storeId,
        productId: line.productId,
        qtyBase: line.qtyBase,
        valuePence: line.lineCostPence,
        costBasis: line.costBasis,
        unitCostBasePence: line.lineCostPence != null && line.qtyBase > 0
          ? Math.round(line.lineCostPence / line.qtyBase)
          : avgCostMap.get(line.productId) ?? line.product.defaultCostBasePence,
        type: 'SALES_RETURN',
        referenceType: 'SALES_RETURN',
        referenceId: created.id,
        userId: input.userId
      }))
    });

    const cogsTotal = invoice.lines.reduce((sum, line) => {
      const avgCost = avgCostMap.get(line.productId) ?? line.product.defaultCostBasePence;
      return sum + (line.lineCostPence ?? avgCost * line.qtyBase);
    }, 0);

    const journalLines: JournalLine[] = [
      { accountCode: ACCOUNT_CODES.sales, debitPence: invoice.subtotalPence },
      invoice.vatPence > 0
        ? { accountCode: ACCOUNT_CODES.vatPayable, debitPence: invoice.vatPence }
        : null,
      cogsTotal > 0 ? { accountCode: ACCOUNT_CODES.inventory, debitPence: cogsTotal } : null,
      cogsTotal > 0 ? { accountCode: ACCOUNT_CODES.cogs, creditPence: cogsTotal } : null,
      refundAmount > 0
        ? input.deferRefund
          ? { accountCode: ACCOUNT_CODES.customerRefundsPayable, creditPence: refundAmount }
          : refundMethod === 'CASH'
          ? { accountCode: ACCOUNT_CODES.cash, creditPence: refundAmount }
          : { accountCode: ACCOUNT_CODES.bank, creditPence: refundAmount }
        : null,
      arReversal > 0 ? { accountCode: ACCOUNT_CODES.ar, creditPence: arReversal } : null,
      legacyPending > 0 ? { accountCode: ACCOUNT_CODES.bank, creditPence: legacyPending } : null,
    ].filter(Boolean) as JournalLine[];

    await postJournalEntry({
      businessId: invoice.businessId,
      description: `Sales return ${created.id}`,
      referenceType: 'SALES_RETURN',
      referenceId: created.id,
      lines: journalLines,
      prismaClient: tx as any
    });

    // The closed parent blocks confirmation. Preserve the recorded receipt claim
    // so returned/void pending rows remain visible for investigation.
    return created;
  };
  const result = input.tx ? await execute(input.tx) : await prisma.$transaction(execute);

  if (input.type === 'VOID') {
    await detectVoidFrequencyRisk({
      businessId: input.businessId,
      storeId: invoice.storeId,
      cashierUserId: input.userId,
    });
  }

  return result;
}

export async function createPurchaseReturn(input: {
  businessId: string;
  purchaseInvoiceId: string;
  userId: string;
  refundMethod?: 'CASH' | 'CARD' | 'TRANSFER' | 'MOBILE_MONEY' | null;
  refundAmountPence?: number | null;
  reason?: string | null;
  type: 'RETURN' | 'VOID';
  /** Required for cash refunds. Purchase invoices have no till — the action must pass tillId. */
  tillId?: string | null;
  shiftId?: string | null;
  fallbackTillId?: string | null;
}) {
  return measureServerOperation(
    'action.purchase-return.create',
    () => createPurchaseReturnImpl(input),
    {
      businessId: input.businessId,
      action: 'createPurchaseReturnAction',
      cacheState: 'write-through',
    },
    { thresholdMs: PERFORMANCE_THRESHOLDS_MS.action, operationType: 'action' },
  );
}

async function createPurchaseReturnImpl(input: {
  businessId: string;
  purchaseInvoiceId: string;
  userId: string;
  refundMethod?: 'CASH' | 'CARD' | 'TRANSFER' | 'MOBILE_MONEY' | null;
  refundAmountPence?: number | null;
  reason?: string | null;
  type: 'RETURN' | 'VOID';
  tillId?: string | null;
  shiftId?: string | null;
  fallbackTillId?: string | null;
}) {
  const invoice = await prisma.purchaseInvoice.findFirst({
    where: { id: input.purchaseInvoiceId, businessId: input.businessId },
    include: {
      business: true,
      store: true,
      payments: true,
      lines: { include: { product: true } }
    }
  });
  if (!invoice) throw new Error('Purchase not found');
  if (invoice.returnCreditPence > 0) throw new Error('This purchase has partial return credits. Use selected-item returns; a whole-invoice reversal would duplicate the credit.');

  const existingReturn = await prisma.purchaseReturn.findUnique({
    where: { purchaseInvoiceId: invoice.id }
  });
  if (existingReturn) throw new Error('Purchase already returned');

  const paidByMethod = summarisePayments(invoice.payments);

  const totalPaid = paidByMethod.total;
  const refundAmount =
    input.type === 'VOID'
      ? 0
      : Math.min(input.refundAmountPence ?? totalPaid, totalPaid);

  if (input.type === 'RETURN' && refundAmount > totalPaid) {
    throw new Error('Refund amount exceeds total paid');
  }

  const apReversal = Math.max(invoice.totalPence - totalPaid, 0);
  const refundMethod = input.type === 'RETURN' ? input.refundMethod ?? 'CASH' : null;

  const qtyByProduct = buildQtyByProductMap(invoice.lines);

  const result = await prisma.$transaction(async (tx) => {
    // Re-read inventory inside transaction to prevent TOCTOU race
    await lockPurchaseInvoiceForUpdate(tx as unknown as Parameters<typeof lockPurchaseInvoiceForUpdate>[0], input.businessId, input.purchaseInvoiceId);
    const freshPurchase = await tx.purchaseInvoice.findFirst({ where: { id: invoice.id, businessId: input.businessId }, select: { returnCreditPence: true } });
    if (freshPurchase?.returnCreditPence) throw new Error('This purchase has partial return credits. Use selected-item returns.');
    await lockInventoryValues(tx, invoice.storeId, Array.from(qtyByProduct.keys()));
    const inventoryMap = await fetchInventoryMap(invoice.storeId, Array.from(qtyByProduct.keys()), tx);
    const avgCostMap = buildAvgCostMap(invoice.lines, inventoryMap);

    const created = await tx.purchaseReturn.create({
      data: {
        purchaseInvoiceId: invoice.id,
        storeId: invoice.storeId,
        userId: input.userId,
        type: input.type,
        refundMethod,
        refundAmountPence: refundAmount,
        reason: input.reason ?? null
      }
    });

    await tx.purchaseInvoice.update({
      where: { id: invoice.id },
      data: { paymentStatus: input.type === 'VOID' ? 'VOID' : 'RETURNED' }
    });

    if (refundAmount > 0 && refundMethod === 'CASH') {
      // Action must pass tillId; PurchaseInvoice has no invoice till to fall back to.
      if (!input.tillId && !input.fallbackTillId) {
        throw new UserError('Select an open till before recording a cash purchase refund.');
      }
      const openShift = await getOpenCashShiftForPayment(tx, {
        businessId: invoice.businessId,
        storeId: invoice.storeId,
        tillId: input.tillId,
        shiftId: input.shiftId,
        fallbackTillId: input.fallbackTillId,
      });
      if (!openShift) {
        throw new UserError('Open shift is required before recording a cash purchase refund.');
      }
      await assertMoneyMovementTenantChain(tx, {
        businessId: invoice.businessId,
        storeId: invoice.storeId,
        userId: input.userId,
        tillId: openShift.tillId,
        shiftId: openShift.id,
      });
      await recordCashDrawerEntryTx(tx, {
        businessId: invoice.businessId,
        storeId: invoice.storeId,
        tillId: openShift.tillId,
        shiftId: openShift.id,
        createdByUserId: input.userId,
        cashierUserId: input.userId,
        entryType: 'CASH_REFUND',
        amountPence: refundAmount,
        reasonCode: input.type === 'VOID' ? 'VOID' : 'RETURN',
        reason: input.reason ?? null,
        referenceType: 'PURCHASE_RETURN',
        referenceId: created.id,
      });
    }

    for (const [productId, qtyBase] of qtyByProduct.entries()) {
      const onHand = inventoryMap.get(productId)?.qtyOnHandBase ?? 0;
      const avgCost = avgCostMap.get(productId) ?? 0;
      const nextOnHand = onHand - qtyBase;
      if (nextOnHand < 0) {
        throw new Error('Return would result in negative stock');
      }
      const originalValue = invoice.lines.filter(line => line.productId === productId).reduce((sum, line) => sum + line.lineSubtotalPence + (line.allocatedCostPence ?? 0), 0);
      const before = inventoryMap.get(productId);
      const value = before ? removeRecordedStockValue(before, qtyBase, originalValue) : undefined;
      await upsertInventoryBalance(tx, invoice.storeId, productId, nextOnHand, value?.avgCostBasePence ?? avgCost, value);
    }

    await tx.stockMovement.createMany({
      data: invoice.lines.map((line) => ({
        storeId: invoice.storeId,
        productId: line.productId,
        qtyBase: -line.qtyBase,
        unitCostBasePence: avgCostMap.get(line.productId) ?? line.product.defaultCostBasePence,
        valuePence: -(line.lineSubtotalPence + (line.allocatedCostPence ?? 0)),
        costBasis: INVENTORY_VALUE_V1,
        type: 'PURCHASE_RETURN',
        referenceType: 'PURCHASE_RETURN',
        referenceId: created.id,
        userId: input.userId
      }))
    });

    const inventoryCreditTotal = invoice.lines.reduce((sum, line) => sum + line.lineSubtotalPence + (line.allocatedCostPence ?? 0), 0);

    const journalLines: JournalLine[] = [
      { accountCode: ACCOUNT_CODES.inventory, creditPence: inventoryCreditTotal },
      invoice.business.vatEnabled && invoice.vatPence > 0
        ? { accountCode: ACCOUNT_CODES.vatReceivable, creditPence: invoice.vatPence }
        : null,
      refundAmount > 0
        ? refundMethod === 'CASH'
          ? { accountCode: ACCOUNT_CODES.cash, debitPence: refundAmount }
          : { accountCode: ACCOUNT_CODES.bank, debitPence: refundAmount }
        : null,
      apReversal > 0 ? { accountCode: ACCOUNT_CODES.ap, debitPence: apReversal } : null
    ].filter(Boolean) as JournalLine[];

    await postJournalEntry({
      businessId: invoice.businessId,
      description: `Purchase return ${created.id}`,
      referenceType: 'PURCHASE_RETURN',
      referenceId: created.id,
      lines: journalLines,
      prismaClient: tx as any
    });

    return created;
  });

  return result;
}
