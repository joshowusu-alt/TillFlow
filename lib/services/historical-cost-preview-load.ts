import { prisma } from '@/lib/prisma';
import { ACCOUNT_CODES } from '@/lib/accounting';
import { previewHistoricalCost } from './historical-cost-evidence';

const LIMIT = 500;
type CreditLine = { lineId: string; productId: string; qtyBase: number; netPence: number };
function creditLines(json: string): CreditLine[] | null {
  try {
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed) || !parsed.every(row => row && typeof row.lineId === 'string' && typeof row.productId === 'string' && Number.isSafeInteger(row.qtyBase) && row.qtyBase > 0 && Number.isSafeInteger(row.netPence) && row.netPence >= 0)) return null;
    return parsed;
  } catch { return null; }
}
export async function loadHistoricalCostPreview(businessId: string, productId: string, storeId: string) {
  return prisma.$transaction(async tx => {
    const product = await tx.product.findFirst({ where: { id: productId, businessId }, select: { name: true, foodDish: { select: { id: true } } } });
    const store = await tx.store.findFirst({ where: { id: storeId, businessId }, select: { name: true } });
    if (!product || !store) return null;
    const block = (reason: string) => ({ product: product.name, store: store.name, result: { status: 'BLOCKED' as const, reason } });
    if (product.foodDish) return block('Prepared dishes require a separate ingredient cost review.');
    const [balance, movements, purchaseRows, saleRows] = await Promise.all([
      tx.inventoryBalance.findFirst({ where: { productId, storeId }, select: { qtyOnHandBase: true, knownValuePence: true, unvaluedQtyBase: true } }),
      tx.stockMovement.findMany({ where: { productId, storeId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: LIMIT + 1 }),
      tx.purchaseInvoice.findMany({ where: { businessId, storeId, lines: { some: { productId } } }, include: { lines: true, returnCredits: true, purchaseReturn: true }, take: 2 }),
      tx.salesInvoice.findMany({ where: { businessId, storeId, lines: { some: { productId } } }, include: { lines: true, salesReturn: true }, take: LIMIT + 1 }),
    ]);
    if (!balance) return block('No stock balance exists for this branch.');
    if (movements.length > LIMIT || saleRows.length > LIMIT) return block('This history exceeds the automatic preview limit; review it in a separate reconciliation.');
    if (purchaseRows.length !== 1 || purchaseRows[0].purchaseReturn || ['VOID', 'RETURNED'].includes(purchaseRows[0].paymentStatus))
      return block('A single active original purchase is required.');
    const purchase = purchaseRows[0];
    const sourceLines = purchase.lines.filter(line => line.productId === productId);
    if (sourceLines.length !== 1) return block('The original purchase must have one identifiable product line.');
    const source = sourceLines[0];
    if (purchase.returnCredits.length > LIMIT) return block('Too many supplier credits for automatic preview.');
    const references = [purchase.id, ...purchase.returnCredits.map(c => c.id), ...saleRows.map(s => s.id)];
    const journals = await tx.journalEntry.findMany({
      where: { businessId, referenceId: { in: references } },
      select: { referenceId: true, referenceType: true, lines: { select: { debitPence: true, creditPence: true, account: { select: { code: true, businessId: true } } } } },
      take: LIMIT * 4 + 1,
    });
    if (journals.length > LIMIT * 4) return block('Too many journal entries for automatic preview.');
    const journalMatches = (id: string, type: string, inventory: number, cogs: number) => {
      const rows = journals.filter(row => row.referenceId === id);
      const matching = rows.filter(row => row.referenceType === type);
      if (matching.length !== 1) return false;
      if (rows.some(row => row !== matching[0] && row.lines.some(line => [ACCOUNT_CODES.inventory, ACCOUNT_CODES.cogs].includes(line.account.code)))) return false;
      const lines = matching[0].lines;
      if (lines.some(line => line.account.businessId !== businessId)) return false;
      const net = (code: string) => lines.filter(line => line.account.code === code).reduce((sum, line) => sum + line.debitPence - line.creditPence, 0);
      return lines.reduce((sum, line) => sum + line.debitPence - line.creditPence, 0) === 0 && net(ACCOUNT_CODES.inventory) === inventory && net(ACCOUNT_CODES.cogs) === cogs;
    };
    const credits = [];
    for (const credit of purchase.returnCredits) {
      if (credit.businessId !== businessId || credit.storeId !== storeId) return block('Supplier credit scope does not match the purchase.');
      const lines = creditLines(credit.linesJson);
      if (!lines) return block('A supplier credit has unreadable source evidence.');
      const selected = lines.filter(line => line.productId === productId);
      if (!selected.length) continue;
      if (selected.some(line => line.lineId !== source.id)) return block('A supplier credit points to a different purchase line.');
      const total = lines.reduce((sum, line) => sum + line.netPence, 0);
      credits.push({ id: credit.id, purchaseId: purchase.id, qty: selected.reduce((sum, line) => sum + line.qtyBase, 0), value: selected.reduce((sum, line) => sum + line.netPence, 0), journalMatches: journalMatches(credit.id, 'PURCHASE_RETURN_CREDIT', -total, 0) });
    }
    const result = previewHistoricalCost({
      balance: { qty: balance.qtyOnHandBase, knownValue: balance.knownValuePence, unvalued: balance.unvaluedQtyBase },
      purchases: [{ id: purchase.id, label: purchase.transactionNumber ?? purchase.id, qty: source.qtyBase, value: source.lineSubtotalPence + source.allocatedCostPence,
        journalMatches: journalMatches(purchase.id, 'PURCHASE_INVOICE', purchase.lines.reduce((sum, line) => sum + line.lineSubtotalPence + line.allocatedCostPence, 0), 0) }],
      movements: movements.map(m => ({ id: m.id, date: m.createdAt, type: m.type, referenceType: m.referenceType, referenceId: m.referenceId, qty: m.qtyBase, value: m.valuePence, basis: m.costBasis, unitCost: m.unitCostBasePence, before: m.beforeQtyBase, after: m.afterQtyBase })),
      sales: saleRows.map(s => {
        const cogs = s.lines.reduce((sum, line) => sum + line.lineCostPence, 0);
        return { id: s.id, label: s.transactionNumber ?? s.id, date: s.createdAt,
          eligible: !s.salesReturn && !['VOID', 'RETURNED'].includes(s.paymentStatus),
          journalMatches: journalMatches(s.id, 'SALES_INVOICE', -cogs, cogs),
          lines: s.lines.filter(line => line.productId === productId).map(line => ({ id: line.id, qty: line.qtyBase, cost: line.lineCostPence, basis: line.costBasis })) };
      }),
      credits,
    });
    return { product: product.name, store: store.name, result };
  }, { isolationLevel: 'Serializable', maxWait: 5000, timeout: 15000 });
}
