/**
 * Migration Framework P0 — shared types and locked Phase 1 constants.
 *
 * Provenance: adapted from historic lib/migration/types.ts (0f6a917) for the
 * package-oriented model; statuses and entity names follow the P0 lock.
 */

export const MIGRATION_CONTRACT_VERSION = '1' as const;

export const MIGRATION_ENTITY_TYPES = ['SUPPLIERS', 'PRODUCTS', 'OPENING_STOCK'] as const;
export type MigrationEntityType = (typeof MIGRATION_ENTITY_TYPES)[number];

export const MIGRATION_PACKAGE_STATUSES = [
  'DRAFT',
  'VALIDATED',
  'APPROVED',
  'IMPORTING',
  'IMPORTED',
  'VALIDATION_FAILED',
  'APPROVAL_INVALIDATED',
  'IMPORT_FAILED',
  'EXPIRED',
  'CANCELLED',
] as const;
export type MigrationPackageStatus = (typeof MIGRATION_PACKAGE_STATUSES)[number];

export const MIGRATION_RECONCILIATION_STATUSES = [
  'NOT_STARTED',
  'RECONCILING',
  'MATCHED',
  'MISMATCHED',
  'RECONCILIATION_FAILED',
] as const;
export type MigrationReconciliationStatus = (typeof MIGRATION_RECONCILIATION_STATUSES)[number];

/** Fields prohibited in Phase 1 source files (extension points only). */
export const PHASE1_PROHIBITED_FIELDS = [
  'supplierBalance',
  'supplier_balance',
  'openingBalance',
  'opening_balance',
  'customerId',
  'customer_id',
  'debtorBalance',
  'debtor_balance',
  'loyaltyPoints',
  'loyalty_points',
  'salesHistory',
  'purchaseHistory',
  'cashBalance',
  'momoBalance',
  'shiftId',
] as const;

export function isMigrationEntityType(value: string): value is MigrationEntityType {
  return (MIGRATION_ENTITY_TYPES as readonly string[]).includes(value);
}

export function isMigrationPackageStatus(value: string): value is MigrationPackageStatus {
  return (MIGRATION_PACKAGE_STATUSES as readonly string[]).includes(value);
}

export function isMigrationReconciliationStatus(
  value: string,
): value is MigrationReconciliationStatus {
  return (MIGRATION_RECONCILIATION_STATUSES as readonly string[]).includes(value);
}

export type MigrationFieldRequirement = 'required' | 'optional' | 'prohibited';

export type MigrationFieldSpec = {
  key: string;
  label: string;
  requirement: MigrationFieldRequirement;
  validation: string;
  normalisation?: string;
  maxLength?: number;
  failureSeverity: 'blocking' | 'warning';
};

export type CanonicalBranchMapping = {
  sourceBranchKey: string;
  targetStoreId: string;
};

export type CanonicalFileIdentity = {
  entityType: MigrationEntityType;
  /** SHA-256 hex of exact file bytes. */
  checksum: string;
};

export type CanonicalPackageManifest = {
  contractVersion: string;
  sourceSystemKey: string;
  sourceBusinessKey: string;
  reportingCurrency: string;
  packageAsOfDate: string;
  files: CanonicalFileIdentity[];
  branchMappings: CanonicalBranchMapping[];
};
