/**
 * Source-neutral migration framework types (Phase 1).
 * External systems must transform into these contracts before upload.
 */

export const MIGRATION_CONTRACT_VERSION = '1.0.0' as const;

export const MIGRATION_TEMPLATE_KINDS = ['CATALOGUE', 'SUPPLIERS', 'OPENING_STOCK'] as const;
export type MigrationTemplateKind = (typeof MIGRATION_TEMPLATE_KINDS)[number];

export const MIGRATION_STATUSES = [
  'UPLOADED',
  'VALIDATING',
  'VALIDATION_FAILED',
  'READY_FOR_APPROVAL',
  'APPROVED',
  'IMPORTING',
  'COMPLETED',
  'COMPLETED_WITH_EXCEPTIONS',
  'FAILED',
] as const;
export type MigrationBatchStatus = (typeof MIGRATION_STATUSES)[number];

export const MIGRATION_RECONCILIATION_STATUSES = [
  'NOT_STARTED',
  'PENDING',
  'MATCHED',
  'MISMATCHED',
  'ACCEPTED',
] as const;
export type MigrationReconciliationStatus = (typeof MIGRATION_RECONCILIATION_STATUSES)[number];

export const MIGRATION_ENTITY_TYPES = ['PRODUCT', 'SUPPLIER', 'CATEGORY'] as const;
export type MigrationEntityType = (typeof MIGRATION_ENTITY_TYPES)[number];

export const MIGRATION_CHUNK_PHASES = ['VALIDATE', 'IMPORT'] as const;
export type MigrationChunkPhase = (typeof MIGRATION_CHUNK_PHASES)[number];

export type FieldRequirement = 'required' | 'optional' | 'conditionally_required' | 'unsupported';

export type BlankMeaning = 'missing' | 'clear' | 'zero' | 'default';

export type MigrationFieldSpec = {
  key: string;
  label: string;
  requirement: FieldRequirement;
  dataType: 'string' | 'number' | 'boolean' | 'date' | 'money';
  acceptedFormat: string;
  maxLength?: number;
  normalisation: string;
  validation: string;
  duplicateKey?: boolean;
  defaultBehaviour: string;
  blankMeaning: BlankMeaning;
  participatesInReconciliation: boolean;
  mayTransformBeforeUpload: boolean;
  tillflowTarget: string;
  notes?: string;
};

export type MigrationException = {
  rowNumber: number;
  severity: 'error' | 'warning';
  code: string;
  message: string;
  field?: string;
  /** Never log raw PII externally; retained only in capped exception JSON. */
  raw?: Record<string, string>;
};

export type CatalogueRow = {
  rowNumber: number;
  legacyProductId: string;
  productName: string;
  description: string;
  category: string;
  sku: string;
  primaryBarcode: string;
  unitOfMeasure: string;
  sellingPrice: number;
  costPrice: number;
  preferredSupplierLegacyId: string;
  active: boolean;
  reorderLevel: number;
  raw: Record<string, string>;
};

export type SupplierRow = {
  rowNumber: number;
  legacySupplierId: string;
  supplierName: string;
  contactName: string;
  phone: string;
  email: string;
  address: string;
  /** Present in file but not persisted as a Supplier.active column in Phase 1. */
  activeRaw: string;
  raw: Record<string, string>;
};

export type OpeningStockRow = {
  rowNumber: number;
  legacyProductId: string;
  branchCode: string;
  quantity: number;
  unitCost: number | null;
  effectiveAt: string;
  reference: string;
  raw: Record<string, string>;
};

export type MigrationRow = CatalogueRow | SupplierRow | OpeningStockRow;

export type RowValidationResult<T extends MigrationRow = MigrationRow> = {
  ok: boolean;
  row?: T;
  exceptions: MigrationException[];
};

export type CatalogueReconciliation = {
  templateKind: 'CATALOGUE';
  rowsValid: number;
  distinctLegacyProductIds: number;
  distinctCategories: number;
  distinctPreferredSuppliers: number;
  withBarcode: number;
  withCost: number;
  activeCount: number;
  inactiveCount: number;
  sumSellingPrice: number;
  sumCostPrice: number;
};

export type SupplierReconciliation = {
  templateKind: 'SUPPLIERS';
  rowsValid: number;
  distinctLegacySupplierIds: number;
  withPhone: number;
  withEmail: number;
};

export type OpeningStockReconciliation = {
  templateKind: 'OPENING_STOCK';
  rowsValid: number;
  distinctLegacyProductIds: number;
  distinctBranchCodes: number;
  totalQuantity: number;
  valuedLines: number;
  unvaluedLines: number;
  totalStockValue: number;
};

export type MigrationReconciliation =
  | CatalogueReconciliation
  | SupplierReconciliation
  | OpeningStockReconciliation;

export function isMigrationTemplateKind(value: unknown): value is MigrationTemplateKind {
  return typeof value === 'string' && (MIGRATION_TEMPLATE_KINDS as readonly string[]).includes(value);
}

export function isMigrationBatchStatus(value: unknown): value is MigrationBatchStatus {
  return typeof value === 'string' && (MIGRATION_STATUSES as readonly string[]).includes(value);
}

export function isMigrationReconciliationStatus(
  value: unknown,
): value is MigrationReconciliationStatus {
  return (
    typeof value === 'string' &&
    (MIGRATION_RECONCILIATION_STATUSES as readonly string[]).includes(value)
  );
}
