import { pricePurchaseLines } from './discounts';

export const QUICK_PURCHASE_HREF = '/purchases/quick';

export type QuickUnit = { id: string; name: string; pluralName?: string | null; isBaseUnit?: boolean };
export type QuickProduct = {
  id: string;
  name: string;
  vatRateBps: number;
  units: QuickUnit[];
  lastUnitId?: string;
  lastCosts?: Record<string, number>;
};
export type QuickRow = { key: number; product?: QuickProduct; unitId: string; quantity: string; cost: string; expiry: string };
export type QuickPayment = 'Cash' | 'MoMo' | 'Pay later';

export const QUICK_CASH_SOURCES = {
  OWNER_CAPITAL: 'My own money',
  BUSINESS_CASH: 'Business cash',
} as const;
export type QuickCashSource = keyof typeof QUICK_CASH_SOURCES;

export function quickMoney(value: string) {
  return /^\d+(?:\.\d{1,2})?$/.test(value.trim()) ? Math.round(Number(value) * 100) : NaN;
}
export function quickCost(value: string) {
  const cost = quickMoney(value);
  return cost > 0 ? cost : NaN;
}
export function validQuickQuantity(value: string) {
  return /^\d+$/.test(value.trim()) && Number(value) > 0 && Number(value) <= 2147483647;
}
export function quickPurchaseProblem(rows: QuickRow[], payment: QuickPayment, supplier: string, photoRequired: boolean, photo: boolean) {
  const selected = rows.filter(row => row.product);
  if (!selected.length) return { id: 'item-' + rows[0]?.key, message: 'Choose an item you bought' };
  for (const row of selected) {
    if (!validQuickQuantity(row.quantity)) return { id: 'qty-' + row.key, message: 'Add how many for ' + row.product!.name };
    const cost = quickCost(row.cost);
    if (!Number.isFinite(cost) || cost * Number(row.quantity) > 2147483647) {
      return { id: 'cost-' + row.key, message: 'Add a cost for ' + row.product!.name };
    }
  }
  if (payment === 'Pay later' && !supplier) return { id: 'quick-supplier', message: "Choose who you're paying later" };
  if (photoRequired && !photo) return { id: 'quick-photo', message: 'Add a photo of the receipt' };
}

export function quickPurchaseTotal(rows: QuickRow[], discountBps: number, vatEnabled: boolean) {
  const complete = rows.filter(row => row.product && validQuickQuantity(row.quantity) && Number.isFinite(quickCost(row.cost)));
  return pricePurchaseLines(complete.map(row => ({ qtyInUnit: Number(row.quantity), unitCostPence: quickCost(row.cost) })), discountBps)
    .reduce((sum, line, index) => sum + line.netPence + (vatEnabled ? Math.round(line.netPence * complete[index].product!.vatRateBps / 10000) : 0), 0);
}
