/**
 * Package lifecycle and reconciliation transition rules (fail-closed).
 *
 * P1 closed contract:
 * - packages are mutable only before first APPROVED;
 * - APPROVAL_INVALIDATED is not an editable recovery state;
 * - SUPERSEDED is terminal (successor creation).
 */

import { MigrationLifecycleError } from '@/lib/migration/errors';
import type { MigrationPackageStatus, MigrationReconciliationStatus } from '@/lib/migration/types';

const PACKAGE_TRANSITIONS: Record<MigrationPackageStatus, MigrationPackageStatus[]> = {
  DRAFT: ['VALIDATED', 'VALIDATION_FAILED', 'CANCELLED', 'EXPIRED'],
  VALIDATED: ['APPROVED', 'DRAFT', 'VALIDATION_FAILED', 'CANCELLED', 'EXPIRED'],
  APPROVED: ['IMPORTING', 'APPROVAL_INVALIDATED', 'CANCELLED', 'SUPERSEDED'],
  IMPORTING: ['IMPORTED', 'IMPORT_FAILED'],
  IMPORTED: [],
  VALIDATION_FAILED: ['DRAFT', 'CANCELLED', 'EXPIRED'],
  APPROVAL_INVALIDATED: ['SUPERSEDED', 'CANCELLED', 'EXPIRED'],
  IMPORT_FAILED: ['IMPORTING', 'CANCELLED'],
  EXPIRED: [],
  CANCELLED: [],
  SUPERSEDED: [],
};

const RECON_TRANSITIONS: Record<MigrationReconciliationStatus, MigrationReconciliationStatus[]> = {
  NOT_STARTED: ['RECONCILING'],
  RECONCILING: ['MATCHED', 'MISMATCHED', 'RECONCILIATION_FAILED'],
  MATCHED: [],
  MISMATCHED: ['RECONCILING'],
  RECONCILIATION_FAILED: ['RECONCILING'],
};

export function canTransitionPackage(
  from: MigrationPackageStatus,
  to: MigrationPackageStatus,
): boolean {
  return PACKAGE_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertPackageTransition(
  from: MigrationPackageStatus,
  to: MigrationPackageStatus,
): void {
  if (!canTransitionPackage(from, to)) {
    throw new MigrationLifecycleError(`Invalid migration package transition: ${from} → ${to}`);
  }
}

export function canTransitionReconciliation(
  from: MigrationReconciliationStatus,
  to: MigrationReconciliationStatus,
): boolean {
  return RECON_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertReconciliationTransition(
  from: MigrationReconciliationStatus,
  to: MigrationReconciliationStatus,
): void {
  if (!canTransitionReconciliation(from, to)) {
    throw new MigrationLifecycleError(`Invalid reconciliation transition: ${from} → ${to}`);
  }
}

/** Import completion does not imply successful reconciliation. */
export function isPackageLifecycleTerminal(status: MigrationPackageStatus): boolean {
  return (
    status === 'IMPORTED' ||
    status === 'EXPIRED' ||
    status === 'CANCELLED' ||
    status === 'SUPERSEDED'
  );
}

export function isReconciliationTerminal(status: MigrationReconciliationStatus): boolean {
  return status === 'MATCHED';
}

/** Statuses subject to the 14-day unapproved (draft) expiry rule. */
export function isExpiryEligibleStatus(status: MigrationPackageStatus): boolean {
  return (
    status === 'DRAFT' ||
    status === 'VALIDATED' ||
    status === 'VALIDATION_FAILED' ||
    status === 'APPROVAL_INVALIDATED'
  );
}

/** Pre-approval mutable statuses (files/mappings may change). */
export function isPreApprovalMutableStatus(status: MigrationPackageStatus): boolean {
  return status === 'DRAFT' || status === 'VALIDATED' || status === 'VALIDATION_FAILED';
}

/** Material change after approval must move APPROVED → APPROVAL_INVALIDATED. */
export function assertCanInvalidateApproval(status: MigrationPackageStatus): void {
  assertPackageTransition(status, 'APPROVAL_INVALIDATED');
}

/** Successor creation transitions predecessor to SUPERSEDED. */
export function assertCanSupersedePackage(status: MigrationPackageStatus): void {
  assertPackageTransition(status, 'SUPERSEDED');
}
