import { prisma } from '@/lib/prisma';
import { ACCOUNT_CODES, postJournalEntry } from '@/lib/accounting';

export type SalePaymentInput = {
  method: 'CASH' | 'CARD' | 'TRANSFER';
  amountPence: number;
};

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
  lines: SaleLineInput[];
};

export async function createSale(input: CreateSaleInput) {
  const business = await prisma.business.findUnique({ where: { id: input.businessId } });
  if (!business) throw new Error('Business not found');

  if (!input.lines.length) {
    throw new Error('No items in cart');
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

  const qtyByProduct = new Map<string, number>();
  for (const line of lineDetails) {
    qtyByProduct.set(line.productId, (qtyByProduct.get(line.productId) ?? 0) + line.qtyBase);
  }

  const inventoryBalances = await prisma.inventoryBalance.findMany({
    where: { storeId: input.storeId, productId: { in: Array.from(qtyByProduct.keys()) } }
  });
  const inventoryMap = new Map(
    inventoryBalances.map((item) => [
      item.productId,
      { qtyOnHandBase: item.qtyOnHandBase, avgCostBasePence: item.avgCostBasePence }
    ])
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
    const inventory = inventoryMap.get(line.productId);
    const avgCost =
      inventory?.avgCostBasePence && inventory.avgCostBasePence > 0
        ? inventory.avgCostBasePence
        : line.productUnit.product.defaultCostBasePence;
    costByProduct.set(line.productId, avgCost);
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

  const initialPayments = input.payments.filter((payment) => payment.amountPence > 0);
  const fallbackPayments =
    initialPayments.length === 0 && input.paymentStatus === 'PAID'
      ? [{ method: 'CASH', amountPence: total }]
      : initialPayments;

  let cashPaid = fallbackPayments
    .filter((payment) => payment.method === 'CASH')
    .reduce((sum, payment) => sum + payment.amountPence, 0);
  const cardPaid = fallbackPayments
    .filter((payment) => payment.method === 'CARD')
    .reduce((sum, payment) => sum + payment.amountPence, 0);
  const transferPaid = fallbackPayments
    .filter((payment) => payment.method === 'TRANSFER')
    .reduce((sum, payment) => sum + payment.amountPence, 0);

  let totalPaid = cashPaid + cardPaid + transferPaid;
  if (totalPaid > total) {
    const overpaid = totalPaid - total;
    if (cashPaid < overpaid) {
      throw new Error('Payment exceeds total due');
    }
    cashPaid -= overpaid;
    totalPaid -= overpaid;
  }

  const balanceDue = Math.max(total - totalPaid, 0);
  const payments = [
    cashPaid > 0 ? { method: 'CASH' as const, amountPence: cashPaid } : null,
    cardPaid > 0 ? { method: 'CARD' as const, amountPence: cardPaid } : null,
    transferPaid > 0 ? { method: 'TRANSFER' as const, amountPence: transferPaid } : null
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
        storeId: input.storeId,
        tillId: input.tillId,
        cashierUserId: input.cashierUserId,
        customerId: input.customerId || null,
        paymentStatus: finalStatus,
        dueDate: input.dueDate || null,
        subtotalPence: subtotal,
        vatPence: vatTotal,
        totalPence: total,
        discountPence: orderDiscount,
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
            amountPence: payment.amountPence
          }))
        }
      }
    });

    for (const [productId, qtyBase] of qtyByProduct.entries()) {
      const inventory = inventoryMap.get(productId);
      const onHand = inventory?.qtyOnHandBase ?? 0;
      const avgCost =
        inventory?.avgCostBasePence && inventory.avgCostBasePence > 0
          ? inventory.avgCostBasePence
          : lineDetails.find((line) => line.productId === productId)?.productUnit.product
              .defaultCostBasePence ?? 0;
      await tx.inventoryBalance.upsert({
        where: { storeId_productId: { storeId: input.storeId, productId } },
        update: { qtyOnHandBase: onHand - qtyBase, avgCostBasePence: avgCost },
        create: {
          storeId: input.storeId,
          productId,
          qtyOnHandBase: onHand - qtyBase,
          avgCostBasePence: avgCost
        }
      });
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

    const cashPaid = payments
      .filter((payment) => payment.method === 'CASH')
      .reduce((sum, payment) => sum + payment.amountPence, 0);
    const bankPaid = payments
      .filter((payment) => payment.method !== 'CASH')
      .reduce((sum, payment) => sum + payment.amountPence, 0);
    const arAmount = total - cashPaid - bankPaid;

    const journalLines = [
      cashPaid > 0 ? { accountCode: ACCOUNT_CODES.cash, debitPence: cashPaid } : null,
      bankPaid > 0 ? { accountCode: ACCOUNT_CODES.bank, debitPence: bankPaid } : null,
      arAmount > 0 ? { accountCode: ACCOUNT_CODES.ar, debitPence: arAmount } : null,
      { accountCode: ACCOUNT_CODES.sales, creditPence: subtotal },
      business.vatEnabled && vatTotal > 0
        ? { accountCode: ACCOUNT_CODES.vatPayable, creditPence: vatTotal }
        : null
    ].filter(Boolean) as { accountCode: string; debitPence?: number; creditPence?: number }[];

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
