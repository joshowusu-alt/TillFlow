import { prisma } from '@/lib/prisma';
import { expectedCashPenceFromEntries } from '@/lib/reports/expected-cash';
import { buildQtyByProductMap, fetchInventoryMap, resolveAvgCost, upsertInventoryBalance } from './shared';

type DrawerTx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

async function syncOpenShiftExpectedCash(
  tx: DrawerTx,
  businessId: string,
  drawerEntryIds: string[],
  openShiftIds: string[],
) {
  if (drawerEntryIds.length > 0) {
    await tx.cashDrawerEntry.deleteMany({
      where: { id: { in: drawerEntryIds } },
    });
  }

  for (const shiftId of openShiftIds) {
    const remaining = await tx.cashDrawerEntry.findMany({
      where: { shiftId },
      select: {
        entryType: true,
        amountPence: true,
        businessId: true,
        storeId: true,
        tillId: true,
        shiftId: true,
      },
    });
    const canonicalExpectedCashPence = expectedCashPenceFromEntries(remaining, {
      businessId,
      shiftId,
    });
    await tx.shift.update({
      where: { id: shiftId },
      data: { expectedCashPence: canonicalExpectedCashPence },
    });
  }
}

export async function cleanupOwnerVoidedSale(input: {
  businessId: string;
  salesInvoiceId: string;
}) {
  const invoice = await prisma.salesInvoice.findFirst({
    where: { id: input.salesInvoiceId, businessId: input.businessId },
    include: {
      lines: {
        include: {
          product: {
            select: { defaultCostBasePence: true },
          },
        },
      },
      payments: {
        select: { id: true, method: true, amountPence: true },
      },
      salesReturn: {
        select: { id: true },
      },
    },
  });

  if (!invoice) throw new Error('Sale not found');
  if (invoice.salesReturn || ['VOID', 'RETURNED'].includes(invoice.paymentStatus)) {
    throw new Error('Sale already voided or returned');
  }

  const qtyByProduct = buildQtyByProductMap(invoice.lines);
  const productIds = Array.from(qtyByProduct.keys());

  await prisma.$transaction(async (tx) => {
    const inventoryMap = await fetchInventoryMap(invoice.storeId, productIds, tx);

    for (const [productId, qtyBase] of qtyByProduct.entries()) {
      const sampleLine = invoice.lines.find((line) => line.productId === productId);
      if (!sampleLine) continue;

      const onHand = inventoryMap.get(productId)?.qtyOnHandBase ?? 0;
      const avgCost = resolveAvgCost(inventoryMap, productId, sampleLine.product.defaultCostBasePence);
      await upsertInventoryBalance(tx, invoice.storeId, productId, onHand + qtyBase, avgCost);
    }

    if (invoice.lines.length > 0) {
      await tx.stockMovement.createMany({
        data: invoice.lines.map((line) => {
          const beforeQtyBase = inventoryMap.get(line.productId)?.qtyOnHandBase ?? 0;
          return {
            storeId: invoice.storeId,
            productId: line.productId,
            qtyBase: line.qtyBase,
            beforeQtyBase,
            afterQtyBase: beforeQtyBase + line.qtyBase,
            unitCostBasePence: resolveAvgCost(
              inventoryMap,
              line.productId,
              line.product.defaultCostBasePence,
            ),
            type: 'SALE_VOID',
            referenceType: 'SALES_INVOICE',
            referenceId: invoice.id,
            userId: invoice.cashierUserId,
          };
        }),
      });
    }

    const drawerEntries = await tx.cashDrawerEntry.findMany({
      where: {
        businessId: input.businessId,
        referenceType: 'SALES_INVOICE',
        referenceId: invoice.id,
      },
      select: {
        id: true,
        shiftId: true,
        amountPence: true,
        entryType: true,
      },
    });

    const affectedShiftIds = new Set<string>();
    if (invoice.shiftId) affectedShiftIds.add(invoice.shiftId);
    for (const entry of drawerEntries) {
      if (entry.shiftId) affectedShiftIds.add(entry.shiftId);
    }

    const openShiftIds: string[] = [];
    for (const shiftId of affectedShiftIds) {
      const shift = await tx.shift.findUnique({
        where: { id: shiftId },
        select: {
          id: true,
          status: true,
          closedAt: true,
        },
      });
      if (!shift) continue;
      if (shift.closedAt !== null || shift.status === 'CLOSED') {
        throw new Error('CLOSED_SHIFT_CLEANUP_REJECTED');
      }
      openShiftIds.push(shift.id);
    }

    await syncOpenShiftExpectedCash(
      tx,
      input.businessId,
      drawerEntries.map((entry) => entry.id),
      openShiftIds,
    );

    const journalEntries = await tx.journalEntry.findMany({
      where: {
        businessId: input.businessId,
        referenceType: 'SALES_INVOICE',
        referenceId: invoice.id,
      },
      select: { id: true },
    });

    if (journalEntries.length > 0) {
      const journalEntryIds = journalEntries.map((entry) => entry.id);
      await tx.journalLine.deleteMany({
        where: { journalEntryId: { in: journalEntryIds } },
      });
      await tx.journalEntry.deleteMany({
        where: { id: { in: journalEntryIds } },
      });
    }

    await tx.salesPayment.deleteMany({
      where: { salesInvoiceId: invoice.id },
    });

    await tx.mobileMoneyCollection.updateMany({
      where: { salesInvoiceId: invoice.id },
      data: { salesInvoiceId: null },
    });

    await tx.salesInvoice.update({
      where: { id: invoice.id },
      data: {
        paymentStatus: 'VOID',
        grossMarginPence: 0,
        cashReceivedPence: 0,
        changeDuePence: 0,
      },
    });
  });

  return {
    salesInvoiceId: invoice.id,
    transactionNumber: invoice.transactionNumber ?? null,
    removedPaymentCount: invoice.payments.length,
  };
}