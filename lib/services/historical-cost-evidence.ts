import { INVENTORY_VALUE_V1, UNVERIFIED_STOCK_V1 } from '@/lib/inventory-value';

type Source = { id: string; label: string; qty: number; value: number; journalMatches: boolean };
type Movement = { id: string; date: Date; type: string; referenceType: string | null; referenceId: string | null; qty: number; value: number | null; basis: string | null; before: number | null; after: number | null };
type Sale = { id: string; label: string; date: Date; lines: { id: string; qty: number; cost: number; basis: string | null }[]; journalMatches: boolean; eligible: boolean };
type Credit = { id: string; purchaseId: string; qty: number; value: number; journalMatches: boolean };
export type HistoricalCostEvidence = { balance: { qty: number; knownValue: number | null; unvalued: number | null }; purchases: Source[]; movements: Movement[]; sales: Sale[]; credits: Credit[] };
type Correction = { lineId: string; receipt: string; date: Date; qty: number; recordedCost: number; proposedCost: number };
type Result = { status: 'REVIEWABLE'; source: Source; unitCost: number; stockValue: number; corrections: Correction[]; cogsDelta: number } | { status: 'BLOCKED'; reason: string };

/**
 * Deliberately narrow proof: a complete, single-source, evenly divisible cost
 * trail from zero stock through purchases, sales and documented supplier credits.
 * No catalogue or rounded average cost is accepted as evidence. No writes.
 */
export function previewHistoricalCost(evidence: HistoricalCostEvidence): Result {
  const blocked = (reason: string): Result => ({ status: 'BLOCKED', reason });
  const { balance, purchases, movements, sales, credits } = evidence;
  if (purchases.length !== 1) return blocked('A single original purchase must be established; mixed or absent sources need manual reconciliation.');
  const source = purchases[0];
  const integer = (n: number) => Number.isSafeInteger(n) && n >= 0 && n <= 2147483647;
  if (!integer(source.qty) || source.qty === 0 || !integer(source.value) || source.value % source.qty !== 0 || !source.journalMatches)
    return blocked('Original purchase quantity, exact unit cost or inventory journal does not reconcile.');
  const unitCost = source.value / source.qty;
  if (balance.knownValue !== null || (balance.unvalued !== null && balance.unvalued !== balance.qty))
    return blocked('Partially valued or already confirmed stock requires a separate reconciliation.');
  const seen = new Set<string>();
  let quantity = 0;
  let cogsDelta = 0;
  let sourceSeen = false;
  const corrections: Correction[] = [];
  for (const m of movements) {
    if (!m.referenceId || !m.referenceType || !Number.isSafeInteger(m.qty) || m.qty === 0) return blocked('A stock movement has no usable source or quantity.');
    const key = m.referenceType + ':' + m.referenceId;
    if (seen.has(key)) return blocked('Multiple movements for the same source require allocation review.');
    seen.add(key);
    if (m.before !== null && m.before !== quantity) return blocked('Recorded stock history contains a quantity gap.');
    if (m.type === 'PURCHASE' && m.referenceType === 'PURCHASE_INVOICE' && m.referenceId === source.id && !sourceSeen && quantity === 0 && m.qty === source.qty && (m.value === null || m.value === source.value)) {
      sourceSeen = true;
    } else if (sourceSeen && m.type === 'PURCHASE_RETURN' && m.referenceType === 'PURCHASE_RETURN_CREDIT' && m.qty < 0) {
      const credit = credits.find(c => c.id === m.referenceId);
      if (!credit || credit.purchaseId !== source.id || credit.qty !== -m.qty || credit.value !== -m.qty * unitCost || m.value !== -credit.value || !credit.journalMatches)
        return blocked('A supplier credit does not match the original purchase, movement and inventory journal.');
    } else if (sourceSeen && m.type === 'SALE' && m.referenceType === 'SALES_INVOICE' && m.qty < 0) {
      const sale = sales.find(s => s.id === m.referenceId);
      if (!sale || !sale.eligible || !sale.journalMatches || sale.lines.length !== 1 || sale.lines[0].qty !== -m.qty)
        return blocked('A sale, its quantity, return status or posted cost journal does not reconcile.');
      const line = sale.lines[0];
      const expectedCost = line.qty * unitCost;
      if (!integer(expectedCost)) return blocked('Proposed cost exceeds the supported amount.');
      if (line.basis === UNVERIFIED_STOCK_V1) {
        if (line.cost !== 0 || m.basis !== UNVERIFIED_STOCK_V1 || m.value !== null)
          return blocked('An unverified sale already contains a conflicting cost or stock value.');
        corrections.push({ lineId: line.id, receipt: sale.label, date: sale.date, qty: line.qty, recordedCost: line.cost, proposedCost: expectedCost });
        cogsDelta += expectedCost;
      } else if (line.cost !== expectedCost || (line.basis !== null && line.basis !== INVENTORY_VALUE_V1) || (m.value !== null && m.value !== -expectedCost) || (line.basis === INVENTORY_VALUE_V1 && m.value !== -expectedCost)) {
        return blocked('A previously costed sale conflicts with the original cost evidence.');
      }
    } else return blocked('Stock history includes movements outside the supported single-purchase workflow.');
    quantity += m.qty;
    if (!integer(quantity) || (m.after !== null && m.after !== quantity)) return blocked('Recorded movement quantities do not reconcile.');
  }
  if (!sourceSeen || quantity !== balance.qty || !integer(quantity * unitCost) || !integer(cogsDelta))
    return blocked('The reconstructed stock quantity or value does not match the current balance.');
  if (sales.some(s => !seen.has('SALES_INVOICE:' + s.id)) || credits.some(c => !seen.has('PURCHASE_RETURN_CREDIT:' + c.id)))
    return blocked('Source sales or credits are missing corresponding stock movements.');
  return { status: 'REVIEWABLE', source, unitCost, stockValue: quantity * unitCost, corrections, cogsDelta };
}
