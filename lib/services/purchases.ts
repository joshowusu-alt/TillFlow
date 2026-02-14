import { prisma } from '@/lib/prisma';
import { ACCOUNT_CODES, postJournalEntry } from '@/lib/accounting';
import {
  filterPositivePayments,
  splitPayments,
  derivePaymentStatus,
  creditCashBankLines,
  type PaymentInput,
  type JournalLine
} from './shared';
import { fetchInventoryMap, upsertInventoryBalance } from './shared';

export type PurchasePaymentInput = PaymentInput;

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

  const positivePayments = filterPositivePayments(input.payments);
  const subtotal = lineDetails.reduce((sum, line) => sum + line.lineSubtotal, 0);
  const vatTotal = lineDetails.reduce((sum, line) => sum + line.lineVat, 0);
  const total = subtotal + vatTotal;

  const payments =
    positivePayments.length === 0 && input.paymentStatus === 'PAID'
      ? [{ method: 'CASH' as const, amountPence: total }]
      : positivePayments;
  const totalPaid = payments.reduce((sum, p) => sum + p.amountPence, 0);
  if (totalPaid > total) {
    throw new Error('Payment exceeds total due');
  }
  const finalStatus = derivePaymentStatus(total, totalPaid);

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

    const inventoryMap = await fetchInventoryMap(
      input.storeId,
      Array.from(productTotals.keys()),
      tx as any
    );

    for (const [productId, totals] of productTotals.entries()) {
      const inv = inventoryMap.get(productId);
      const onHand = inv?.qtyOnHandBase ?? 0;
      const currentAvg =
        inv?.avgCostBasePence && inv.avgCostBasePence > 0
          ? inv.avgCostBasePence
          : totals.defaultCostBasePence;
      const existingValue = onHand * currentAvg;
      const newQty = onHand + totals.qtyBase;
      const newAvg = newQty > 0 ? Math.round((existingValue + totals.costPence) / newQty) : 0;
      await upsertInventoryBalance(tx, input.storeId, productId, newQty, newAvg);
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

  const split = splitPayments(payments);
  const apAmount = total - split.totalPence;

  const journalLines: JournalLine[] = [
    { accountCode: ACCOUNT_CODES.inventory, debitPence: subtotal },
    business.vatEnabled && vatTotal > 0
      ? { accountCode: ACCOUNT_CODES.vatReceivable, debitPence: vatTotal }
      : null,
    ...creditCashBankLines(split),
    apAmount > 0 ? { accountCode: ACCOUNT_CODES.ap, creditPence: apAmount } : null
  ].filter(Boolean) as JournalLine[];

  await postJournalEntry({
    businessId: input.businessId,
    description: `Purchase ${invoice.id}`,
    referenceType: 'PURCHASE_INVOICE',
    referenceId: invoice.id,
    lines: journalLines
  });

  return invoice;
}
