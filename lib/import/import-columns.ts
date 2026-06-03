/**
 * Canonical CSV column keys and aliases (spreadsheet-friendly names).
 */

export const TEMPLATE_HEADERS = [
  'name',
  'sku',
  'barcode',
  'category',
  'selling_price',
  'cost_price',
  'quantity',
  'base_unit',
  'pack_unit',
  'pack_size',
  'qty_in',
  'supplier_name',
  'reorder_point',
  'storefront_published',
  'image_url',
  'notes',
  'payment_status',
] as const;

export type TemplateColumn = (typeof TEMPLATE_HEADERS)[number];

/** Map alternate header labels (from templates or owner spreadsheets) to canonical keys. */
export const HEADER_ALIASES: Record<string, TemplateColumn | 'pack_size' | 'qty_in'> = {
  productname: 'name',
  product_name: 'name',
  item: 'name',
  item_name: 'name',
  sellingprice: 'selling_price',
  sell_price: 'selling_price',
  sale_price: 'selling_price',
  costprice: 'cost_price',
  unit_cost: 'cost_price',
  purchase_price: 'cost_price',
  openingstock: 'quantity',
  opening_stock: 'quantity',
  stock: 'quantity',
  qty: 'quantity',
  unittype: 'base_unit',
  unit_type: 'base_unit',
  unit: 'base_unit',
  baseunit: 'base_unit',
  packunit: 'pack_unit',
  pack_unit: 'pack_unit',
  packquantity: 'pack_size',
  pack_quantity: 'pack_size',
  cartonquantity: 'pack_size',
  carton_quantity: 'pack_size',
  unitsperpack: 'pack_size',
  units_per_pack: 'pack_size',
  stockentryunit: 'qty_in',
  stock_entry_unit: 'qty_in',
  qty_in_unit: 'qty_in',
  supplier: 'supplier_name',
  suppliername: 'supplier_name',
  vendor: 'supplier_name',
  lowstockthreshold: 'reorder_point',
  low_stock_threshold: 'reorder_point',
  reorder_point: 'reorder_point',
  reorderpoint: 'reorder_point',
  onlinevisible: 'storefront_published',
  online_visible: 'storefront_published',
  productimageurl: 'image_url',
  product_image_url: 'image_url',
  image: 'image_url',
  brand: 'notes',
  payment: 'payment_status',
  paid: 'payment_status',
};

export function normaliseHeaderKey(raw: string): string {
  const key = raw.toLowerCase().trim().replace(/\s+/g, '_');
  const alias = HEADER_ALIASES[key];
  if (alias) return alias;
  if ((TEMPLATE_HEADERS as readonly string[]).includes(key)) return key;
  return key;
}
