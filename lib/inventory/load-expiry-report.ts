import { prisma } from '@/lib/prisma';
import { businessCalendarToday } from '@/lib/inventory/batch-dates';
import { buildExpiryReport, emptyExpiryCounts, type ExpiryCounts, type ExpiryReportRow } from '@/lib/inventory/expiry-report';

type ReportDb = Pick<typeof prisma, 'stockBatch' | 'inventoryBalance'>;

export async function loadExpiryReport(
  db: ReportDb,
  input: { businessId: string; storeIds: string[]; timeZone: string; now?: Date },
): Promise<{ rows: ExpiryReportRow[]; counts: ExpiryCounts }> {
  if (input.storeIds.length === 0) return { rows: [], counts: emptyExpiryCounts() };
  const batches = await db.stockBatch.findMany({
    where: { businessId: input.businessId, storeId: { in: input.storeIds } },
    select: {
      id: true,
      storeId: true,
      productId: true,
      qtyReceivedBase: true,
      productionDate: true,
      expiryDate: true,
      createdAt: true,
      source: true,
      product: { select: { name: true, defaultCostBasePence: true } },
    },
  });
  if (!batches.some((batch) => batch.expiryDate)) return { rows: [], counts: emptyExpiryCounts() };
  const productIds = [...new Set(batches.map((batch) => batch.productId))];
  const balances = await db.inventoryBalance.findMany({
    where: { storeId: { in: input.storeIds }, productId: { in: productIds } },
    select: { storeId: true, productId: true, qtyOnHandBase: true, avgCostBasePence: true },
  });
  const names = new Map(batches.map((batch) => [batch.productId, batch.product]));
  return buildExpiryReport({
    batches,
    onHand: balances,
    costs: balances.map((balance) => ({
      storeId: balance.storeId,
      productId: balance.productId,
      avgCostBasePence: balance.avgCostBasePence,
      productName: names.get(balance.productId)?.name ?? 'Product',
      defaultCostBasePence: names.get(balance.productId)?.defaultCostBasePence ?? 0,
    })),
    today: businessCalendarToday(input.now ?? new Date(), input.timeZone),
  });
}

export async function loadBusinessExpiryCounts(businessId: string, timeZone: string, now = new Date()): Promise<ExpiryCounts> {
  const stores = await prisma.store.findMany({ where: { businessId }, select: { id: true } });
  const report = await loadExpiryReport(prisma, { businessId, storeIds: stores.map((store) => store.id), timeZone, now });
  return report.counts;
}
