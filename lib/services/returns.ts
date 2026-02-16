import { prisma } from '@/lib/prisma';
import { ACCOUNT_CODES, postJournalEntry } from '@/lib/accounting';
import { type JournalLine } from './shared';
import {
  buildQtyByProductMap,
  fetchInventoryMap,
  resolveAvgCost,
  upsertInventoryBalance
} from './shared';

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
  refundMethod?: 'CASH' | 'CARD' | 'TRANSFER' | 'MOBILE_MONEY' | null;
  refundAmountPence?: number | null;
  reason?: string | null;
  type: 'RETURN' | 'VOID';
}) {
  const invoice = await prisma.salesInvoice.findFirst({
    where: { id: input.salesInvoiceId, businessId: input.businessId },
    include: {
      business: true,
      store: true,
      payments: true,
      lines: { include: { product: true } }
    }
  });
  if (!invoice) throw new Error('Sale not found');

  const existingReturn = await prisma.salesReturn.findUnique({
    where: { salesInvoiceId: invoice.id }
  });
  if (existingReturn) throw new Error('Sale already returned');

  const paidByMethod = summarisePayments(invoice.payments);

  const totalPaid = paidByMethod.total;
  const refundAmount =
    input.type === 'VOID'
      ? 0
      : Math.min(input.refundAmountPence ?? totalPaid, totalPaid);

  if (input.type === 'RETURN' && refundAmount !== totalPaid) {
    throw new Error('Refund amount must match paid total for full return');
  }

  const arReversal = Math.max(invoice.totalPence - totalPaid, 0);
  const refundMethod = input.type === 'RETURN' ? input.refundMethod ?? 'CASH' : null;

  const qtyByProduct = buildQtyByProductMap(invoice.lines);

  const inventoryMap = await fetchInventoryMap(
    invoice.storeId,
    Array.from(qtyByProduct.keys())
  );
  const avgCostMap = buildAvgCostMap(invoice.lines, inventoryMap);

  const result = await prisma.$transaction(async (tx) => {
    const created = await tx.salesReturn.create({
      data: {
        salesInvoiceId: invoice.id,
        storeId: invoice.storeId,
        userId: input.userId,
        type: input.type,
        refundMethod,
        refundAmountPence: refundAmount,
        reason: input.reason ?? null
      }
    });

    await tx.salesInvoice.update({
      where: { id: invoice.id },
      data: { paymentStatus: input.type === 'VOID' ? 'VOID' : 'RETURNED' }
    });

    for (const [productId, qtyBase] of qtyByProduct.entries()) {
      const onHand = inventoryMap.get(productId)?.qtyOnHandBase ?? 0;
      const avgCost = avgCostMap.get(productId) ?? 0;
      await upsertInventoryBalance(tx, invoice.storeId, productId, onHand + qtyBase, avgCost);
    }

    await tx.stockMovement.createMany({
      data: invoice.lines.map((line) => ({
        storeId: invoice.storeId,
        productId: line.productId,
        qtyBase: line.qtyBase,
        unitCostBasePence: avgCostMap.get(line.productId) ?? line.product.defaultCostBasePence,
        type: 'SALES_RETURN',
        referenceType: 'SALES_RETURN',
        referenceId: created.id,
        userId: input.userId
      }))
    });

    const cogsTotal = invoice.lines.reduce((sum, line) => {
      const avgCost = avgCostMap.get(line.productId) ?? line.product.defaultCostBasePence;
      return sum + avgCost * line.qtyBase;
    }, 0);

    const journalLines: JournalLine[] = [
      { accountCode: ACCOUNT_CODES.sales, debitPence: invoice.subtotalPence },
      invoice.business.vatEnabled && invoice.vatPence > 0
        ? { accountCode: ACCOUNT_CODES.vatPayable, debitPence: invoice.vatPence }
        : null,
      cogsTotal > 0 ? { accountCode: ACCOUNT_CODES.inventory, debitPence: cogsTotal } : null,
      cogsTotal > 0 ? { accountCode: ACCOUNT_CODES.cogs, creditPence: cogsTotal } : null,
      refundAmount > 0
        ? refundMethod === 'CASH'
          ? { accountCode: ACCOUNT_CODES.cash, creditPence: refundAmount }
          : { accountCode: ACCOUNT_CODES.bank, creditPence: refundAmount }
        : null,
      arReversal > 0 ? { accountCode: ACCOUNT_CODES.ar, creditPence: arReversal } : null
    ].filter(Boolean) as JournalLine[];

    await postJournalEntry({
      businessId: invoice.businessId,
      description: `Sales return ${created.id}`,
      referenceType: 'SALES_RETURN',
      referenceId: created.id,
      lines: journalLines,
      prismaClient: tx as any
    });

    return created;
  });

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

  if (input.type === 'RETURN' && refundAmount !== totalPaid) {
    throw new Error('Refund amount must match paid total for full return');
  }

  const apReversal = Math.max(invoice.totalPence - totalPaid, 0);
  const refundMethod = input.type === 'RETURN' ? input.refundMethod ?? 'CASH' : null;

  const qtyByProduct = buildQtyByProductMap(invoice.lines);

  const inventoryMap = await fetchInventoryMap(
    invoice.storeId,
    Array.from(qtyByProduct.keys())
  );
  const avgCostMap = buildAvgCostMap(invoice.lines, inventoryMap);

  const result = await prisma.$transaction(async (tx) => {
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

    for (const [productId, qtyBase] of qtyByProduct.entries()) {
      const onHand = inventoryMap.get(productId)?.qtyOnHandBase ?? 0;
      const avgCost = avgCostMap.get(productId) ?? 0;
      const nextOnHand = onHand - qtyBase;
      if (nextOnHand < 0) {
        throw new Error('Return would result in negative stock');
      }
      await upsertInventoryBalance(tx, invoice.storeId, productId, nextOnHand, avgCost);
    }

    await tx.stockMovement.createMany({
      data: invoice.lines.map((line) => ({
        storeId: invoice.storeId,
        productId: line.productId,
        qtyBase: -line.qtyBase,
        unitCostBasePence: avgCostMap.get(line.productId) ?? line.product.defaultCostBasePence,
        type: 'PURCHASE_RETURN',
        referenceType: 'PURCHASE_RETURN',
        referenceId: created.id,
        userId: input.userId
      }))
    });

    const inventoryCreditTotal = invoice.lines.reduce((sum, line) => {
      const avgCost = avgCostMap.get(line.productId) ?? line.product.defaultCostBasePence;
      return sum + avgCost * line.qtyBase;
    }, 0);

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
