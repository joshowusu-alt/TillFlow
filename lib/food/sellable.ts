/** A product can be sold when it has stock, or when it is an available uncounted dish. */
export function sellableProductWhere(businessId: string) {
  return {
    businessId,
    active: true,
    ingredientOnly: false,
    sellingPriceBasePence: { gt: 0 },
    OR: [
      { inventoryBalances: { some: { qtyOnHandBase: { gt: 0 } } } },
      { foodDish: { is: { stockMode: 'NOT_COUNTED', soldOut: false } } },
    ],
  };
}
