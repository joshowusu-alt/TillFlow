/**
 * One plate, priced on the server from the dish that was actually set up.
 * Clients may send a selection. They may not send the price.
 */

import { isFoodBusiness } from '@/lib/food/business';

export type FoodStockMode = 'NOT_COUNTED' | 'COUNTED';
export type FoodGroupSelection = 'MANY' | 'SINGLE';

export type FoodSize = {
  id: string;
  name: string;
  pricePence: number;
  isDefault: boolean;
  active?: boolean;
};

export type FoodInclusion = {
  id: string;
  name: string;
  qty: number;
  /** Portions of the counted dish used by this included item. Ignored when the dish is not counted. */
  stockPortions: number;
};

export type FoodAddon = {
  id: string;
  name: string;
  pricePence: number;
  maxQty: number;
  /** Extra portions used per add-on chosen. 0 means the extra does not touch the count. */
  stockPortions: number;
  active?: boolean;
};

export type FoodAddonGroup = {
  id: string;
  name: string;
  selection: FoodGroupSelection;
  required: boolean;
  addons: FoodAddon[];
};

export type FoodMenu = {
  productId: string;
  name: string;
  stockMode: FoodStockMode;
  soldOut: boolean;
  /** Counted dishes: warn when portions on hand are at or below this. 0 disables the low warning. */
  lowAt: number;
  sizes: FoodSize[];
  inclusions: FoodInclusion[];
  groups: FoodAddonGroup[];
};

export type PlateAddonSelection = {
  addonId: string;
  qty: number;
};

export type PlateSelection = {
  sizeId?: string | null;
  addons?: PlateAddonSelection[];
  /** Price the till or menu showed. The server rejects the plate when this no longer matches. */
  expectedPricePence?: number | null;
};

export type PricedAddon = {
  id: string;
  name: string;
  groupName: string;
  qty: number;
  unitPricePence: number;
  linePricePence: number;
};

export type PlateSnapshot = {
  v: 1;
  productId: string;
  dishName: string;
  sizeId: string | null;
  sizeName: string | null;
  sizePricePence: number | null;
  startingPricePence: number;
  inclusions: Array<{ name: string; qty: number }>;
  addons: PricedAddon[];
  platePricePence: number;
  stockPortions: number;
  stockMode: FoodStockMode;
};

export class PlateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PlateError';
  }
}

export function activeSizes(menu: FoodMenu): FoodSize[] {
  return menu.sizes.filter((size) => size.active !== false);
}

export function defaultSize(menu: FoodMenu): FoodSize | null {
  const sizes = activeSizes(menu);
  return sizes.find((size) => size.isDefault) ?? sizes[0] ?? null;
}

/** Price shown before a plate is configured: the default size, otherwise the starting price. */
export function menuListPricePence(menu: FoodMenu, startingPricePence: number): number {
  return defaultSize(menu)?.pricePence ?? startingPricePence;
}

/** Cheapest size a customer or cashier can still choose. Null when the dish has no sizes. */
export function cheapestActiveSizePricePence(menu: FoodMenu): number | null {
  const prices = activeSizes(menu).map((size) => size.pricePence);
  if (prices.length === 0) return null;
  return Math.min(...prices);
}

/** Same label from a list of size prices. An empty list keeps the starting price. */
export function formatFromSizePrices(
  sizePricesPence: number[] | null | undefined,
  startingPricePence: number,
  format: (pence: number) => string,
): string {
  const prices = (sizePricesPence ?? []).filter((price) => Number.isFinite(price));
  if (prices.length === 0) return format(startingPricePence);
  return `from ${format(Math.min(...prices))}`;
}

/** Search and list label. Sized dishes say "from GH₵X". A dish with no sizes keeps its price. */
export function formatDishListPrice(
  menu: FoodMenu | null | undefined,
  startingPricePence: number,
  format: (pence: number) => string,
): string {
  const cheapest = menu ? cheapestActiveSizePricePence(menu) : null;
  if (cheapest == null) return format(startingPricePence);
  return `from ${format(cheapest)}`;
}

export function dishNeedsPicker(menu: FoodMenu): boolean {
  if (activeSizes(menu).length > 0) return true;
  return menu.groups.some((group) => group.addons.some((addon) => addon.active !== false));
}

export function defaultPlateSelection(menu: FoodMenu): PlateSelection {
  return { sizeId: defaultSize(menu)?.id ?? null, addons: [] };
}

export function plateSelectionKey(selection: PlateSelection | null | undefined): string {
  const addons = [...(selection?.addons ?? [])]
    .filter((addon) => addon.qty > 0)
    .map((addon) => `${addon.addonId}:${addon.qty}`)
    .sort();
  return `${selection?.sizeId ?? ''}|${addons.join(',')}`;
}

function activeAddons(group: FoodAddonGroup): FoodAddon[] {
  return group.addons.filter((addon) => addon.active !== false);
}

export function portionsForPlate(menu: FoodMenu, snapshot: Pick<PlateSnapshot, 'addons'>): number {
  if (menu.stockMode !== 'COUNTED') return 0;
  const included = menu.inclusions.reduce((sum, item) => sum + Math.max(0, item.stockPortions), 0);
  const extras = snapshot.addons.reduce((sum, addon) => {
    const defined = menu.groups
      .flatMap((group) => group.addons)
      .find((candidate) => candidate.id === addon.id);
    return sum + addon.qty * Math.max(0, defined?.stockPortions ?? 0);
  }, 0);
  return (included || 1) + extras;
}

export function pricePlate(
  menu: FoodMenu,
  selection: PlateSelection | null | undefined,
  startingPricePence: number,
): PlateSnapshot {
  if (menu.stockMode === 'NOT_COUNTED' && menu.soldOut) {
    throw new PlateError(`${menu.name} is sold out.`);
  }
  if (!Number.isInteger(startingPricePence) || startingPricePence < 0) {
    throw new PlateError(`${menu.name} does not have a valid price.`);
  }

  const sizes = activeSizes(menu);
  let size: FoodSize | null = null;
  if (sizes.length > 0) {
    const requested = selection?.sizeId ?? null;
    size = (requested ? sizes.find((candidate) => candidate.id === requested) : null) ?? defaultSize(menu);
    if (!size) throw new PlateError(`Choose a size for ${menu.name}.`);
    if (!Number.isInteger(size.pricePence) || size.pricePence <= 0) {
      throw new PlateError(`${size.name} ${menu.name} does not have a valid price.`);
    }
  }

  const chosen = new Map<string, number>();
  for (const addon of selection?.addons ?? []) {
    const qty = Math.floor(Number(addon.qty));
    if (!addon.addonId || !Number.isInteger(qty) || qty <= 0) continue;
    chosen.set(addon.addonId, (chosen.get(addon.addonId) ?? 0) + qty);
  }

  const pricedAddons: PricedAddon[] = [];
  for (const group of menu.groups) {
    const options = activeAddons(group);
    const picked = options.filter((addon) => (chosen.get(addon.id) ?? 0) > 0);
    if (group.selection === 'SINGLE' && picked.length > 1) {
      throw new PlateError(`Choose only one ${group.name} for ${menu.name}.`);
    }
    if (group.required && picked.length === 0) {
      throw new PlateError(`Choose one ${group.name} for ${menu.name}.`);
    }
    for (const addon of picked) {
      const qty = chosen.get(addon.id) ?? 0;
      const maxQty = group.selection === 'SINGLE' ? 1 : Math.max(1, addon.maxQty);
      if (qty > maxQty) {
        throw new PlateError(`${addon.name} is limited to ${maxQty} on ${menu.name}.`);
      }
      if (!Number.isInteger(addon.pricePence) || addon.pricePence < 0) {
        throw new PlateError(`${addon.name} does not have a valid price.`);
      }
      pricedAddons.push({
        id: addon.id,
        name: addon.name,
        groupName: group.name,
        qty,
        unitPricePence: addon.pricePence,
        linePricePence: addon.pricePence * qty,
      });
      chosen.delete(addon.id);
    }
  }
  if (chosen.size > 0) {
    throw new PlateError(`One of the extras on ${menu.name} is no longer on the menu.`);
  }

  const basePrice = size ? size.pricePence : startingPricePence;
  if (basePrice <= 0) throw new PlateError(`Enter a selling price for ${menu.name}.`);
  const platePricePence = basePrice + pricedAddons.reduce((sum, addon) => sum + addon.linePricePence, 0);
  if (!Number.isSafeInteger(platePricePence) || platePricePence <= 0) {
    throw new PlateError(`The price of ${menu.name} is not valid.`);
  }

  const expected = selection?.expectedPricePence;
  if (expected != null && expected !== platePricePence) {
    throw new PlateError(`The price of this ${menu.name} plate changed. Review the plate and try again.`);
  }

  const snapshot: PlateSnapshot = {
    v: 1,
    productId: menu.productId,
    dishName: menu.name,
    sizeId: size?.id ?? null,
    sizeName: size?.name ?? null,
    sizePricePence: size?.pricePence ?? null,
    startingPricePence,
    inclusions: menu.inclusions
      .filter((item) => item.name.trim() && item.qty > 0)
      .map((item) => ({ name: item.name.trim(), qty: item.qty })),
    addons: pricedAddons,
    platePricePence,
    stockPortions: 0,
    stockMode: menu.stockMode,
  };
  snapshot.stockPortions = portionsForPlate(menu, snapshot);
  return snapshot;
}

export function formatPlateDetail(snapshot: PlateSnapshot, formatMoney: (pence: number) => string): string {
  const parts: string[] = [];
  if (snapshot.sizeName) parts.push(snapshot.sizeName);
  if (snapshot.inclusions.length > 0) {
    parts.push(
      `Includes ${snapshot.inclusions.map((item) => `${item.qty} ${item.name}`).join(', ')}`,
    );
  }
  for (const addon of snapshot.addons) {
    const price = addon.linePricePence > 0 ? ` (${formatMoney(addon.linePricePence)})` : '';
    parts.push(`+ ${addon.qty} ${addon.name}${price}`);
  }
  return parts.join(' · ');
}

export function parsePlateSnapshot(value: string | null | undefined): PlateSnapshot | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as PlateSnapshot;
    if (parsed?.v !== 1 || !parsed.dishName || !Number.isInteger(parsed.platePricePence)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export type RetailPricedLine = {
  productId: string;
  qtyInUnit: number;
  unitPricePence?: number;
  lineSubtotalPence?: number;
  qtyBase?: number;
  plate?: PlateSelection | null;
};

/**
 * Reprice dish lines from the menu. Any other business type is returned as the
 * same array, so a supermarket or bookshop sale cannot be changed by a plate payload.
 */
export function applyFoodSaleLines<T extends RetailPricedLine>(
  businessCategory: string | null | undefined,
  lines: T[],
  menus: Map<string, FoodMenu>,
  startingPrices: Map<string, number>,
): T[] {
  if (!isFoodBusiness(businessCategory)) return lines;
  return lines.map((line) => {
    const menu = menus.get(line.productId);
    if (!menu) return line;
    const snapshot = pricePlate(
      menu,
      line.plate,
      startingPrices.get(line.productId) ?? 0,
    );
    const qty = Math.floor(line.qtyInUnit);
    return {
      ...line,
      unitPricePence: snapshot.platePricePence,
      lineSubtotalPence: snapshot.platePricePence * qty,
      qtyBase: snapshot.stockPortions * qty,
      plateSnapshotJson: JSON.stringify(snapshot),
    };
  });
}

export function foodLineVat(lineSubtotalPence: number, vatEnabled: boolean, vatRateBps: number): number {
  if (!vatEnabled || vatRateBps <= 0) return 0;
  return Math.round((lineSubtotalPence * vatRateBps) / 10_000);
}

/** Portions a prepaid online order must reserve. Not-counted dishes reserve nothing. */
export function onlineHoldQty(snapshot: PlateSnapshot, plateQty: number): number {
  const qty = Math.floor(plateQty);
  if (qty <= 0) return 0;
  return snapshot.stockPortions * qty;
}
