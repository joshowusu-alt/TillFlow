import { isDishAvailableToday, type DishSchedule } from '@/lib/food/dish-schedule';
import type { FoodMenu } from '@/lib/food/plate';

export type FoodAvailability = 'available' | 'low' | 'sold_out';

/**
 * Till warning only. Counted dishes still sell until the connected checkout
 * finds there is not enough, the same way retail does. There is no till hold.
 */
export function foodAvailability(menu: Pick<FoodMenu, 'stockMode' | 'soldOut' | 'lowAt'>, onHand: number): FoodAvailability {
  if (menu.soldOut) return 'sold_out';
  if (menu.stockMode === 'NOT_COUNTED') return 'available';
  if (onHand <= 0) return 'sold_out';
  if (menu.lowAt > 0 && onHand <= menu.lowAt) return 'low';
  return 'available';
}

export function foodAvailabilityText(menu: FoodMenu, onHand: number): string | null {
  if (!isDishAvailableToday(menu)) return 'Not today';
  const state = foodAvailability(menu, onHand);
  if (state === 'sold_out') return 'Sold out';
  if (state === 'low') return 'Low';
  if (menu.stockMode === 'NOT_COUNTED') return 'Available';
  return null;
}

/** Not-counted dishes are available or sold out. They do not use a quantity. */
export function sellableBaseQty(menu: (Pick<FoodMenu, 'stockMode' | 'soldOut'> & DishSchedule) | null | undefined, onHand: number): number {
  if (!menu) return onHand;
  if (menu.soldOut || !isDishAvailableToday(menu)) return 0;
  if (menu.stockMode === 'NOT_COUNTED') return Number.MAX_SAFE_INTEGER;
  return onHand;
}
