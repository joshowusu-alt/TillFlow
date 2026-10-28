import { prisma } from '@/lib/prisma';
import { INVENTORY_VALUE_V1 } from '@/lib/inventory-value';

export const PRODUCT_HISTORY_PAGE_SIZE = 25;
export function historyPage(raw?: string): number {
  const page = Number(raw ?? 1);
  return Number.isSafeInteger(page) && page > 0 ? Math.min(page, 100000) : 1;
}
export function movementLabel(type: string): string {
  return ({ PURCHASE: 'Purchase receipt', OPENING: 'Opening stock', SALE: 'Sale', SALE_AMENDMENT: 'Sale amendment', SALES_RETURN: 'Sales return / void', PURCHASE_RETURN: 'Supplier return / void', TRANSFER_IN: 'Transfer in', TRANSFER_OUT: 'Transfer out', ADJUSTMENT: 'Stock adjustment', STOCKTAKE: 'Stocktake', ONLINE_ORDER_RESERVATION: 'Online order stock reservation', ONLINE_ORDER_RELEASE: 'Online order stock release' } as Record<string, string>)[type] ?? type.replace(/_/g, ' ').toLowerCase();
}
export function verifiedMovementValue(movement: { valuePence: number | null; costBasis: string | null }) {
  return movement.costBasis === INVENTORY_VALUE_V1 ? movement.valuePence : null;
}

/** Read-only history of one tenant-owned product in one tenant-owned branch.
 * Quantity reconciliation uses all movements, never the filtered page.
 * Old gaps are disclosed; no opening stock or historical costs are invented.
 */
export async function getProductHistory(input: { businessId: string; storeId: string; productId: string; start?: Date; endExclusive?: Date; page?: number; receiptsPage?: number }) {
  const { businessId, storeId, productId, start, endExclusive } = input;
  const [product, store] = await Promise.all([
    prisma.product.findFirst({ where: { id: productId, businessId }, select: {
      id: true, name: true, publisher: true, edition: true,
      productUnits: { where: { isBaseUnit: true }, select: { unit: { select: { name: true } } } },
      inventoryBalances: { where: { storeId }, select: { qtyOnHandBase: true } },
    } }),
    prisma.store.findFirst({ where: { id: storeId, businessId }, select: { id: true, name: true } }),
  ]);
  if (!product || !store) return null;
  const scope = { productId, storeId, product: { businessId }, store: { businessId } };
  const dateFilter = start || endExclusive ? { createdAt: { ...(start ? { gte: start } : {}), ...(endExclusive ? { lt: endExclusive } : {}) } } : {};
  const movementWhere = { ...scope, ...dateFilter };
  const receiptWhere = { productId, product: { businessId }, purchaseInvoice: { businessId, storeId, ...dateFilter } };
  const page = historyPage(String(input.page ?? 1));
  const receiptsPage = historyPage(String(input.receiptsPage ?? 1));
  const [movements, movementCount, movementTotal, receipts, receiptCount] = await Promise.all([
    prisma.stockMovement.findMany({ where: movementWhere, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * PRODUCT_HISTORY_PAGE_SIZE, take: PRODUCT_HISTORY_PAGE_SIZE, select: {
      id: true, createdAt: true, type: true, qtyBase: true, beforeQtyBase: true, afterQtyBase: true,
      valuePence: true, costBasis: true, referenceType: true, referenceId: true, user: { select: { name: true } },
    } }),
    prisma.stockMovement.count({ where: movementWhere }),
    prisma.stockMovement.aggregate({ where: scope, _sum: { qtyBase: true } }),
    prisma.purchaseInvoiceLine.findMany({ where: receiptWhere, orderBy: [{ purchaseInvoice: { createdAt: 'desc' } }, { id: 'desc' }], skip: (receiptsPage - 1) * PRODUCT_HISTORY_PAGE_SIZE, take: PRODUCT_HISTORY_PAGE_SIZE, select: {
      id: true, qtyBase: true, qtyInUnit: true, unitCostPence: true, lineSubtotalPence: true, allocatedCostPence: true,
      unit: { select: { name: true } }, purchaseInvoice: { select: { id: true, createdAt: true, transactionNumber: true, supplierInvoiceNumber: true, paymentStatus: true, supplier: { select: { name: true } } } },
    } }),
    prisma.purchaseInvoiceLine.count({ where: receiptWhere }),
  ]);
  const ids = (types: string[]) => [...new Set(movements.filter(row => row.referenceId && types.includes(row.referenceType ?? '')).map(row => row.referenceId!))];
  const purchaseIds = ids(['PURCHASE_INVOICE', 'OPENING_STOCK']);
  const saleIds = ids(['SALES_INVOICE']);
  const saleReturnIds = ids(['SALES_RETURN']);
  const purchaseReturnIds = ids(['PURCHASE_RETURN']);
  const adjustmentIds = ids(['STOCK_ADJUSTMENT']);
  const transferIds = ids(['STOCK_TRANSFER']);
  const [purchases, sales, salesReturns, purchaseReturns, adjustments, transfers] = await Promise.all([
    purchaseIds.length ? prisma.purchaseInvoice.findMany({ where: { id: { in: purchaseIds }, businessId, storeId, lines: { some: { productId } } }, select: { id: true, transactionNumber: true, supplier: { select: { name: true } } } }) : [],
    saleIds.length ? prisma.salesInvoice.findMany({ where: { id: { in: saleIds }, businessId, storeId, lines: { some: { productId } } }, select: { id: true, transactionNumber: true } }) : [],
    saleReturnIds.length ? prisma.salesReturn.findMany({ where: { id: { in: saleReturnIds }, storeId, salesInvoice: { businessId, lines: { some: { productId } } } }, select: { id: true, reason: true, salesInvoice: { select: { id: true, transactionNumber: true } } } }) : [],
    purchaseReturnIds.length ? prisma.purchaseReturn.findMany({ where: { id: { in: purchaseReturnIds }, storeId, purchaseInvoice: { businessId, lines: { some: { productId } } } }, select: { id: true, reason: true, purchaseInvoice: { select: { id: true, transactionNumber: true, supplier: { select: { name: true } } } } } }) : [],
    adjustmentIds.length ? prisma.stockAdjustment.findMany({ where: { id: { in: adjustmentIds }, storeId, productId, store: { businessId } }, select: { id: true, transactionNumber: true, reason: true } }) : [],
    transferIds.length ? prisma.stockTransfer.findMany({ where: { id: { in: transferIds }, businessId, lines: { some: { productId } }, OR: [{ fromStoreId: storeId }, { toStoreId: storeId }] }, select: { id: true, reason: true, fromStore: { select: { name: true } }, toStore: { select: { name: true } } } }) : [],
  ]);
  const sources = new Map<string, { label: string; href?: string; detail?: string }>();
  const creditIds = ids(['PURCHASE_RETURN_CREDIT']);
  const credits = creditIds.length ? await prisma.purchaseReturnCredit.findMany({ where: { id: { in: creditIds }, businessId, storeId, purchaseInvoice: { lines: { some: { productId } } } }, select: { id: true, reason: true, purchaseInvoice: { select: { id: true, transactionNumber: true } } } }) : [];
  credits.forEach(credit => sources.set(`PURCHASE_RETURN_CREDIT:${credit.id}`, { label: credit.purchaseInvoice.transactionNumber ?? credit.purchaseInvoice.id, href: `/purchases/partial-return/${encodeURIComponent(credit.purchaseInvoice.id)}`, detail: credit.reason }));
  purchases.forEach(row => sources.set(`PURCHASE_INVOICE:${row.id}`, { label: row.transactionNumber ?? row.id, href: `/purchases/${encodeURIComponent(row.id)}`, detail: row.supplier?.name ?? 'No supplier recorded' }));
  purchases.forEach(row => sources.set(`OPENING_STOCK:${row.id}`, { label: row.transactionNumber ?? row.id, href: `/purchases/${encodeURIComponent(row.id)}`, detail: row.supplier?.name ?? 'Opening stock purchase' }));
  sales.forEach(row => sources.set(`SALES_INVOICE:${row.id}`, { label: row.transactionNumber ?? row.id, href: `/sales/${encodeURIComponent(row.id)}` }));
  salesReturns.forEach(row => sources.set(`SALES_RETURN:${row.id}`, { label: row.salesInvoice.transactionNumber ?? row.salesInvoice.id, href: `/sales/${encodeURIComponent(row.salesInvoice.id)}`, detail: row.reason ?? 'Sales return / void' }));
  purchaseReturns.forEach(row => sources.set(`PURCHASE_RETURN:${row.id}`, { label: row.purchaseInvoice.transactionNumber ?? row.purchaseInvoice.id, href: `/purchases/${encodeURIComponent(row.purchaseInvoice.id)}`, detail: [row.purchaseInvoice.supplier?.name, row.reason].filter(Boolean).join(' · ') }));
  adjustments.forEach(row => sources.set(`STOCK_ADJUSTMENT:${row.id}`, { label: row.transactionNumber ?? row.id, href: `/inventory/adjustments?${new URLSearchParams({ adjustmentId: row.id, storeId })}`, detail: row.reason ?? 'Stock adjustment' }));
  transfers.forEach(row => sources.set(`STOCK_TRANSFER:${row.id}`, { label: row.id, href: `/transfers?${new URLSearchParams({ transferId: row.id })}`, detail: `${row.fromStore.name} → ${row.toStore.name}${row.reason ? ` · ${row.reason}` : ''}` }));
  const currentQty = product.inventoryBalances[0]?.qtyOnHandBase ?? 0;
  const recordedMovementQty = movementTotal._sum.qtyBase ?? 0;
  return { product, store, currentQty, recordedMovementQty, reconciliationDifference: currentQty - recordedMovementQty, movementCount, receiptCount, page, receiptsPage, receipts,
    movements: movements.map(row => ({ ...row, label: movementLabel(row.type), verifiedValuePence: verifiedMovementValue(row), source: sources.get(`${row.referenceType}:${row.referenceId}`) ?? { label: row.referenceId ?? 'No source recorded' } })),
  };
}
