export const RECENT_ADDED_DAYS = 14;

export type LabelShortcut = 'all' | 'recent' | 'low-stock' | 'missing-label';

export type LabelQueueProduct = {
  id: string;
  name: string;
  barcode: string | null;
  sku: string | null;
  categoryId: string | null;
  createdAt?: string | null;
  reorderPointBase?: number | null;
  qtyOnHandBase?: number | null;
};

export function hasMissingLabel(product: Pick<LabelQueueProduct, 'barcode'>): boolean {
  return !product.barcode?.trim();
}

export function isRecentlyAdded(
  product: Pick<LabelQueueProduct, 'createdAt'>,
  nowMs = Date.now(),
  days = RECENT_ADDED_DAYS,
): boolean {
  if (!product.createdAt) return false;
  const created = new Date(product.createdAt).getTime();
  if (Number.isNaN(created)) return false;
  return nowMs - created <= days * 86_400_000;
}

export function isLowStock(product: Pick<LabelQueueProduct, 'qtyOnHandBase' | 'reorderPointBase'>): boolean {
  if (product.qtyOnHandBase == null) return false;
  const reorder = product.reorderPointBase ?? 0;
  return reorder > 0 ? product.qtyOnHandBase <= reorder : product.qtyOnHandBase <= 0;
}

export function matchesLabelShortcut(
  product: LabelQueueProduct,
  shortcut: LabelShortcut,
  nowMs = Date.now(),
): boolean {
  if (shortcut === 'recent') return isRecentlyAdded(product, nowMs);
  if (shortcut === 'low-stock') return isLowStock(product);
  if (shortcut === 'missing-label') return hasMissingLabel(product);
  return true;
}

export function mergeSelectedIds(current: string[], add: string[]): string[] {
  const next = new Set(current);
  add.forEach((id) => next.add(id));
  return [...next];
}

export function selectCategoryIds(
  products: LabelQueueProduct[],
  categoryId: string,
): string[] {
  if (categoryId === 'ALL') return products.map((product) => product.id);
  if (categoryId === 'UNCATEGORISED') {
    return products.filter((product) => !product.categoryId).map((product) => product.id);
  }
  return products.filter((product) => product.categoryId === categoryId).map((product) => product.id);
}
