/**
 * Versioned TillFlow migration contract — field specifications for Phase 1 templates.
 * Source systems transform into these headers before upload; no vendor names here.
 */

import type { MigrationFieldSpec, MigrationTemplateKind } from '@/lib/migration/types';
import { MIGRATION_CONTRACT_VERSION } from '@/lib/migration/types';

export { MIGRATION_CONTRACT_VERSION };

export const CATALOGUE_HEADERS = [
  'legacyProductId',
  'productName',
  'description',
  'category',
  'sku',
  'primaryBarcode',
  'unitOfMeasure',
  'sellingPrice',
  'costPrice',
  'preferredSupplierLegacyId',
  'active',
  'reorderLevel',
] as const;

export const SUPPLIER_HEADERS = [
  'legacySupplierId',
  'supplierName',
  'contactName',
  'phone',
  'email',
  'address',
  'active',
] as const;

export const OPENING_STOCK_HEADERS = [
  'legacyProductId',
  'branchCode',
  'quantity',
  'unitCost',
  'effectiveAt',
  'reference',
] as const;

/** Columns that must never be accepted as Phase 1 import inputs. */
export const PHASE1_UNSUPPORTED_HEADERS = [
  'secondaryBarcode',
  'alternateBarcode',
  'packBarcode',
  'customerId',
  'debtorBalance',
  'supplierBalance',
  'historicalSaleId',
  'paymentMethod',
  'cashierId',
  'loyaltyPoints',
] as const;

export const CATALOGUE_FIELD_SPECS: MigrationFieldSpec[] = [
  {
    key: 'legacyProductId',
    label: 'Legacy product ID',
    requirement: 'required',
    dataType: 'string',
    acceptedFormat: 'Non-empty stable ID from the transformed export',
    maxLength: 128,
    normalisation: 'trim',
    validation: 'Required; unique within file',
    duplicateKey: true,
    defaultBehaviour: 'No default',
    blankMeaning: 'missing',
    participatesInReconciliation: true,
    mayTransformBeforeUpload: true,
    tillflowTarget: 'MigrationEntityMap.sourceReference (PRODUCT)',
  },
  {
    key: 'productName',
    label: 'Product name',
    requirement: 'required',
    dataType: 'string',
    acceptedFormat: 'Display name',
    maxLength: 200,
    normalisation: 'trim; collapse internal whitespace',
    validation: 'Required; business-unique on Product.name',
    duplicateKey: false,
    defaultBehaviour: 'No default',
    blankMeaning: 'missing',
    participatesInReconciliation: true,
    mayTransformBeforeUpload: true,
    tillflowTarget: 'Product.name',
  },
  {
    key: 'description',
    label: 'Description',
    requirement: 'optional',
    dataType: 'string',
    acceptedFormat: 'Plain text',
    maxLength: 2000,
    normalisation: 'trim',
    validation: 'Optional',
    defaultBehaviour: 'Omit',
    blankMeaning: 'missing',
    participatesInReconciliation: false,
    mayTransformBeforeUpload: true,
    tillflowTarget: 'Product.storefrontDescription',
  },
  {
    key: 'category',
    label: 'Category',
    requirement: 'optional',
    dataType: 'string',
    acceptedFormat: 'Flat category name (hierarchy must be flattened before upload)',
    maxLength: 120,
    normalisation: 'trim',
    validation: 'Creates Category by name when missing',
    defaultBehaviour: 'Uncategorised product',
    blankMeaning: 'missing',
    participatesInReconciliation: true,
    mayTransformBeforeUpload: true,
    tillflowTarget: 'Category.name → Product.categoryId',
    notes: 'Subcategory/group paths must be flattened by the transformer.',
  },
  {
    key: 'sku',
    label: 'SKU',
    requirement: 'optional',
    dataType: 'string',
    acceptedFormat: 'Merchant SKU',
    maxLength: 64,
    normalisation: 'trim',
    validation: 'Optional',
    defaultBehaviour: 'Omit',
    blankMeaning: 'missing',
    participatesInReconciliation: false,
    mayTransformBeforeUpload: true,
    tillflowTarget: 'Product.sku',
  },
  {
    key: 'primaryBarcode',
    label: 'Primary barcode',
    requirement: 'optional',
    dataType: 'string',
    acceptedFormat: 'Digits/alphanumeric barcode',
    maxLength: 64,
    normalisation: 'trim; strip spaces',
    validation: 'Must be unique globally when set; collisions become row errors',
    defaultBehaviour: 'Omit',
    blankMeaning: 'missing',
    participatesInReconciliation: true,
    mayTransformBeforeUpload: true,
    tillflowTarget: 'Product.barcode',
    notes: 'Alternate/pack barcodes are unsupported in Phase 1.',
  },
  {
    key: 'unitOfMeasure',
    label: 'Unit of measure',
    requirement: 'required',
    dataType: 'string',
    acceptedFormat: 'Base sell unit name (e.g. Each, Bottle)',
    maxLength: 64,
    normalisation: 'trim',
    validation: 'Required',
    defaultBehaviour: 'No default',
    blankMeaning: 'missing',
    participatesInReconciliation: false,
    mayTransformBeforeUpload: true,
    tillflowTarget: 'Unit + ProductUnit (base)',
  },
  {
    key: 'sellingPrice',
    label: 'Selling price',
    requirement: 'required',
    dataType: 'money',
    acceptedFormat: 'Decimal in business currency major units (e.g. 12.50)',
    normalisation: 'strip commas → pence',
    validation: 'Must be > 0',
    defaultBehaviour: 'No default',
    blankMeaning: 'missing',
    participatesInReconciliation: true,
    mayTransformBeforeUpload: true,
    tillflowTarget: 'Product.sellingPriceBasePence',
  },
  {
    key: 'costPrice',
    label: 'Cost price',
    requirement: 'optional',
    dataType: 'money',
    acceptedFormat: 'Decimal major units',
    normalisation: 'strip commas → pence',
    validation: 'Must be ≥ 0 when present',
    defaultBehaviour: '0 (missing cost)',
    blankMeaning: 'zero',
    participatesInReconciliation: true,
    mayTransformBeforeUpload: true,
    tillflowTarget: 'Product.defaultCostBasePence',
  },
  {
    key: 'preferredSupplierLegacyId',
    label: 'Preferred supplier legacy ID',
    requirement: 'optional',
    dataType: 'string',
    acceptedFormat: 'Must match a SUPPLIERS template legacySupplierId when set',
    maxLength: 128,
    normalisation: 'trim',
    validation: 'Resolved via MigrationEntityMap on import',
    defaultBehaviour: 'No preferred supplier',
    blankMeaning: 'missing',
    participatesInReconciliation: true,
    mayTransformBeforeUpload: true,
    tillflowTarget: 'Product.preferredSupplierId',
  },
  {
    key: 'active',
    label: 'Active',
    requirement: 'optional',
    dataType: 'boolean',
    acceptedFormat: 'true/false/1/0/yes/no',
    normalisation: 'boolean parse; default true',
    validation: 'Optional',
    defaultBehaviour: 'true',
    blankMeaning: 'default',
    participatesInReconciliation: true,
    mayTransformBeforeUpload: true,
    tillflowTarget: 'Product.active',
  },
  {
    key: 'reorderLevel',
    label: 'Reorder level',
    requirement: 'optional',
    dataType: 'number',
    acceptedFormat: 'Non-negative integer (base units)',
    normalisation: 'integer ≥ 0',
    validation: 'Optional',
    defaultBehaviour: '0',
    blankMeaning: 'zero',
    participatesInReconciliation: false,
    mayTransformBeforeUpload: true,
    tillflowTarget: 'Product.reorderPointBase',
  },
];

export const SUPPLIER_FIELD_SPECS: MigrationFieldSpec[] = [
  {
    key: 'legacySupplierId',
    label: 'Legacy supplier ID',
    requirement: 'required',
    dataType: 'string',
    acceptedFormat: 'Stable ID',
    maxLength: 128,
    normalisation: 'trim',
    validation: 'Required; unique within file',
    duplicateKey: true,
    defaultBehaviour: 'No default',
    blankMeaning: 'missing',
    participatesInReconciliation: true,
    mayTransformBeforeUpload: true,
    tillflowTarget: 'MigrationEntityMap.sourceReference (SUPPLIER)',
  },
  {
    key: 'supplierName',
    label: 'Supplier name',
    requirement: 'required',
    dataType: 'string',
    acceptedFormat: 'Display name',
    maxLength: 200,
    normalisation: 'trim',
    validation: 'Required',
    defaultBehaviour: 'No default',
    blankMeaning: 'missing',
    participatesInReconciliation: true,
    mayTransformBeforeUpload: true,
    tillflowTarget: 'Supplier.name',
  },
  {
    key: 'contactName',
    label: 'Contact name',
    requirement: 'optional',
    dataType: 'string',
    acceptedFormat: 'Plain text',
    maxLength: 120,
    normalisation: 'trim',
    validation: 'Stored in notes',
    defaultBehaviour: 'Omit',
    blankMeaning: 'missing',
    participatesInReconciliation: false,
    mayTransformBeforeUpload: true,
    tillflowTarget: 'Supplier.notes (prefixed)',
  },
  {
    key: 'phone',
    label: 'Phone',
    requirement: 'optional',
    dataType: 'string',
    acceptedFormat: 'Phone string',
    maxLength: 40,
    normalisation: 'trim',
    validation: 'Optional',
    defaultBehaviour: 'Omit',
    blankMeaning: 'missing',
    participatesInReconciliation: true,
    mayTransformBeforeUpload: true,
    tillflowTarget: 'Supplier.phone',
  },
  {
    key: 'email',
    label: 'Email',
    requirement: 'optional',
    dataType: 'string',
    acceptedFormat: 'Email',
    maxLength: 120,
    normalisation: 'trim; lowercase',
    validation: 'Optional basic shape check',
    defaultBehaviour: 'Omit',
    blankMeaning: 'missing',
    participatesInReconciliation: true,
    mayTransformBeforeUpload: true,
    tillflowTarget: 'Supplier.email',
  },
  {
    key: 'address',
    label: 'Address',
    requirement: 'optional',
    dataType: 'string',
    acceptedFormat: 'Plain text',
    maxLength: 500,
    normalisation: 'trim',
    validation: 'Stored in notes',
    defaultBehaviour: 'Omit',
    blankMeaning: 'missing',
    participatesInReconciliation: false,
    mayTransformBeforeUpload: true,
    tillflowTarget: 'Supplier.notes (prefixed)',
  },
  {
    key: 'active',
    label: 'Active',
    requirement: 'unsupported',
    dataType: 'boolean',
    acceptedFormat: 'Ignored for persistence in Phase 1',
    normalisation: 'read for warning only',
    validation: 'Supplier has no active flag — value is not stored',
    defaultBehaviour: 'Ignored',
    blankMeaning: 'missing',
    participatesInReconciliation: false,
    mayTransformBeforeUpload: true,
    tillflowTarget: '(none)',
    notes: 'Column may appear for transformer compatibility; emits a warning if false.',
  },
];

export const OPENING_STOCK_FIELD_SPECS: MigrationFieldSpec[] = [
  {
    key: 'legacyProductId',
    label: 'Legacy product ID',
    requirement: 'required',
    dataType: 'string',
    acceptedFormat: 'Must match a catalogue legacyProductId already mapped or in prior CATALOGUE batch',
    maxLength: 128,
    normalisation: 'trim',
    validation: 'Required',
    duplicateKey: false,
    defaultBehaviour: 'No default',
    blankMeaning: 'missing',
    participatesInReconciliation: true,
    mayTransformBeforeUpload: true,
    tillflowTarget: 'MigrationEntityMap → Product.id',
    notes: 'Duplicate key for opening stock is (legacyProductId, branchCode).',
  },
  {
    key: 'branchCode',
    label: 'Branch code',
    requirement: 'required',
    dataType: 'string',
    acceptedFormat: 'Matches Branch.code or Store.name within the tenant',
    maxLength: 64,
    normalisation: 'trim',
    validation: 'Required; must resolve to a store in this business',
    duplicateKey: true,
    defaultBehaviour: 'No default',
    blankMeaning: 'missing',
    participatesInReconciliation: true,
    mayTransformBeforeUpload: true,
    tillflowTarget: 'Store.id via Branch/Store lookup',
  },
  {
    key: 'quantity',
    label: 'Quantity',
    requirement: 'required',
    dataType: 'number',
    acceptedFormat: 'Non-negative number in base units',
    normalisation: 'number',
    validation: 'Required; ≥ 0; blank is invalid (use 0 explicitly)',
    defaultBehaviour: 'No default',
    blankMeaning: 'missing',
    participatesInReconciliation: true,
    mayTransformBeforeUpload: true,
    tillflowTarget: 'InventoryBalance via recordOpeningInventory',
  },
  {
    key: 'unitCost',
    label: 'Unit cost',
    requirement: 'optional',
    dataType: 'money',
    acceptedFormat: 'Decimal major units',
    normalisation: '→ pence',
    validation: '≥ 0 when present; blank = quantity-only (unvalued)',
    defaultBehaviour: 'Unvalued opening qty',
    blankMeaning: 'missing',
    participatesInReconciliation: true,
    mayTransformBeforeUpload: true,
    tillflowTarget: 'Opening inventory unit cost / avg cost',
  },
  {
    key: 'effectiveAt',
    label: 'Effective at',
    requirement: 'optional',
    dataType: 'date',
    acceptedFormat: 'ISO date or datetime',
    normalisation: 'trim; stored on batch summary only in Phase 1',
    validation: 'Optional; journals are not backdated in Phase 1',
    defaultBehaviour: 'Import time',
    blankMeaning: 'default',
    participatesInReconciliation: false,
    mayTransformBeforeUpload: true,
    tillflowTarget: 'MigrationBatch.summaryJson (cutover note)',
    notes: 'Does not rewrite StockMovement.createdAt in Phase 1.',
  },
  {
    key: 'reference',
    label: 'Reference',
    requirement: 'optional',
    dataType: 'string',
    acceptedFormat: 'Operator reference',
    maxLength: 120,
    normalisation: 'trim',
    validation: 'Optional',
    defaultBehaviour: 'Batch-derived reference',
    blankMeaning: 'missing',
    participatesInReconciliation: false,
    mayTransformBeforeUpload: true,
    tillflowTarget: 'StockMovement / journal description context',
  },
];

export function headersForTemplate(kind: MigrationTemplateKind): readonly string[] {
  switch (kind) {
    case 'CATALOGUE':
      return CATALOGUE_HEADERS;
    case 'SUPPLIERS':
      return SUPPLIER_HEADERS;
    case 'OPENING_STOCK':
      return OPENING_STOCK_HEADERS;
  }
}

export function fieldSpecsForTemplate(kind: MigrationTemplateKind): MigrationFieldSpec[] {
  switch (kind) {
    case 'CATALOGUE':
      return CATALOGUE_FIELD_SPECS;
    case 'SUPPLIERS':
      return SUPPLIER_FIELD_SPECS;
    case 'OPENING_STOCK':
      return OPENING_STOCK_FIELD_SPECS;
  }
}

export function templateCsv(kind: MigrationTemplateKind): string {
  const headers = headersForTemplate(kind);
  const example = exampleRow(kind);
  const guide = `# TillFlow migration template ${kind} v${MIGRATION_CONTRACT_VERSION}`;
  const note =
    '# Transform your source export into these exact headers before upload. Do not add source-system columns.';
  return [guide, note, headers.join(','), example.join(',')].join('\n') + '\n';
}

function exampleRow(kind: MigrationTemplateKind): string[] {
  switch (kind) {
    case 'CATALOGUE':
      return [
        'P-1001',
        'Example Rice 5kg',
        'Long grain',
        'Groceries',
        'SKU-1001',
        '1234567890123',
        'Each',
        '45.00',
        '32.00',
        'S-10',
        'true',
        '5',
      ];
    case 'SUPPLIERS':
      return ['S-10', 'Example Foods Ltd', 'Ama Mensah', '0240000000', 'supply@example.com', 'Accra', 'true'];
    case 'OPENING_STOCK':
      return ['P-1001', 'MAIN', '24', '32.00', '2026-09-01T06:00:00Z', 'CUTOVER-1'];
  }
}
