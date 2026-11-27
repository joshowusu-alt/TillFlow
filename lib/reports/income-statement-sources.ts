import type { Prisma } from '@prisma/client';
import type { PostedRecordSource } from './income-statement-breakdown';

type JournalReference = { id: string; referenceType: string | null; referenceId: string | null };
const adjustmentReasons: Record<string, string> = {
  STOCK_FOUND: 'Stock found', PHYSICAL_COUNT_SURPLUS: 'Physical count surplus',
  WASTAGE: 'Waste', EXPIRED: 'Expired stock', DAMAGED: 'Damaged stock',
  THEFT: 'Recorded theft reason', STOCKTAKE_SHORTFALL: 'Stock count shortfall',
  AUTHORISED_QUANTITY_CORRECTION: 'Authorised quantity correction',
};
function batches(ids: string[]) {
  return Array.from({ length: Math.ceil(ids.length / 400) }, (_, i) => ids.slice(i * 400, i * 400 + 400));
}

/** Read-only source metadata; journal line amounts and classifications remain authoritative. */
export async function loadIncomeStatementSources(db: Prisma.TransactionClient, businessId: string, journals: JournalReference[]) {
  const ids = (type: string) => [...new Set(journals.filter(j => j.referenceType === type && j.referenceId).map(j => j.referenceId!))];
  const [expenses, adjustments] = await Promise.all([
    Promise.all(batches(ids('EXPENSE')).map(batch => db.expense.findMany({
      where: { businessId, store: { businessId }, id: { in: batch } },
      select: { id: true, transactionNumber: true, notes: true, vendorName: true, reference: true, store: { select: { name: true } } },
    }))).then(rows => rows.flat()),
    Promise.all(batches(ids('STOCK_ADJUSTMENT')).map(batch => db.stockAdjustment.findMany({
      where: { id: { in: batch }, store: { businessId }, product: { businessId } },
      select: { id: true, transactionNumber: true, reason: true, reasonCode: true, reversalOfId: true, product: { select: { name: true } }, store: { select: { name: true } } },
    }))).then(rows => rows.flat()),
  ]);
  const expenseMap = new Map(expenses.map(row => [row.id, row]));
  const adjustmentMap = new Map(adjustments.map(row => [row.id, row]));
  const sources = new Map<string, PostedRecordSource>();
  for (const journal of journals) {
    const expense = journal.referenceType === 'EXPENSE' && journal.referenceId ? expenseMap.get(journal.referenceId) : undefined;
    const adjustment = journal.referenceType === 'STOCK_ADJUSTMENT' && journal.referenceId ? adjustmentMap.get(journal.referenceId) : undefined;
    if (expense) {
      sources.set(journal.id, { title: expense.notes?.trim() || 'Recorded expense', reference: expense.transactionNumber || expense.reference,
        details: [expense.vendorName ? 'Payee: ' + expense.vendorName : '', 'Branch: ' + expense.store.name].filter(Boolean) });
    } else if (adjustment) {
      const reason = adjustment.reasonCode && Object.prototype.hasOwnProperty.call(adjustmentReasons, adjustment.reasonCode) ? adjustmentReasons[adjustment.reasonCode] : 'Stock adjustment';
      sources.set(journal.id, { title: adjustment.reversalOfId ? 'Stock adjustment reversal' : reason, reference: adjustment.transactionNumber,
        details: ['Product: ' + adjustment.product.name, 'Branch: ' + adjustment.store.name, ...(adjustment.reason ? ['Recorded reason: ' + adjustment.reason] : [])], nonCash: true });
    } else {
      sources.set(journal.id, { title: 'Posted accounting entry', reference: journal.id, details: [journal.referenceId ? 'Linked source details unavailable here.' : 'No source document linked.'] });
    }
  }
  return sources;
}
