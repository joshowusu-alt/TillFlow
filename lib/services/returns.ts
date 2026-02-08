import { prisma } from '@/lib/prisma';
import { ACCOUNT_CODES, postJournalEntry } from '@/lib/accounting';

export async function createSalesReturn(input: {
  businessId: string;
  salesInvoiceId: string;
  userId: string;
  refundMethod?: 'CASH' | 'CARD' | 'TRANSFER' | null;
  refundAmountPence?: number | null;
  reason?: string | null;
  type: 'RETURN' | 'VOID';
}) {
  const invoice = await prisma.salesInvoice.findUnique({
    where: { id: input.salesInvoiceId },
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

  const paidByMethod = invoice.payments.reduce(
    (acc, payment) => {
      acc.total += payment.amountPence;
      if (payment.method === 'CASH') acc.cash += payment.amountPence;
      if (payment.method === 'CARD') acc.card += payment.amountPence;
      if (payment.method === 'TRANSFER') acc.transfer += payment.amountPence;
      return acc;
    },
    { total: 0, cash: 0, card: 0, transfer: 0 }
  );

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

  const qtyByProduct = new Map<string, number>();
  for (const line of invoice.lines) {
    qtyByProduct.set(line.productId, (qtyByProduct.get(line.productId) ?? 0) + line.qtyBase);
  }

  const inventoryBalances = await prisma.inventoryBalance.findMany({
    where: { storeId: invoice.storeId, productId: { in: Array.from(qtyByProduct.keys()) } }
  });
  const inventoryMap = new Map(
    inventoryBalances.map((item) => [
      item.productId,
      { qtyOnHandBase: item.qtyOnHandBase, avgCostBasePence: item.avgCostBasePence }
    ])
  );
  const avgCostMap = new Map<string, number>();
  for (const line of invoice.lines) {
    if (avgCostMap.has(line.productId)) continue;
    const inventory = inventoryMap.get(line.productId);
    const avgCost =
      inventory?.avgCostBasePence && inventory.avgCostBasePence > 0
        ? inventory.avgCostBasePence
        : line.product.defaultCostBasePence;
    avgCostMap.set(line.productId, avgCost);
  }

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
      const inventory = inventoryMap.get(productId);
      const onHand = inventory?.qtyOnHandBase ?? 0;
      const avgCost = avgCostMap.get(productId) ?? 0;
      await tx.inventoryBalance.upsert({
        where: { storeId_productId: { storeId: invoice.storeId, productId } },
        update: { qtyOnHandBase: onHand + qtyBase, avgCostBasePence: avgCost },
        create: {
          storeId: invoice.storeId,
          productId,
          qtyOnHandBase: onHand + qtyBase,
          avgCostBasePence: avgCost
        }
      });
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

    const journalLines = [
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
    ].filter(Boolean) as { accountCode: string; debitPence?: number; creditPence?: number }[];

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
  refundMethod?: 'CASH' | 'CARD' | 'TRANSFER' | null;
  refundAmountPence?: number | null;
  reason?: string | null;
  type: 'RETURN' | 'VOID';
}) {
  const invoice = await prisma.purchaseInvoice.findUnique({
    where: { id: input.purchaseInvoiceId },
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

  const paidByMethod = invoice.payments.reduce(
    (acc, payment) => {
      acc.total += payment.amountPence;
      if (payment.method === 'CASH') acc.cash += payment.amountPence;
      if (payment.method === 'CARD') acc.card += payment.amountPence;
      if (payment.method === 'TRANSFER') acc.transfer += payment.amountPence;
      return acc;
    },
    { total: 0, cash: 0, card: 0, transfer: 0 }
  );

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

  const qtyByProduct = new Map<string, number>();
  for (const line of invoice.lines) {
    qtyByProduct.set(line.productId, (qtyByProduct.get(line.productId) ?? 0) + line.qtyBase);
  }

  const inventoryBalances = await prisma.inventoryBalance.findMany({
    where: { storeId: invoice.storeId, productId: { in: Array.from(qtyByProduct.keys()) } }
  });
  const inventoryMap = new Map(
    inventoryBalances.map((item) => [
      item.productId,
      { qtyOnHandBase: item.qtyOnHandBase, avgCostBasePence: item.avgCostBasePence }
    ])
  );
  const avgCostMap = new Map<string, number>();
  for (const line of invoice.lines) {
    if (avgCostMap.has(line.productId)) continue;
    const inventory = inventoryMap.get(line.productId);
    const avgCost =
      inventory?.avgCostBasePence && inventory.avgCostBasePence > 0
        ? inventory.avgCostBasePence
        : line.product.defaultCostBasePence;
    avgCostMap.set(line.productId, avgCost);
  }

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
      const inventory = inventoryMap.get(productId);
      const onHand = inventory?.qtyOnHandBase ?? 0;
      const avgCost = avgCostMap.get(productId) ?? 0;
      const nextOnHand = onHand - qtyBase;
      if (nextOnHand < 0) {
        throw new Error('Return would result in negative stock');
      }
      await tx.inventoryBalance.upsert({
        where: { storeId_productId: { storeId: invoice.storeId, productId } },
        update: { qtyOnHandBase: nextOnHand, avgCostBasePence: avgCost },
        create: {
          storeId: invoice.storeId,
          productId,
          qtyOnHandBase: nextOnHand,
          avgCostBasePence: avgCost
        }
      });
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

    const journalLines = [
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
    ].filter(Boolean) as { accountCode: string; debitPence?: number; creditPence?: number }[];

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
