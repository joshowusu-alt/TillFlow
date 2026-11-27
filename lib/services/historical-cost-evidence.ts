import { INVENTORY_VALUE_V1, UNVERIFIED_STOCK_V1 } from '@/lib/inventory-value';

type Source = { id: string; label: string; qty: number; value: number; journalMatches: boolean; date?: Date; opening?: { movementId: string; date: Date; needsValue: boolean; before: { valuePence: number | null; unitCostBasePence: number | null; costBasis: string | null } } };
type Movement = { id: string; date: Date; type: string; referenceType: string | null; referenceId: string | null; qty: number; value: number | null; basis: string | null; unitCost?: number | null; before: number | null; after: number | null };
type Sale = { id: string; label: string; date: Date; lines: { id: string; qty: number; cost: number; basis: string | null }[]; journalMatches: boolean; eligible: boolean };
type Credit = { id: string; purchaseId: string; qty: number; value: number; journalMatches: boolean };
export type HistoricalCostEvidence = { balance: { qty: number; knownValue: number | null; unvalued: number | null }; purchases: Source[]; opening?: Source; movements: Movement[]; sales: Sale[]; credits: Credit[] };
type Correction = { invoiceId: string; movementId: string; lineId: string; receipt: string; date: Date; qty: number; recordedCost: number; proposedCost: number; previousUnitCost?: number | null };
type Result = { status: 'REVIEWABLE'; source: Source; unitCost: number; stockValue: number; corrections: Correction[]; cogsDelta: number } | { status: 'BLOCKED'; reason: string };

/**
 * Deliberately narrow proof: a complete, single-source, evenly divisible cost
 * trail from zero stock through purchases, sales and documented supplier credits.
 * No catalogue or rounded average cost is accepted as evidence. No writes.
 */
export function previewHistoricalCost(evidence: HistoricalCostEvidence): Result {
  const blocked = (reason: string): Result => ({ status: 'BLOCKED', reason });
  const { balance, purchases, movements, sales, credits } = evidence;
  if (purchases.length !== 1 && !(purchases.length === 0 && evidence.opening)) return blocked('A single original purchase or opening stock record must be established.');
  if (purchases.length && evidence.opening) return blocked('Mixed stock sources need a separate review.');
  const source = purchases[0] ?? evidence.opening!;
  const integer = (n: number) => Number.isSafeInteger(n) && n >= 0 && n <= 2147483647;
  if (!integer(source.qty) || source.qty === 0 || !integer(source.value) || source.value === 0 || source.value % source.qty !== 0 || !source.journalMatches)
    return blocked('Original purchase quantity, exact unit cost or inventory journal does not reconcile.');
  const unitCost = source.value / source.qty;
  if ((balance.knownValue !== null && !(source.opening?.needsValue && balance.knownValue === 0 && balance.unvalued === balance.qty)) || (balance.unvalued !== null && balance.unvalued !== balance.qty))
    return blocked('Partly valued or already confirmed stock needs a separate review.');
  const seen = new Set<string>();
  let quantity = 0;
  let cogsDelta = 0;
  let sourceSeen = false;
  const corrections: Correction[] = [];
  for (const m of movements) {
    if (!m.referenceId || !m.referenceType || !Number.isSafeInteger(m.qty) || m.qty === 0) return blocked('A stock movement has no usable source or quantity.');
    // Unverified opening-stock sales may carry a catalogue hint, not an established cost.
    if (!(source.opening?.needsValue && m.type === 'SALE' && m.basis === UNVERIFIED_STOCK_V1 && m.value === null) && m.unitCost != null && m.unitCost !== unitCost) return blocked('A recorded movement unit cost conflicts with the purchase evidence.');
    const key = m.referenceType + ':' + m.referenceId;
    if (seen.has(key)) return blocked('Multiple movements for the same source require allocation review.');
    seen.add(key);
    if (m.before !== null && m.before !== quantity) return blocked('Recorded stock history contains a quantity gap.');
    const matchesOpening = source.opening && m.id === source.opening.movementId && m.type === 'OPENING' && m.referenceType === 'OPENING_BALANCE_INVENTORY' && (source.opening.needsValue ? m.value === null && m.unitCost == null && m.basis === null : m.value === source.value);
    const matchesPurchase = !source.opening && m.type === 'PURCHASE' && m.referenceType === 'PURCHASE_INVOICE' && (m.basis === null || m.basis === INVENTORY_VALUE_V1) && (m.basis !== INVENTORY_VALUE_V1 || m.value === source.value) && (m.value === null || m.value === source.value);
    if ((matchesOpening || matchesPurchase) && m.referenceId === source.id && !sourceSeen && quantity === 0 && m.qty === source.qty) {
      sourceSeen = true;
    } else if (!source.opening && sourceSeen && m.type === 'PURCHASE_RETURN' && m.referenceType === 'PURCHASE_RETURN_CREDIT' && m.qty < 0) {
      const credit = credits.find(c => c.id === m.referenceId);
      if (!credit || credit.purchaseId !== source.id || credit.qty !== -m.qty || credit.value !== -m.qty * unitCost || m.value !== -credit.value || m.basis !== INVENTORY_VALUE_V1 || !credit.journalMatches)
        return blocked('A supplier credit does not match the original purchase, movement and inventory journal.');
    } else if (sourceSeen && m.type === 'SALE' && m.referenceType === 'SALES_INVOICE' && m.qty < 0) {
      const sale = sales.find(s => s.id === m.referenceId);
      if (!sale || !sale.eligible || !sale.journalMatches || sale.lines.length !== 1 || sale.lines[0].qty !== -m.qty || (source.opening && sale.date < source.opening.date))
        return blocked('A sale, its quantity, return status or posted cost journal does not reconcile.');
      const line = sale.lines[0];
      const expectedCost = line.qty * unitCost;
      if (!integer(expectedCost)) return blocked('Proposed cost exceeds the supported amount.');
      if (line.basis === UNVERIFIED_STOCK_V1) {
        if (line.cost !== 0 || m.basis !== UNVERIFIED_STOCK_V1 || m.value !== null)
          return blocked('An unverified sale already contains a conflicting cost or stock value.');
        corrections.push({ invoiceId: sale.id, movementId: m.id, lineId: line.id, receipt: sale.label, date: sale.date, qty: line.qty, recordedCost: line.cost, proposedCost: expectedCost, ...(source.opening?.needsValue ? {previousUnitCost:m.unitCost??null} : {}) });
        cogsDelta += expectedCost;
      } else if (line.cost !== expectedCost || (m.basis !== null && m.basis !== INVENTORY_VALUE_V1) || (line.basis !== null && line.basis !== INVENTORY_VALUE_V1) || (m.value !== null && m.value !== -expectedCost) || (line.basis === INVENTORY_VALUE_V1 && m.value !== -expectedCost)) {
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
  if (source.opening?.needsValue && corrections.length === 0) return blocked('No earlier sales are missing a cost.');
  return { status: 'REVIEWABLE', source, unitCost, stockValue: quantity * unitCost, corrections, cogsDelta };
}
