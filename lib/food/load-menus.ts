import { prisma } from '@/lib/prisma';
import type { FoodGroupSelection, FoodMenu, FoodStockMode } from '@/lib/food/plate';

const dishInclude = {
  sizes: { orderBy: { sortOrder: 'asc' as const } },
  inclusions: { orderBy: { sortOrder: 'asc' as const } },
  groups: {
    orderBy: { sortOrder: 'asc' as const },
    include: { addons: { orderBy: { sortOrder: 'asc' as const } } },
  },
  product: { select: { name: true, sellingPriceBasePence: true, active: true } },
};

type DishRow = {
  productId: string;
  stockMode: string;
  soldOut: boolean;
  lowAt: number;
  product: { name: string; sellingPriceBasePence: number; active: boolean };
  sizes: Array<{ id: string; name: string; pricePence: number; isDefault: boolean; active: boolean }>;
  inclusions: Array<{ id: string; name: string; qty: number; stockPortions: number }>;
  groups: Array<{
    id: string;
    name: string;
    selection: string;
    required: boolean;
    addons: Array<{ id: string; name: string; pricePence: number; maxQty: number; stockPortions: number; active: boolean }>;
  }>;
};

export function toFoodMenu(row: DishRow): FoodMenu {
  const stockMode: FoodStockMode = row.stockMode === 'COUNTED' ? 'COUNTED' : 'NOT_COUNTED';
  return {
    productId: row.productId,
    name: row.product.name,
    stockMode,
    soldOut: row.soldOut,
    lowAt: row.lowAt,
    sizes: row.sizes.map((size) => ({
      id: size.id,
      name: size.name,
      pricePence: size.pricePence,
      isDefault: size.isDefault,
      active: size.active,
    })),
    inclusions: row.inclusions.map((item) => ({
      id: item.id,
      name: item.name,
      qty: item.qty,
      stockPortions: item.stockPortions,
    })),
    groups: row.groups.map((group) => ({
      id: group.id,
      name: group.name,
      selection: (group.selection === 'SINGLE' ? 'SINGLE' : 'MANY') as FoodGroupSelection,
      required: group.required,
      addons: group.addons.map((addon) => ({
        id: addon.id,
        name: addon.name,
        pricePence: addon.pricePence,
        maxQty: addon.maxQty,
        stockPortions: addon.stockPortions,
        active: addon.active,
      })),
    })),
  };
}

export async function loadFoodCatalogue(businessId: string, productIds?: string[]) {
  const rows = await prisma.foodDish.findMany({
    where: {
      businessId,
      ...(productIds && productIds.length > 0 ? { productId: { in: productIds } } : {}),
    },
    include: dishInclude,
  });
  const menus = new Map<string, FoodMenu>();
  const startingPrices = new Map<string, number>();
  const inactiveProductIds = new Set<string>();
  for (const row of rows) {
    menus.set(row.productId, toFoodMenu(row));
    startingPrices.set(row.productId, row.product.sellingPriceBasePence);
    if (row.product.active === false) inactiveProductIds.add(row.productId);
  }
  return { menus, startingPrices, inactiveProductIds };
}
