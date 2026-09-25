import { prisma } from '@/lib/prisma';
import { payableDocumentBalance, sumPayableBalances } from '@/lib/reports/payables-balance';
import { receivableDocumentBalance, sumReceivableBalances } from '@/lib/reports/receivables-balance';

const openStatus = { notIn: ['RETURNED', 'VOID'] as string[] };

export async function loadTradingOpenDocuments(businessId: string, storeId?: string) {
  const storeFilter = storeId ? { storeId } : {};
  const [outstandingSales, outstandingPurchases] = await Promise.all([
    prisma.salesInvoice.findMany({
      where: { businessId, ...storeFilter, paymentStatus: openStatus },
      select: {
        id: true,
        paymentStatus: true,
        totalPence: true,
        dueDate: true,
        createdAt: true,
        customer: { select: { id: true, name: true } },
        payments: { select: { amountPence: true, status: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.purchaseInvoice.findMany({
      where: { businessId, ...storeFilter, paymentStatus: openStatus },
      select: {
        paymentStatus: true,
        totalPence: true,
        payments: { select: { amountPence: true } },
      },
    }),
  ]);
  return {
    outstandingSales,
    outstandingPurchases,
    outstandingARPence: sumReceivableBalances(outstandingSales),
    outstandingAPPence: sumPayableBalances(outstandingPurchases),
  };
}

export { receivableDocumentBalance, payableDocumentBalance };
