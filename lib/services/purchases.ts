import { prisma } from '@/lib/prisma';
import { ACCOUNT_CODES, postJournalEntry } from '@/lib/accounting';

export type PurchasePaymentInput = {
  method: 'CASH' | 'CARD' | 'TRANSFER';
  amountPence: number;
};

export type PurchaseLineInput = {
  productId: string;
  unitId: string;
  qtyInUnit: number;
  unitCostPence?: number | null;
};

export type CreatePurchaseInput = {
  businessId: string;
  storeId: string;
  supplierId?: string | null;
  paymentStatus: 'PAID' | 'PART_PAID' | 'UNPAID';
  dueDate?: Date | null;
  payments: PurchasePaymentInput[];
  lines: PurchaseLineInput[];
};

export async function createPurchase(input: CreatePurchaseInput) {
  const business = await prisma.business.findUnique({ where: { id: input.businessId } });
  if (!business) throw new Error('Business not found');

  if (!input.lines.length) {
    throw new Error('No items in purchase');
  }

  const productUnits = await prisma.productUnit.findMany({
    where: {
      OR: input.lines.map((line) => ({
        productId: line.productId,
        unitId: line.unitId
      }))
    },
    include: { product: true, unit: true }
  });

  const unitMap = new Map(productUnits.map((pu) => [`${pu.productId}:${pu.unitId}`, pu]));

  const lineDetails = input.lines.map((line) => {
    if (line.qtyInUnit <= 0) {
      throw new Error('Quantity must be at least 1');
    }
    const productUnit = unitMap.get(`${line.productId}:${line.unitId}`);
    if (!productUnit) throw new Error('Unit not configured for product');
    const qtyBase = line.qtyInUnit * productUnit.conversionToBase;
    const unitCostPence =
      line.unitCostPence ?? productUnit.product.defaultCostBasePence * productUnit.conversionToBase;
    const unitCostBasePence = Math.round(unitCostPence / productUnit.conversionToBase);
    const lineSubtotal = unitCostPence * line.qtyInUnit;
    const vatRate = business.vatEnabled ? productUnit.product.vatRateBps : 0;
    const lineVat = business.vatEnabled ? Math.round((lineSubtotal * vatRate) / 10000) : 0;
    const lineTotal = lineSubtotal + lineVat;
    return {
      ...line,
      productUnit,
      qtyBase,
      unitCostPence,
      unitCostBasePence,
      lineSubtotal,
      lineVat,
      lineTotal
    };
  });

  const initialPayments = input.payments.filter((payment) => payment.amountPence > 0);
  const subtotal = lineDetails.reduce((sum, line) => sum + line.lineSubtotal, 0);
  const vatTotal = lineDetails.reduce((sum, line) => sum + line.lineVat, 0);
  const total = subtotal + vatTotal;

  const payments =
    initialPayments.length === 0 && input.paymentStatus === 'PAID'
      ? [{ method: 'CASH', amountPence: total }]
      : initialPayments;
  const totalPaid = payments.reduce((sum, payment) => sum + payment.amountPence, 0);
  if (totalPaid > total) {
    throw new Error('Payment exceeds total due');
  }
  const balanceDue = Math.max(total - totalPaid, 0);
  const finalStatus =
    balanceDue === 0 ? 'PAID' : totalPaid === 0 ? 'UNPAID' : 'PART_PAID';

  const productTotals = new Map<
    string,
    { qtyBase: number; costPence: number; defaultCostBasePence: number }
  >();
  for (const line of lineDetails) {
    const existing =
      productTotals.get(line.productId) ?? {
        qtyBase: 0,
        costPence: 0,
        defaultCostBasePence: line.productUnit.product.defaultCostBasePence
      };
    existing.qtyBase += line.qtyBase;
    existing.costPence += line.lineSubtotal;
    productTotals.set(line.productId, existing);
  }

  const invoice = await prisma.$transaction(async (tx) => {
    const created = await tx.purchaseInvoice.create({
      data: {
        businessId: input.businessId,
        storeId: input.storeId,
        supplierId: input.supplierId || null,
        paymentStatus: finalStatus,
        dueDate: input.dueDate || null,
        subtotalPence: subtotal,
        vatPence: vatTotal,
        totalPence: total,
        lines: {
          create: lineDetails.map((line) => ({
            productId: line.productId,
            unitId: line.unitId,
            qtyInUnit: line.qtyInUnit,
            conversionToBase: line.productUnit.conversionToBase,
            qtyBase: line.qtyBase,
            unitCostPence: line.unitCostPence,
            lineSubtotalPence: line.lineSubtotal,
            lineVatPence: line.lineVat,
            lineTotalPence: line.lineTotal
          }))
        },
        payments: {
          create: payments.map((payment) => ({
            method: payment.method,
            amountPence: payment.amountPence
          }))
        }
      }
    });

    const inventoryBalances = await tx.inventoryBalance.findMany({
      where: { storeId: input.storeId, productId: { in: Array.from(productTotals.keys()) } }
    });
    const inventoryMap = new Map(
      inventoryBalances.map((item) => [
        item.productId,
        { qtyOnHandBase: item.qtyOnHandBase, avgCostBasePence: item.avgCostBasePence }
      ])
    );

    const nextAverageMap = new Map<string, number>();
    for (const [productId, totals] of productTotals.entries()) {
      const inventory = inventoryMap.get(productId);
      const onHand = inventory?.qtyOnHandBase ?? 0;
      const currentAvg =
        inventory?.avgCostBasePence && inventory.avgCostBasePence > 0
          ? inventory.avgCostBasePence
          : totals.defaultCostBasePence;
      const existingValue = onHand * currentAvg;
      const newQty = onHand + totals.qtyBase;
      const newAvg = newQty > 0 ? Math.round((existingValue + totals.costPence) / newQty) : 0;
      nextAverageMap.set(productId, newAvg);
    }

    for (const [productId, totals] of productTotals.entries()) {
      const inventory = inventoryMap.get(productId);
      const onHand = inventory?.qtyOnHandBase ?? 0;
      const nextAvg = nextAverageMap.get(productId) ?? 0;
      await tx.inventoryBalance.upsert({
        where: { storeId_productId: { storeId: input.storeId, productId } },
        update: { qtyOnHandBase: onHand + totals.qtyBase, avgCostBasePence: nextAvg },
        create: {
          storeId: input.storeId,
          productId,
          qtyOnHandBase: onHand + totals.qtyBase,
          avgCostBasePence: nextAvg
        }
      });
    }

    await tx.stockMovement.createMany({
      data: lineDetails.map((line) => ({
        storeId: input.storeId,
        productId: line.productId,
        qtyBase: line.qtyBase,
        unitCostBasePence: line.unitCostBasePence,
        type: 'PURCHASE',
        referenceType: 'PURCHASE_INVOICE',
        referenceId: created.id
      }))
    });

    return created;
  });

  const cashPaid = payments
    .filter((payment) => payment.method === 'CASH')
    .reduce((sum, payment) => sum + payment.amountPence, 0);
  const bankPaid = payments
    .filter((payment) => payment.method !== 'CASH')
    .reduce((sum, payment) => sum + payment.amountPence, 0);
  const apAmount = total - cashPaid - bankPaid;

  const journalLines = [
    { accountCode: ACCOUNT_CODES.inventory, debitPence: subtotal },
    business.vatEnabled && vatTotal > 0
      ? { accountCode: ACCOUNT_CODES.vatReceivable, debitPence: vatTotal }
      : null,
    cashPaid > 0 ? { accountCode: ACCOUNT_CODES.cash, creditPence: cashPaid } : null,
    bankPaid > 0 ? { accountCode: ACCOUNT_CODES.bank, creditPence: bankPaid } : null,
    apAmount > 0 ? { accountCode: ACCOUNT_CODES.ap, creditPence: apAmount } : null
  ].filter(Boolean) as { accountCode: string; debitPence?: number; creditPence?: number }[];

  await postJournalEntry({
    businessId: input.businessId,
    description: `Purchase ${invoice.id}`,
    referenceType: 'PURCHASE_INVOICE',
    referenceId: invoice.id,
    lines: journalLines
  });

  return invoice;
}
