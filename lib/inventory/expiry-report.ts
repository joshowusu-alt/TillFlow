import type { BusinessPlan } from '@/lib/features';
import { hasPlanAccess } from '@/lib/features';
import { calendarDaysUntil } from '@/lib/inventory/batch-dates';
import { allocateBatchRemaining, type BatchReceiptForAllocation, type OnHandForAllocation } from '@/lib/inventory/batch-remaining';

export type ExpiryWindow = 'all' | 'expired' | '7' | '14';

export type ExpiryCounts = {
  expired: number;
  within7: number;
  within14: number;
};

export type ExpiryBatchInput = BatchReceiptForAllocation & {
  expiryDate: Date | null;
  productionDate?: Date | null;
  source?: string;
};

export type ExpiryCostInput = {
  storeId: string;
  productId: string;
  avgCostBasePence: number;
  productName: string;
  defaultCostBasePence?: number;
};

export type ExpiryReportRow = {
  batchId: string;
  storeId: string;
  productId: string;
  productName: string;
  qtyReceivedBase: number;
  estimatedQtyBase: number;
  productionDate: Date | null;
  expiryDate: Date;
  daysLeft: number;
  bucket: 'expired' | 'within7' | 'within8to14';
  valueAtRiskPence: number;
  source: string;
};

export function expiryTrackingEnabled(plan: BusinessPlan): boolean {
  return hasPlanAccess(plan, 'GROWTH');
}

export function shouldShowExpiringSoonCard(plan: BusinessPlan, counts: ExpiryCounts): boolean {
  return expiryTrackingEnabled(plan) && (counts.expired > 0 || counts.within14 > 0);
}

export function formatExpiringSoonDescription(counts: ExpiryCounts): string {
  const expired = `${counts.expired} already expired`;
  const week = `${counts.within7} within 7 days`;
  const fortnight = `${counts.within14} within 14 days`;
  return `${expired}, ${week}, ${fortnight}`;
}

export function emptyExpiryCounts(): ExpiryCounts {
  return { expired: 0, within7: 0, within14: 0 };
}

function bucketFor(daysLeft: number): ExpiryReportRow['bucket'] | 'later' {
  if (daysLeft < 0) return 'expired';
  if (daysLeft <= 7) return 'within7';
  if (daysLeft <= 14) return 'within8to14';
  return 'later';
}

export function buildExpiryReport(input: {
  batches: ExpiryBatchInput[];
  onHand: OnHandForAllocation[];
  costs: ExpiryCostInput[];
  today: Date;
}): { rows: ExpiryReportRow[]; counts: ExpiryCounts } {
  const allocation = allocateBatchRemaining(input.batches, input.onHand);
  const costs = new Map(input.costs.map((row) => [`${row.storeId}\u0000${row.productId}`, row]));
  const rows: ExpiryReportRow[] = [];

  for (const batch of input.batches) {
    if (!batch.expiryDate) continue;
    const estimatedQtyBase = allocation.remainingByBatchId.get(batch.id) ?? 0;
    if (estimatedQtyBase <= 0) continue;
    const daysLeft = calendarDaysUntil(batch.expiryDate, input.today);
    const bucket = bucketFor(daysLeft);
    if (bucket === 'later') continue;
    const cost = costs.get(`${batch.storeId}\u0000${batch.productId}`);
    const unitCost = cost && cost.avgCostBasePence > 0
      ? cost.avgCostBasePence
      : Math.max(0, cost?.defaultCostBasePence ?? 0);
    rows.push({
      batchId: batch.id,
      storeId: batch.storeId,
      productId: batch.productId,
      productName: cost?.productName ?? 'Product',
      qtyReceivedBase: batch.qtyReceivedBase,
      estimatedQtyBase,
      productionDate: batch.productionDate ?? null,
      expiryDate: batch.expiryDate,
      daysLeft,
      bucket,
      valueAtRiskPence: estimatedQtyBase * unitCost,
      source: batch.source ?? '',
    });
  }

  rows.sort((a, b) => a.expiryDate.getTime() - b.expiryDate.getTime() || a.productName.localeCompare(b.productName));
  return { rows, counts: countExpiryRows(rows) };
}

export function countExpiryRows(rows: Array<Pick<ExpiryReportRow, 'bucket'>>): ExpiryCounts {
  const counts = emptyExpiryCounts();
  for (const row of rows) {
    if (row.bucket === 'expired') counts.expired += 1;
    if (row.bucket === 'within7') counts.within7 += 1;
    if (row.bucket === 'within7' || row.bucket === 'within8to14') counts.within14 += 1;
  }
  return counts;
}

export function filterExpiryRows(rows: ExpiryReportRow[], window: ExpiryWindow): ExpiryReportRow[] {
  if (window === 'expired') return rows.filter((row) => row.bucket === 'expired');
  if (window === '7') return rows.filter((row) => row.bucket === 'within7');
  if (window === '14') return rows.filter((row) => row.bucket === 'within7' || row.bucket === 'within8to14');
  return rows;
}

export function formatDaysLeft(daysLeft: number): string {
  if (daysLeft < 0) {
    const days = Math.abs(daysLeft);
    return days === 1 ? 'Expired 1 day ago' : `Expired ${days} days ago`;
  }
  if (daysLeft === 0) return 'Expires today';
  if (daysLeft === 1) return '1 day left';
  return `${daysLeft} days left`;
}
