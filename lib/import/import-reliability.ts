/** Shared by import preview and the server; identifiers must agree. */
export type ImportMatchProduct = {
  id: string;
  name: string;
  sku?: string | null;
  barcode?: string | null;
  barcodes?: { code: string }[];
};

const nameKey = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ');

export function matchImportProduct(
  row: { name: string; sku: string; barcode: string }, products: ImportMatchProduct[],
): string | null {
  const barcode = row.barcode.trim();
  const sku = row.sku.trim();
  const barcodeMatches = barcode ? products.filter(p => p.barcode === barcode || p.barcodes?.some(b => b.code === barcode)) : [];
  const skuMatches = sku ? products.filter(p => p.sku && nameKey(p.sku) === nameKey(sku)) : [];
  if (barcodeMatches.length > 1 || skuMatches.length > 1) throw new Error(`Multiple products match the barcode/SKU for ${row.name}. Correct the identifiers before importing.`);
  if (barcodeMatches[0] && skuMatches[0] && barcodeMatches[0].id !== skuMatches[0].id) throw new Error(`Barcode and SKU match different products for ${row.name}.`);
  // A barcode is the product. The same title with a different barcode is a different product.
  if (barcode) {
    if (!barcodeMatches[0] && skuMatches[0]) throw new Error(`Barcode and SKU match different products for ${row.name}.`);
    return barcodeMatches[0]?.id ?? null;
  }
  if (sku) return skuMatches[0]?.id ?? null;
  const names = products.filter(p => nameKey(p.name) === nameKey(row.name));
  if (names.length > 1) throw new Error(`Multiple products share the name ${row.name}. Supply the exact barcode or SKU.`);
  return names[0]?.id ?? null;
}

export function importClassificationErrors(row: { category: string; division?: string; group?: string }): string[] {
  const values = [row.category, row.division ?? '', row.group ?? ''];
  const errors: string[] = [];
  if (values.some(value => value.trim().length > 100 || /[\x00-\x1f]/.test(value))) errors.push('Category, division and group names must be up to 100 characters.');
  if (row.division?.trim() && !row.category.trim()) errors.push('Include the parent category when using a division.');
  if (row.group?.trim() && (!row.category.trim() || !row.division?.trim())) errors.push('Include the parent category and division when using a group.');
  return errors;
}

/** Missing/blank optional cells preserve saved values; explicit zero/false apply. */
export function importOptionalProductUpdates(row: {
  costPricePence: number; costPriceProvided?: boolean;
  storefrontPublished?: boolean; reorderPointBase?: number;
}) {
  return {
    ...(row.costPriceProvided !== false ? { defaultCostBasePence: row.costPricePence } : {}),
    ...(row.storefrontPublished !== undefined ? { storefrontPublished: row.storefrontPublished } : {}),
    ...(row.reorderPointBase !== undefined ? { reorderPointBase: row.reorderPointBase } : {}),
  };
}
