import type { FoodGroupSelection, FoodStockMode } from '@/lib/food/plate';

export type DishDraft = {
  productId?: string | null;
  name: string;
  startingPriceCedis: string;
  estimatedCostCedis: string;
  description: string;
  showOnline: boolean;
  stockMode: FoodStockMode;
  soldOut: boolean;
  lowAt: number;
  /** Blank means no cost is posted when leftovers are written off. */
  costPerPortionCedis?: string;
  sizes: Array<{ name: string; priceCedis: string; isDefault: boolean }>;
  inclusions: Array<{ name: string; qty: number; counts: boolean }>;
  groups: Array<{
    name: string;
    selection: FoodGroupSelection;
    required: boolean;
    addons: Array<{ name: string; priceCedis: string; maxQty: number; stockPortions: number }>;
  }>;
};

export type NormalizedDish = {
  name: string;
  startingPricePence: number;
  estimatedCostPence: number;
  description: string | null;
  showOnline: boolean;
  stockMode: FoodStockMode;
  soldOut: boolean;
  lowAt: number;
  costPerPortionPence: number | null;
  sizes: Array<{ name: string; pricePence: number; isDefault: boolean }>;
  inclusions: Array<{ name: string; qty: number; stockPortions: number }>;
  groups: Array<{
    name: string;
    selection: FoodGroupSelection;
    required: boolean;
    addons: Array<{ name: string; pricePence: number; maxQty: number; stockPortions: number }>;
  }>;
};

function cedisToPence(value: string, label: string, allowZero: boolean): number {
  const trimmed = value.trim();
  if (!trimmed) {
    if (allowZero) return 0;
    throw new Error(`Enter a price in cedis for ${label}.`);
  }
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
    throw new Error(`${label} must be a cedis amount such as 25 or 25.50.`);
  }
  const pence = Math.round(Number(trimmed) * 100);
  if (!Number.isSafeInteger(pence) || pence < 0 || (!allowZero && pence <= 0)) {
    throw new Error(allowZero ? `${label} cannot be negative.` : `${label} must be greater than zero.`);
  }
  return pence;
}

function cleanName(value: string, label: string, max = 80): string {
  const name = value.trim().replace(/\s+/g, ' ');
  if (!name) throw new Error(`Enter a name for ${label}.`);
  if (name.length > max) throw new Error(`${label} must be ${max} characters or fewer.`);
  return name;
}

export function normalizeDishDraft(draft: DishDraft): NormalizedDish {
  const name = cleanName(draft.name, 'the dish');
  const startingPricePence = cedisToPence(draft.startingPriceCedis, name, false);
  const estimatedCostPence = cedisToPence(draft.estimatedCostCedis || '0', `the estimated cost of ${name}`, true);
  const stockMode: FoodStockMode = draft.stockMode === 'COUNTED' ? 'COUNTED' : 'NOT_COUNTED';
  const description = draft.description.trim().slice(0, 500) || null;
  const lowAt = stockMode === 'COUNTED' ? Math.floor(Number(draft.lowAt) || 0) : 0;
  if (!Number.isInteger(lowAt) || lowAt < 0 || lowAt > 100000) {
    throw new Error('The low-portion warning must be zero or a whole number.');
  }
  const costPerPortionPence = stockMode === 'COUNTED' && draft.costPerPortionCedis?.trim()
    ? cedisToPence(draft.costPerPortionCedis, `the cost per portion of ${name}`, true)
    : null;

  const sizes = (draft.sizes ?? [])
    .map((size) => ({
      name: size.name.trim(),
      pricePence: size.priceCedis.trim() ? cedisToPence(size.priceCedis, size.name.trim() || 'a size', false) : 0,
      isDefault: Boolean(size.isDefault),
    }))
    .filter((size) => size.name || size.pricePence > 0);
  if (sizes.length > 6) throw new Error('A dish can have up to 6 sizes.');
  for (const size of sizes) {
    size.name = cleanName(size.name, 'each size', 40);
  }
  if (sizes.length > 0 && !sizes.some((size) => size.isDefault)) sizes[0].isDefault = true;
  if (sizes.filter((size) => size.isDefault).length > 1) {
    let seen = false;
    for (const size of sizes) {
      if (size.isDefault && !seen) seen = true;
      else size.isDefault = false;
    }
  }

  const inclusions = (draft.inclusions ?? [])
    .map((item) => ({
      name: item.name.trim(),
      qty: Math.floor(Number(item.qty) || 0),
      counts: Boolean(item.counts),
    }))
    .filter((item) => item.name);
  if (inclusions.length > 8) throw new Error('A dish can include up to 8 items.');
  const normalizedInclusions = inclusions.map((item) => {
    const itemName = cleanName(item.name, 'each included item', 60);
    if (item.qty < 1 || item.qty > 20) throw new Error(`${itemName} needs a quantity from 1 to 20.`);
    return {
      name: itemName,
      qty: item.qty,
      stockPortions: stockMode === 'COUNTED' && item.counts ? item.qty : 0,
    };
  });

  const groups = (draft.groups ?? []).filter((group) => group.name.trim() || group.addons.some((addon) => addon.name.trim()));
  if (groups.length > 4) throw new Error('A dish can have up to 4 extra groups.');
  const normalizedGroups = groups.map((group) => {
    const groupName = cleanName(group.name, 'each extra group', 40);
    const selection: FoodGroupSelection = group.selection === 'SINGLE' ? 'SINGLE' : 'MANY';
    const addons = group.addons
      .map((addon) => ({
        name: addon.name.trim(),
        priceCedis: addon.priceCedis,
        maxQty: Math.floor(Number(addon.maxQty) || 1),
        stockPortions: Math.floor(Number(addon.stockPortions) || 0),
      }))
      .filter((addon) => addon.name);
    if (addons.length === 0) throw new Error(`Add at least one choice to ${groupName}.`);
    if (addons.length > 12) throw new Error(`${groupName} can have up to 12 choices.`);
    return {
      name: groupName,
      selection,
      required: selection === 'SINGLE' && Boolean(group.required),
      addons: addons.map((addon) => {
        const addonName = cleanName(addon.name, `a choice in ${groupName}`, 60);
        const maxQty = selection === 'SINGLE' ? 1 : addon.maxQty;
        if (maxQty < 1 || maxQty > 20) throw new Error(`${addonName} can be chosen from 1 to 20 times.`);
        if (addon.stockPortions < 0 || addon.stockPortions > 20) {
          throw new Error(`${addonName} can use from 0 to 20 portions.`);
        }
        return {
          name: addonName,
          pricePence: cedisToPence(addon.priceCedis || '0', addonName, true),
          maxQty,
          stockPortions: stockMode === 'COUNTED' ? addon.stockPortions : 0,
        };
      }),
    };
  });

  return {
    name,
    startingPricePence,
    estimatedCostPence,
    description,
    showOnline: Boolean(draft.showOnline),
    stockMode,
    soldOut: stockMode === 'NOT_COUNTED' && Boolean(draft.soldOut),
    lowAt,
    costPerPortionPence,
    sizes,
    inclusions: normalizedInclusions,
    groups: normalizedGroups,
  };
}

export function emptyDishDraft(): DishDraft {
  return {
    name: '',
    startingPriceCedis: '',
    estimatedCostCedis: '',
    description: '',
    showOnline: true,
    stockMode: 'NOT_COUNTED',
    soldOut: false,
    lowAt: 0,
    costPerPortionCedis: '',
    sizes: [],
    inclusions: [{ name: '', qty: 1, counts: true }],
    groups: [],
  };
}
