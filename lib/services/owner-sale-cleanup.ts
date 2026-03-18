import { prisma } from '@/lib/prisma';
import { buildQtyByProductMap, fetchInventoryMap, resolveAvgCost, upsertInventoryBalance } from './shared';

type CleanupShiftSnapshotInput = {
  expectedCashPence: number;
  cardTotalPence: number;
  transferTotalPence: number;
  momoTotalPence: number;
  variance: number | null;
  cashEntryDeltaPence: number;
  cashEntryTypeTotals: Record<string, number>;
};

function adjustShiftClosureSnapshot(
  closureSnapshotJson: string | null,
  input: CleanupShiftSnapshotInput
): string | null {
  if (!closureSnapshotJson) return closureSnapshotJson;

  try {
    const parsed = JSON.parse(closureSnapshotJson) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return closureSnapshotJson;

    parsed.expectedCashPence = input.expectedCashPence;
    parsed.cardTotalPence = input.cardTotalPence;
    parsed.transferTotalPence = input.transferTotalPence;
    parsed.momoTotalPence = input.momoTotalPence;
    if (input.variance !== null) parsed.variancePence = input.variance;

    const existingCashEntriesByType =
      parsed.cashEntriesByType && typeof parsed.cashEntriesByType === 'object'
        ? (parsed.cashEntriesByType as Record<string, number>)
        : {};

    for (const [entryType, amount] of Object.entries(input.cashEntryTypeTotals)) {
      existingCashEntriesByType[entryType] = (existingCashEntriesByType[entryType] ?? 0) - amount;
    }

    parsed.cashEntriesByType = existingCashEntriesByType;

    if (typeof parsed.cashEntriesTotalPence === 'number') {
      parsed.cashEntriesTotalPence = parsed.cashEntriesTotalPence - input.cashEntryDeltaPence;
    }

    return JSON.stringify(parsed);
  } catch {
    return closureSnapshotJson;
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
  const paymentTotals = invoice.payments.reduce(
    (acc, payment) => {
      acc[payment.method] = (acc[payment.method] ?? 0) + payment.amountPence;
      return acc;
    },
    {} as Record<string, number>
  );

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

    const cashDeltaByShift = new Map<string, number>();
    const cashEntryTypesByShift = new Map<string, Record<string, number>>();

    for (const entry of drawerEntries) {
      if (!entry.shiftId) continue;
      cashDeltaByShift.set(entry.shiftId, (cashDeltaByShift.get(entry.shiftId) ?? 0) + entry.amountPence);
      const existing = cashEntryTypesByShift.get(entry.shiftId) ?? {};
      existing[entry.entryType] = (existing[entry.entryType] ?? 0) + entry.amountPence;
      cashEntryTypesByShift.set(entry.shiftId, existing);
    }

    const affectedShiftIds = new Set<string>();
    if (invoice.shiftId) affectedShiftIds.add(invoice.shiftId);
    for (const shiftId of cashDeltaByShift.keys()) affectedShiftIds.add(shiftId);

    for (const shiftId of affectedShiftIds) {
      const shift = await tx.shift.findUnique({
        where: { id: shiftId },
        select: {
          id: true,
          status: true,
          closedAt: true,
          expectedCashPence: true,
          actualCashPence: true,
          variance: true,
          cardTotalPence: true,
          transferTotalPence: true,
          momoTotalPence: true,
          closureSnapshotJson: true,
        },
      });
      if (!shift) continue;

      const cashEntryDeltaPence = cashDeltaByShift.get(shiftId) ?? 0;
      const shouldAdjustPaymentTotals = shiftId === invoice.shiftId && shift.closedAt !== null;
      const nextExpectedCashPence = shift.expectedCashPence - cashEntryDeltaPence;
      const nextCardTotalPence = shouldAdjustPaymentTotals
        ? Math.max(0, shift.cardTotalPence - (paymentTotals.CARD ?? 0))
        : shift.cardTotalPence;
      const nextTransferTotalPence = shouldAdjustPaymentTotals
        ? Math.max(0, shift.transferTotalPence - (paymentTotals.TRANSFER ?? 0))
        : shift.transferTotalPence;
      const nextMomoTotalPence = shouldAdjustPaymentTotals
        ? Math.max(0, shift.momoTotalPence - (paymentTotals.MOBILE_MONEY ?? 0))
        : shift.momoTotalPence;
      const nextVariance = shift.actualCashPence === null ? shift.variance : shift.actualCashPence - nextExpectedCashPence;

      const shiftUpdateData: Record<string, unknown> = {
        expectedCashPence: nextExpectedCashPence,
      };

      if (shift.closedAt !== null) {
        shiftUpdateData.cardTotalPence = nextCardTotalPence;
        shiftUpdateData.transferTotalPence = nextTransferTotalPence;
        shiftUpdateData.momoTotalPence = nextMomoTotalPence;
        shiftUpdateData.variance = nextVariance;
        shiftUpdateData.closureSnapshotJson = adjustShiftClosureSnapshot(shift.closureSnapshotJson, {
          expectedCashPence: nextExpectedCashPence,
          cardTotalPence: nextCardTotalPence,
          transferTotalPence: nextTransferTotalPence,
          momoTotalPence: nextMomoTotalPence,
          variance: nextVariance,
          cashEntryDeltaPence,
          cashEntryTypeTotals: cashEntryTypesByShift.get(shiftId) ?? {},
        });
      }

      await tx.shift.update({
        where: { id: shiftId },
        data: shiftUpdateData,
      });
    }

    if (drawerEntries.length > 0) {
      await tx.cashDrawerEntry.deleteMany({
        where: { id: { in: drawerEntries.map((entry) => entry.id) } },
      });
    }

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