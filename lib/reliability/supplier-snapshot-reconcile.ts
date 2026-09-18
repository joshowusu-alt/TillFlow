import { computeOutstandingBalance } from '@/lib/accounting';
import { bucketForDueDate, type AgingBucket } from '@/lib/reliability/walkthrough-contracts';

export type SnapshotInvoice = {
  id: string;
  supplierId: string | null;
  dueDate: Date | null;
  totalPence: number;
  paymentStatus?: string;
  payments: { amountPence: number }[];
};

export type SupplierSnapshotReconcile = {
  supplierAttributedOutstandingPence: number;
  orphanCreditOutstandingPence: number;
  ageingAttributedPence: number;
  dueDateMissingPence: number;
  genuineDifferencePence: number;
  explanations: string[];
};

/**
 * Read-only same-snapshot reconciliation. Does not mutate records.
 * KPI / ageing / unpaid-purchase totals should match supplierAttributedOutstandingPence
 * when they exclude orphans the same way.
 */
export function reconcileSupplierSnapshot(
  invoices: SnapshotInvoice[],
  asOf: Date,
): SupplierSnapshotReconcile {
  let supplierAttributedOutstandingPence = 0;
  let orphanCreditOutstandingPence = 0;
  let ageingAttributedPence = 0;
  let dueDateMissingPence = 0;
  const buckets: Record<AgingBucket, number> = {
    NOT_YET_DUE: 0,
    D1_30: 0,
    D31_60: 0,
    D61_90: 0,
    OVER_90: 0,
    DUE_DATE_MISSING: 0,
  };

  for (const invoice of invoices) {
    const outstanding = computeOutstandingBalance(invoice);
    if (outstanding <= 0) continue;
    if (!invoice.supplierId) {
      orphanCreditOutstandingPence += outstanding;
      continue;
    }
    supplierAttributedOutstandingPence += outstanding;
    const bucket = bucketForDueDate(asOf, invoice.dueDate);
    buckets[bucket] += outstanding;
    ageingAttributedPence += outstanding;
    if (bucket === 'DUE_DATE_MISSING') dueDateMissingPence += outstanding;
  }

  const explanations: string[] = [];
  if (orphanCreditOutstandingPence > 0) {
    explanations.push('Credit purchases without suppliers are excluded from supplier-specific totals.');
  }
  if (dueDateMissingPence > 0) {
    explanations.push('Balances with a missing due date are in DUE_DATE_MISSING, not Not yet due.');
  }

  return {
    supplierAttributedOutstandingPence,
    orphanCreditOutstandingPence,
    ageingAttributedPence,
    dueDateMissingPence,
    genuineDifferencePence: supplierAttributedOutstandingPence - ageingAttributedPence,
    explanations,
  };
}
