import { toPence } from '@/lib/form-helpers';
import type {
  CatalogueRow,
  MigrationException,
  MigrationTemplateKind,
  OpeningStockRow,
  RowValidationResult,
  SupplierRow,
} from '@/lib/migration/types';

function err(
  rowNumber: number,
  code: string,
  message: string,
  field?: string,
  raw?: Record<string, string>,
): MigrationException {
  return { rowNumber, severity: 'error', code, message, field, raw };
}

function warn(
  rowNumber: number,
  code: string,
  message: string,
  field?: string,
  raw?: Record<string, string>,
): MigrationException {
  return { rowNumber, severity: 'warning', code, message, field, raw };
}

function parseBool(raw: string, defaultValue: boolean): boolean {
  const v = raw.trim().toLowerCase();
  if (!v) return defaultValue;
  if (['true', '1', 'yes', 'y'].includes(v)) return true;
  if (['false', '0', 'no', 'n'].includes(v)) return false;
  return defaultValue;
}

function collapseWs(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

export function validateCatalogueRaw(
  rowNumber: number,
  raw: Record<string, string>,
  seenLegacyIds: Set<string>,
  seenBarcodes: Set<string>,
): RowValidationResult<CatalogueRow> {
  const exceptions: MigrationException[] = [];
  const legacyProductId = (raw.legacyProductId ?? '').trim();
  const productName = collapseWs(raw.productName ?? '');
  const unitOfMeasure = (raw.unitOfMeasure ?? '').trim();
  const sellingRaw = (raw.sellingPrice ?? '').trim();
  const costRaw = (raw.costPrice ?? '').trim();
  const primaryBarcode = (raw.primaryBarcode ?? '').replace(/\s+/g, '').trim();
  const preferredSupplierLegacyId = (raw.preferredSupplierLegacyId ?? '').trim();
  const sku = (raw.sku ?? '').trim();
  const category = (raw.category ?? '').trim();
  const description = (raw.description ?? '').trim();
  const reorderRaw = (raw.reorderLevel ?? '').trim();

  if (!legacyProductId) {
    exceptions.push(err(rowNumber, 'MISSING_LEGACY_PRODUCT_ID', 'legacyProductId is required.', 'legacyProductId', raw));
  } else if (legacyProductId.length > 128) {
    exceptions.push(err(rowNumber, 'LEGACY_PRODUCT_ID_TOO_LONG', 'legacyProductId exceeds 128 characters.', 'legacyProductId', raw));
  } else if (seenLegacyIds.has(legacyProductId.toLowerCase())) {
    exceptions.push(err(rowNumber, 'DUPLICATE_LEGACY_PRODUCT_ID', 'legacyProductId is duplicated in this file.', 'legacyProductId', raw));
  } else {
    seenLegacyIds.add(legacyProductId.toLowerCase());
  }

  if (!productName) {
    exceptions.push(err(rowNumber, 'MISSING_PRODUCT_NAME', 'productName is required.', 'productName', raw));
  } else if (productName.length > 200) {
    exceptions.push(err(rowNumber, 'PRODUCT_NAME_TOO_LONG', 'productName exceeds 200 characters.', 'productName', raw));
  }

  if (!unitOfMeasure) {
    exceptions.push(err(rowNumber, 'MISSING_UNIT', 'unitOfMeasure is required.', 'unitOfMeasure', raw));
  }

  if (!sellingRaw) {
    exceptions.push(err(rowNumber, 'MISSING_SELLING_PRICE', 'sellingPrice is required.', 'sellingPrice', raw));
  }
  const sellingPrice = toPence(sellingRaw);
  if (sellingRaw && !(sellingPrice > 0)) {
    exceptions.push(err(rowNumber, 'INVALID_SELLING_PRICE', 'sellingPrice must be greater than zero.', 'sellingPrice', raw));
  }

  let costPrice = 0;
  if (costRaw) {
    costPrice = toPence(costRaw);
    if (costPrice < 0) {
      exceptions.push(err(rowNumber, 'INVALID_COST_PRICE', 'costPrice cannot be negative.', 'costPrice', raw));
    }
  }

  if (primaryBarcode) {
    if (seenBarcodes.has(primaryBarcode)) {
      exceptions.push(err(rowNumber, 'DUPLICATE_BARCODE_IN_FILE', 'primaryBarcode is duplicated in this file.', 'primaryBarcode', raw));
    } else {
      seenBarcodes.add(primaryBarcode);
    }
  } else {
    exceptions.push(warn(rowNumber, 'MISSING_BARCODE', 'primaryBarcode is blank — product can still import.', 'primaryBarcode', raw));
  }

  if (!category) {
    exceptions.push(warn(rowNumber, 'MISSING_CATEGORY', 'category is blank — product will be uncategorised.', 'category', raw));
  }

  let reorderLevel = 0;
  if (reorderRaw) {
    const n = Number(reorderRaw);
    if (!Number.isFinite(n) || n < 0) {
      exceptions.push(err(rowNumber, 'INVALID_REORDER_LEVEL', 'reorderLevel must be a non-negative number.', 'reorderLevel', raw));
    } else {
      reorderLevel = Math.round(n);
    }
  }

  const active = parseBool(raw.active ?? '', true);

  if (exceptions.some((e) => e.severity === 'error')) {
    return { ok: false, exceptions };
  }

  return {
    ok: true,
    exceptions,
    row: {
      rowNumber,
      legacyProductId,
      productName,
      description,
      category,
      sku,
      primaryBarcode,
      unitOfMeasure,
      sellingPrice,
      costPrice,
      preferredSupplierLegacyId,
      active,
      reorderLevel,
      raw,
    },
  };
}

export function validateSupplierRaw(
  rowNumber: number,
  raw: Record<string, string>,
  seenLegacyIds: Set<string>,
): RowValidationResult<SupplierRow> {
  const exceptions: MigrationException[] = [];
  const legacySupplierId = (raw.legacySupplierId ?? '').trim();
  const supplierName = collapseWs(raw.supplierName ?? '');
  const contactName = (raw.contactName ?? '').trim();
  const phone = (raw.phone ?? '').trim();
  const email = (raw.email ?? '').trim().toLowerCase();
  const address = (raw.address ?? '').trim();
  const activeRaw = (raw.active ?? '').trim();

  if (!legacySupplierId) {
    exceptions.push(err(rowNumber, 'MISSING_LEGACY_SUPPLIER_ID', 'legacySupplierId is required.', 'legacySupplierId', raw));
  } else if (seenLegacyIds.has(legacySupplierId.toLowerCase())) {
    exceptions.push(err(rowNumber, 'DUPLICATE_LEGACY_SUPPLIER_ID', 'legacySupplierId is duplicated in this file.', 'legacySupplierId', raw));
  } else {
    seenLegacyIds.add(legacySupplierId.toLowerCase());
  }

  if (!supplierName) {
    exceptions.push(err(rowNumber, 'MISSING_SUPPLIER_NAME', 'supplierName is required.', 'supplierName', raw));
  }

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    exceptions.push(err(rowNumber, 'INVALID_EMAIL', 'email does not look valid.', 'email', raw));
  }

  if (activeRaw && !parseBool(activeRaw, true)) {
    exceptions.push(
      warn(
        rowNumber,
        'SUPPLIER_ACTIVE_UNSUPPORTED',
        'Supplier active=false is not stored in Phase 1 — supplier will still be created.',
        'active',
        raw,
      ),
    );
  } else if (activeRaw) {
    exceptions.push(
      warn(
        rowNumber,
        'SUPPLIER_ACTIVE_UNSUPPORTED',
        'Supplier active flag is unsupported in Phase 1 and will not be persisted.',
        'active',
        raw,
      ),
    );
  }

  if (exceptions.some((e) => e.severity === 'error')) {
    return { ok: false, exceptions };
  }

  return {
    ok: true,
    exceptions,
    row: {
      rowNumber,
      legacySupplierId,
      supplierName,
      contactName,
      phone,
      email,
      address,
      activeRaw,
      raw,
    },
  };
}

export function validateOpeningStockRaw(
  rowNumber: number,
  raw: Record<string, string>,
  seenBranchProduct: Set<string>,
): RowValidationResult<OpeningStockRow> {
  const exceptions: MigrationException[] = [];
  const legacyProductId = (raw.legacyProductId ?? '').trim();
  const branchCode = (raw.branchCode ?? '').trim();
  const qtyRaw = raw.quantity;
  const hasQtyKey = Object.prototype.hasOwnProperty.call(raw, 'quantity');
  const unitCostRaw = (raw.unitCost ?? '').trim();
  const effectiveAt = (raw.effectiveAt ?? '').trim();
  const reference = (raw.reference ?? '').trim();

  if (!legacyProductId) {
    exceptions.push(err(rowNumber, 'MISSING_LEGACY_PRODUCT_ID', 'legacyProductId is required.', 'legacyProductId', raw));
  }
  if (!branchCode) {
    exceptions.push(err(rowNumber, 'MISSING_BRANCH_CODE', 'branchCode is required.', 'branchCode', raw));
  }

  if (legacyProductId && branchCode) {
    const key = `${legacyProductId.toLowerCase()}::${branchCode.toLowerCase()}`;
    if (seenBranchProduct.has(key)) {
      exceptions.push(
        err(
          rowNumber,
          'DUPLICATE_OPENING_STOCK_KEY',
          'Duplicate (legacyProductId, branchCode) in this file.',
          'legacyProductId',
          raw,
        ),
      );
    } else {
      seenBranchProduct.add(key);
    }
  }

  if (!hasQtyKey || String(qtyRaw ?? '').trim() === '') {
    exceptions.push(
      err(
        rowNumber,
        'MISSING_QUANTITY',
        'quantity is required — use 0 explicitly for zero stock.',
        'quantity',
        raw,
      ),
    );
  }

  const quantity = Number(String(qtyRaw ?? '').trim());
  if (String(qtyRaw ?? '').trim() !== '' && (!Number.isFinite(quantity) || quantity < 0)) {
    exceptions.push(err(rowNumber, 'INVALID_QUANTITY', 'quantity must be a non-negative number.', 'quantity', raw));
  }

  let unitCost: number | null = null;
  if (unitCostRaw) {
    const pence = toPence(unitCostRaw);
    if (pence < 0) {
      exceptions.push(err(rowNumber, 'INVALID_UNIT_COST', 'unitCost cannot be negative.', 'unitCost', raw));
    } else {
      unitCost = pence;
    }
  }

  if (effectiveAt) {
    const d = new Date(effectiveAt);
    if (Number.isNaN(d.getTime())) {
      exceptions.push(err(rowNumber, 'INVALID_EFFECTIVE_AT', 'effectiveAt must be a valid date/datetime.', 'effectiveAt', raw));
    }
  }

  if (exceptions.some((e) => e.severity === 'error')) {
    return { ok: false, exceptions };
  }

  return {
    ok: true,
    exceptions,
    row: {
      rowNumber,
      legacyProductId,
      branchCode,
      quantity,
      unitCost,
      effectiveAt,
      reference,
      raw,
    },
  };
}

export function validateRawRow(
  kind: MigrationTemplateKind,
  rowNumber: number,
  raw: Record<string, string>,
  state: {
    seenLegacyProductIds: Set<string>;
    seenLegacySupplierIds: Set<string>;
    seenBarcodes: Set<string>;
    seenOpeningKeys: Set<string>;
  },
): RowValidationResult {
  switch (kind) {
    case 'CATALOGUE':
      return validateCatalogueRaw(rowNumber, raw, state.seenLegacyProductIds, state.seenBarcodes);
    case 'SUPPLIERS':
      return validateSupplierRaw(rowNumber, raw, state.seenLegacySupplierIds);
    case 'OPENING_STOCK':
      return validateOpeningStockRaw(rowNumber, raw, state.seenOpeningKeys);
  }
}

export function emptyValidationState() {
  return {
    seenLegacyProductIds: new Set<string>(),
    seenLegacySupplierIds: new Set<string>(),
    seenBarcodes: new Set<string>(),
    seenOpeningKeys: new Set<string>(),
  };
}
