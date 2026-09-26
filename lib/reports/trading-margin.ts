import { prisma } from '@/lib/prisma';
import { evaluateMarginSet, type MarginReturnKind } from '@/lib/reports/margin-line';

export async function loadTradingPeriodMargin(input: {
  businessId: string;
  startInclusive: Date;
  endExclusive: Date;
  storeId?: string;
}) {
  const marginInvoices = await prisma.salesInvoice.findMany({
    where: {
      businessId: input.businessId,
      ...(input.storeId ? { storeId: input.storeId } : {}),
      createdAt: { gte: input.startInclusive, lt: input.endExclusive },
    },
    select: {
      paymentStatus: true,
      discountPence: true,
      salesReturn: { select: { type: true } },
      lines: {
        select: {
          lineSubtotalPence: true,
          lineDiscountPence: true,
          promoDiscountPence: true,
          lineCostPence: true,
          qtyBase: true,
          product: { select: { defaultCostBasePence: true } },
        },
      },
    },
  });

  const tradingMargin = evaluateMarginSet(marginInvoices.map((invoice) => {
    let returnKind: MarginReturnKind = 'NONE';
    if (invoice.salesReturn?.type === 'VOID' && invoice.paymentStatus === 'VOID') returnKind = 'FULL_VOID';
    else if (invoice.salesReturn?.type === 'RETURN' && invoice.paymentStatus === 'RETURNED') returnKind = 'FULL_RETURN';
    else if (invoice.salesReturn) returnKind = 'BACKUP_OR_REPLAY';
    return {
      paymentStatus: invoice.paymentStatus,
      discountPence: invoice.discountPence,
      returnKind,
      lines: invoice.lines.map((line) => ({
        lineSubtotalPence: line.lineSubtotalPence,
        lineDiscountPence: line.lineDiscountPence,
        promoDiscountPence: line.promoDiscountPence,
        lineCostPence: line.lineCostPence,
        qtyBase: line.qtyBase,
        defaultCostBasePence: line.product.defaultCostBasePence,
      })),
    };
  }));

  return {
    state: tradingMargin.state,
    grossProfitPence: tradingMargin.grossProfitPence,
    grossProfitPercent: tradingMargin.state === 'READY' ? tradingMargin.grossProfitPercent : null,
    incompleteLineCount: tradingMargin.incompleteLineCount,
  };
}
