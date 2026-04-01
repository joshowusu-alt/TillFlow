export type AmendSaleProductOption = {
  id: string;
  name: string;
  barcode: string | null;
  categoryName: string | null;
};

type FilterAmendSaleProductOptionsInput = {
  keptProductIds: ReadonlySet<string>;
  addedProductIds: ReadonlySet<string>;
  searchQuery: string;
  limit?: number;
};

export function filterAmendSaleProductOptions<T extends AmendSaleProductOption>(
  products: T[],
  {
    keptProductIds,
    addedProductIds,
    searchQuery,
    limit = 20,
  }: FilterAmendSaleProductOptionsInput,
): T[] {
  let filtered = products.filter(
    (product) => !keptProductIds.has(product.id) && !addedProductIds.has(product.id),
  );

  const normalizedQuery = searchQuery.trim().toLowerCase();
  if (normalizedQuery) {
    filtered = filtered.filter(
      (product) =>
        product.name.toLowerCase().includes(normalizedQuery) ||
        (product.barcode && product.barcode.toLowerCase().includes(normalizedQuery)) ||
        (product.categoryName && product.categoryName.toLowerCase().includes(normalizedQuery)),
    );
  }

  return filtered.slice(0, limit);
}