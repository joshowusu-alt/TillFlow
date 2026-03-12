export type PosSearchProduct = {
  id: string;
  name: string;
  barcode: string | null;
  categoryName: string | null;
};

export function filterPosProducts<TProduct extends PosSearchProduct>(
  products: TProduct[],
  search: string,
  limit = 10
): TProduct[] {
  const normalized = search.trim().toLowerCase();
  if (!normalized) return [];

  return products
    .filter((product) =>
      product.name.toLowerCase().includes(normalized) ||
      (product.barcode && product.barcode.toLowerCase().includes(normalized)) ||
      (product.categoryName && product.categoryName.toLowerCase().includes(normalized))
    )
    .slice(0, limit);
}
