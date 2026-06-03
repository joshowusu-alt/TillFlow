import { suggestImportCategoryName } from '@/lib/import/category-import';

export type DuplicateKind = 'none' | 'barcode' | 'name_exact' | 'name_similar' | 'sku';

export type DuplicateAction = 'skip' | 'update' | 'create';

export type CatalogContext = {
  productNames: Set<string>;
  productNameToId: Map<string, string>;
  barcodes: Set<string>;
  barcodeToProductId: Map<string, string>;
  skus: Set<string>;
  categoryNames: Set<string>;
  supplierNames: Set<string>;
};

export type ValidatedImportRowInput = {
  rowNumber: number;
  name: string;
  sku: string;
  barcode: string;
  category: string;
  sellingPricePence: number;
  costPricePence: number;
  quantity: number;
  baseUnitName: string;
  packUnitName: string;
  packSize: number;
  qtyInName: string;
  supplierName: string;
  reorderPoint: number;
  storefrontPublished: boolean;
  imageUrl: string;
  notes: string;
  /** User confirmed selling below cost */
  confirmBelowCost?: boolean;
  duplicateAction?: DuplicateAction;
};

export type RowValidationResult = {
  errors: string[];
  warnings: string[];
  duplicateKind: DuplicateKind;
  suggestedCategory: string;
  defaultDuplicateAction: DuplicateAction;
};

const SIMILAR_NAME_THRESHOLD = 0.92;

function normaliseName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function nameSimilarity(a: string, b: string): number {
  const left = normaliseName(a);
  const right = normaliseName(b);
  if (!left || !right) return 0;
  if (left === right) return 1;
  const longer = left.length >= right.length ? left : right;
  const shorter = left.length < right.length ? left : right;
  if (longer.includes(shorter) && shorter.length >= 4) return 0.94;
  return 0;
}

export function validateImportRow(
  row: ValidatedImportRowInput,
  catalog?: CatalogContext | null,
  options?: { seenNamesInFile?: Set<string>; seenBarcodesInFile?: Set<string> }
): RowValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  let duplicateKind: DuplicateKind = 'none';
  let defaultDuplicateAction: DuplicateAction = 'create';

  if (!row.name.trim()) {
    errors.push('Product name is missing.');
  }

  if (row.sellingPricePence < 0) {
    errors.push('Selling price must be a number.');
  } else if (row.sellingPricePence === 0) {
    errors.push('Selling price is missing or zero.');
  }

  if (row.costPricePence < 0) {
    errors.push('Cost price must be a number.');
  }

  if (row.quantity < 0 || !Number.isFinite(row.quantity)) {
    errors.push('Opening stock must be a valid number.');
  }

  if (!row.baseUnitName.trim()) {
    errors.push('Unit type is missing — enter the smallest unit you sell (e.g. Piece, Bottle, Tin).');
  }

  if (row.packUnitName && row.packSize <= 1) {
    errors.push('Pack or carton size must be at least 2 when a pack/carton unit is set.');
  }

  if (row.qtyInName.trim()) {
    const qtyLower = row.qtyInName.toLowerCase();
    const baseLower = row.baseUnitName.toLowerCase();
    const packLower = row.packUnitName.toLowerCase();
    if (qtyLower !== baseLower && (!packLower || qtyLower !== packLower)) {
      errors.push(
        `Stock count unit "${row.qtyInName}" must match your unit type (${row.baseUnitName}) or pack unit (${row.packUnitName || 'none'}).`
      );
    }
  }

  if (
    row.sellingPricePence > 0 &&
    row.costPricePence > 0 &&
    row.sellingPricePence < row.costPricePence &&
    !row.confirmBelowCost
  ) {
    warnings.push('Selling price is lower than cost price — confirm if that is intentional.');
  }

  if (row.sellingPricePence > 0 && row.costPricePence > 0 && row.sellingPricePence > row.costPricePence * 8) {
    warnings.push('Selling price looks much higher than cost — double-check both prices.');
  }

  if (!row.category.trim()) {
    warnings.push('Category is missing — you can add one later.');
  }

  if (!row.supplierName.trim()) {
    warnings.push('Supplier is missing — stock will still import.');
  }

  if (row.reorderPoint <= 0) {
    warnings.push('Low stock alert is not set — TillFlow will not warn you early.');
  }

  if (!row.barcode.trim()) {
    warnings.push('Barcode is missing — you can scan or add it later.');
  }

  if (row.quantity === 0) {
    warnings.push('Opening stock is zero — product will have no stock on hand yet.');
  }

  const suggestedCategory = row.category.trim()
    ? suggestImportCategoryName(row.category)
    : '';

  if (row.category.trim() && suggestedCategory && suggestedCategory !== row.category.trim()) {
    warnings.push(`Category will be saved as "${suggestedCategory}".`);
  }

  const seenNames = options?.seenNamesInFile ?? new Set<string>();
  const seenBarcodes = options?.seenBarcodesInFile ?? new Set<string>();
  const nameKey = normaliseName(row.name);

  if (nameKey && seenNames.has(nameKey)) {
    duplicateKind = 'name_exact';
    defaultDuplicateAction = 'skip';
    warnings.push('This product name appears again in your file — only the first row will import.');
  } else if (nameKey) {
    seenNames.add(nameKey);
  }

  if (row.barcode) {
    if (seenBarcodes.has(row.barcode)) {
      duplicateKind = 'barcode';
      defaultDuplicateAction = 'skip';
      errors.push('Barcode is duplicated in this file.');
    } else {
      seenBarcodes.add(row.barcode);
    }
  }

  if (catalog && row.name.trim()) {
    if (row.barcode && catalog.barcodes.has(row.barcode)) {
      duplicateKind = 'barcode';
      defaultDuplicateAction = 'skip';
      warnings.push('Barcode already belongs to another product — choose Skip or Update.');
    } else if (catalog.productNames.has(nameKey)) {
      duplicateKind = 'name_exact';
      defaultDuplicateAction = 'update';
      warnings.push('Product name already exists — choose Update to refresh prices/stock or Skip.');
    } else {
      for (const existing of catalog.productNames) {
        if (nameSimilarity(row.name, existing) >= SIMILAR_NAME_THRESHOLD) {
          duplicateKind = 'name_similar';
          defaultDuplicateAction = 'skip';
          warnings.push('A similar product name already exists — review before importing.');
          break;
        }
      }
    }

    if (row.sku && catalog.skus.has(row.sku.toLowerCase())) {
      if (duplicateKind === 'none') duplicateKind = 'sku';
      warnings.push('SKU already exists on another product.');
    }
  }

  if (duplicateKind === 'barcode' && defaultDuplicateAction === 'create') {
    defaultDuplicateAction = 'skip';
  }

  return {
    errors,
    warnings,
    duplicateKind,
    suggestedCategory,
    defaultDuplicateAction,
  };
}

export function mergeValidationMessages(
  base: { errors: string[]; warnings: string[] },
  extra: RowValidationResult
) {
  return {
    errors: [...new Set([...base.errors, ...extra.errors])],
    warnings: [...new Set([...base.warnings, ...extra.warnings])],
  };
}
