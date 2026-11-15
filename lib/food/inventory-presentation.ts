import { foodAvailability } from '@/lib/food/availability';
import { isFoodBusiness } from '@/lib/food/business';

export function inventoryAvailability(
  category: string | null | undefined,
  dish: { stockMode: string; soldOut: boolean; lowAt: number } | null,
  qtyOnHand: number,
  reorderPoint: number,
) {
  if (isFoodBusiness(category) && dish) {
    const counted = dish.stockMode === 'COUNTED';
    const availability = foodAvailability({ ...dish, stockMode: counted ? 'COUNTED' : 'NOT_COUNTED' }, qtyOnHand);
    return {
      dish: true,
      isOut: availability === 'sold_out',
      isLow: availability === 'low',
      status: availability === 'sold_out' ? 'Sold out' : availability === 'low' ? 'Low portions' : 'Available',
      quantity: counted ? `${Math.max(0, qtyOnHand)} portions left` : 'Portions not counted',
    };
  }
  const isOut = qtyOnHand <= 0;
  const isLow = reorderPoint > 0 && qtyOnHand <= reorderPoint;
  return { dish: false, isOut, isLow, status: isOut ? 'Out of stock' : isLow ? 'Low stock' : 'OK', quantity: null };
}
