/**
 * Import purpose modes for /settings/import-stock.
 * Mode is chosen in the UI — never inferred from spreadsheet columns alone.
 */

export const IMPORT_MODES = ['CATALOGUE', 'OPENING_STOCK', 'PURCHASES'] as const;
export type ImportMode = (typeof IMPORT_MODES)[number];

export type OpeningStockFunding = 'EQUITY' | 'SUPPLIER_CREDIT';
export type PurchasePaymentAccount = 'CASH' | 'BANK' | 'MOBILE_MONEY';

export function isImportMode(value: unknown): value is ImportMode {
  return typeof value === 'string' && (IMPORT_MODES as readonly string[]).includes(value);
}

export function importModeLabel(mode: ImportMode): string {
  switch (mode) {
    case 'CATALOGUE':
      return 'Product catalogue';
    case 'OPENING_STOCK':
      return 'Opening stock';
    case 'PURCHASES':
      return 'Purchases';
  }
}

export function importModeExplanation(mode: ImportMode): string {
  switch (mode) {
    case 'CATALOGUE':
      return 'Add or update products, prices and units. Quantities are ignored — no stock or accounting entries.';
    case 'OPENING_STOCK':
      return 'Record stock that already existed when you started TillFlow. Does not reduce cash. Supplier debt only if you confirm it.';
    case 'PURCHASES':
      return 'Stock you are buying now. Paid reduces cash/bank/MoMo; unpaid creates supplier debt.';
  }
}

/** Shared product columns across templates. */
export const CATALOGUE_TEMPLATE_HEADERS = [
  'name',
  'sku',
  'barcode',
  'category',
  'selling_price',
  'cost_price',
  'base_unit',
  'pack_unit',
  'pack_size',
  'supplier_name',
  'reorder_point',
  'storefront_published',
  'image_url',
  'notes',
] as const;

export const OPENING_STOCK_TEMPLATE_HEADERS = [
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
  'notes',
] as const;

export const PURCHASE_TEMPLATE_HEADERS = [
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
  'notes',
  'payment_status',
] as const;

export function templateHeadersForMode(mode: ImportMode): readonly string[] {
  switch (mode) {
    case 'CATALOGUE':
      return CATALOGUE_TEMPLATE_HEADERS;
    case 'OPENING_STOCK':
      return OPENING_STOCK_TEMPLATE_HEADERS;
    case 'PURCHASES':
      return PURCHASE_TEMPLATE_HEADERS;
  }
}

/** Detect legacy spreadsheets that still carry purchase payment columns. */
export function spreadsheetHasPaymentStatusColumn(headers: string[]): boolean {
  return headers.some((h) => {
    const key = h.toLowerCase().trim().replace(/\s+/g, '_');
    return key === 'payment_status' || key === 'payment' || key === 'paid';
  });
}
