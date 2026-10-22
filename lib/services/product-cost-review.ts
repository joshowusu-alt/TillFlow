import { prisma } from '@/lib/prisma';
import { INVENTORY_VALUE_V1, UNVERIFIED_STOCK_V1 } from '@/lib/inventory-value';

export const COST_REVIEW_PAGE_SIZE = 25;

/** Evidence only. Today's catalogue cost never establishes a historical value. */
export async function getProductCostReview(businessId: string, productId: string, page = 1) {
  const product = await prisma.product.findFirst({
    where: { id: productId, businessId },
    select: {
      id: true, name: true, publisher: true, edition: true, defaultCostBasePence: true,
      inventoryBalances: {
        where: { store: { businessId } },
        select: { qtyOnHandBase: true, avgCostBasePence: true, knownValuePence: true, unvaluedQtyBase: true, store: { select: { id: true, name: true } } },
        orderBy: { store: { name: 'asc' } },
      },
    },
  });
  if (!product) return null;
  const where = {
    productId, product: { businessId },
    salesInvoice: { businessId, store: { businessId }, paymentStatus: { notIn: ['RETURNED', 'VOID'] } },
    OR: [
      { costBasis: UNVERIFIED_STOCK_V1 },
      { lineCostPence: { lte: 0 }, OR: [{ costBasis: null }, { costBasis: { not: INVENTORY_VALUE_V1 } }] },
    ],
  };
  const [saleCount, sales, receipts] = await Promise.all([
    prisma.salesInvoiceLine.count({ where }),
    prisma.salesInvoiceLine.findMany({
      where, orderBy: [{ salesInvoice: { createdAt: 'desc' } }, { id: 'desc' }], skip: (page - 1) * COST_REVIEW_PAGE_SIZE, take: COST_REVIEW_PAGE_SIZE,
      select: { id: true, qtyBase: true, salesInvoice: { select: { id: true, transactionNumber: true, createdAt: true, store: { select: { name: true } } } } },
    }),
    prisma.purchaseInvoiceLine.findMany({
      where: { productId, product: { businessId }, purchaseInvoice: { businessId, store: { businessId }, paymentStatus: { notIn: ['VOID', 'RETURNED'] } } },
      orderBy: [{ purchaseInvoice: { createdAt: 'desc' } }, { id: 'desc' }], take: 10,
      select: { id: true, qtyBase: true, lineSubtotalPence: true, allocatedCostPence: true, purchaseInvoice: { select: { id: true, transactionNumber: true, createdAt: true, store: { select: { name: true } }, supplier: { select: { name: true } } } } },
    }),
  ]);
  return { product, saleCount, sales, receipts, page };
}
