type Invoice = { id: string; supplierId?: string | null; storeId: string; returnCreditPence?: number; creditSettledPence?: number; creditAppliedPence?: number };
type Credit = { id: string; purchaseInvoiceId: string; creditPence: number };
type Settlement = { sourceInvoiceId: string; targetInvoiceId?: string | null; amountPence: number; kind: string; supplierId: string; storeId: string };

/** Reject a backup that would restore balances without the supporting credit history. */
export function validateCreditBackup(invoices: Invoice[], credits: Credit[], settlements: Settlement[]) {
  const byId = new Map(invoices.map(invoice => [invoice.id, invoice]));
  const returned = new Map<string, number>(), used = new Map<string, number>(), applied = new Map<string, number>();
  const add = (map: Map<string, number>, id: string, amount: number) => map.set(id, (map.get(id) ?? 0) + amount);
  for (const credit of credits) {
    if (!byId.has(credit.purchaseInvoiceId) || !Number.isSafeInteger(credit.creditPence) || credit.creditPence < 0) throw new Error('Backup has an invalid purchase return credit.');
    add(returned, credit.purchaseInvoiceId, credit.creditPence);
  }
  for (const row of settlements) {
    const source = byId.get(row.sourceInvoiceId), target = row.targetInvoiceId ? byId.get(row.targetInvoiceId) : null;
    if (!source || !Number.isSafeInteger(row.amountPence) || row.amountPence <= 0 || source.supplierId !== row.supplierId || source.storeId !== row.storeId) throw new Error('Backup has an invalid supplier credit settlement.');
    if (row.kind === 'OFFSET') {
      if (!target || target.id === source.id || target.supplierId !== source.supplierId || target.storeId !== source.storeId) throw new Error('Backup credit offset does not match its supplier invoices.');
      add(applied, target.id, row.amountPence);
    } else if (!['REFUND_BANK','REFUND_CASH'].includes(row.kind) || row.targetInvoiceId) throw new Error('Backup has an invalid refund method or target.');
    add(used, source.id, row.amountPence);
  }
  for (const invoice of invoices) {
    if ((invoice.returnCreditPence ?? 0) !== (returned.get(invoice.id) ?? 0) || (invoice.creditSettledPence ?? 0) !== (used.get(invoice.id) ?? 0) || (invoice.creditAppliedPence ?? 0) !== (applied.get(invoice.id) ?? 0)) throw new Error('Backup supplier balances do not match their return and settlement history.');
  }
}
