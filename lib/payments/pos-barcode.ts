export type PosBarcodeUnit = {
  id: string;
  isBaseUnit: boolean;
};

export type PosBarcodeProduct = {
  id: string;
  barcode: string | null;
  units: PosBarcodeUnit[];
};

export type BarcodeScanResolution<TProduct extends PosBarcodeProduct> =
  | { kind: 'matched'; product: TProduct; baseUnitId: string }
  | { kind: 'missing'; code: string };

export function getProductBaseUnitId<TProduct extends PosBarcodeProduct>(product: TProduct): string {
  return product.units.find((unit) => unit.isBaseUnit)?.id ?? product.units[0]?.id ?? '';
}

export function resolveBarcodeScan<TProduct extends PosBarcodeProduct>(
  code: string,
  products: TProduct[]
): BarcodeScanResolution<TProduct> | null {
  const trimmed = code.trim();
  if (!trimmed) return null;

  const product = products.find((candidate) => candidate.barcode === trimmed);
  if (!product) {
    return { kind: 'missing', code: trimmed };
  }

  return {
    kind: 'matched',
    product,
    baseUnitId: getProductBaseUnitId(product),
  };
}
