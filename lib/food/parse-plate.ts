import type { PlateSelection } from '@/lib/food/plate';

/** Keep a client plate selection. Drop anything that is not a size id or an add-on quantity. */
export function parsePlateSelection(value: unknown): PlateSelection | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as { sizeId?: unknown; addons?: unknown; expectedPricePence?: unknown };
  const sizeId = typeof raw.sizeId === 'string' && raw.sizeId.trim() ? raw.sizeId.trim().slice(0, 80) : null;
  const addons = Array.isArray(raw.addons)
    ? raw.addons.slice(0, 30).flatMap((addon) => {
        if (!addon || typeof addon !== 'object') return [];
        const row = addon as { addonId?: unknown; qty?: unknown };
        const addonId = typeof row.addonId === 'string' ? row.addonId.trim().slice(0, 80) : '';
        const qty = Math.floor(Number(row.qty));
        if (!addonId || !Number.isInteger(qty) || qty <= 0 || qty > 20) return [];
        return [{ addonId, qty }];
      })
    : [];
  const expected = Number(raw.expectedPricePence);
  return {
    sizeId,
    addons,
    ...(Number.isInteger(expected) && expected >= 0 ? { expectedPricePence: expected } : {}),
  };
}
