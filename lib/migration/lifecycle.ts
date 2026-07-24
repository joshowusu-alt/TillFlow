import type { MigrationBatchStatus, MigrationReconciliationStatus } from '@/lib/migration/types';

const TRANSITIONS: Record<MigrationBatchStatus, MigrationBatchStatus[]> = {
  UPLOADED: ['VALIDATING', 'FAILED'],
  VALIDATING: ['VALIDATION_FAILED', 'READY_FOR_APPROVAL', 'FAILED'],
  VALIDATION_FAILED: ['UPLOADED', 'VALIDATING'],
  READY_FOR_APPROVAL: ['APPROVED', 'FAILED'],
  APPROVED: ['IMPORTING', 'FAILED'],
  IMPORTING: ['COMPLETED', 'COMPLETED_WITH_EXCEPTIONS', 'FAILED'],
  COMPLETED: [],
  COMPLETED_WITH_EXCEPTIONS: [],
  FAILED: ['UPLOADED'],
};

const RECON_TRANSITIONS: Record<MigrationReconciliationStatus, MigrationReconciliationStatus[]> = {
  NOT_STARTED: ['PENDING'],
  PENDING: ['MATCHED', 'MISMATCHED', 'NOT_STARTED'],
  MATCHED: ['ACCEPTED'],
  MISMATCHED: ['ACCEPTED', 'PENDING'],
  ACCEPTED: [],
};

export function canTransition(from: MigrationBatchStatus, to: MigrationBatchStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransition(from: MigrationBatchStatus, to: MigrationBatchStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid migration lifecycle transition: ${from} → ${to}`);
  }
}

export function canReconciliationTransition(
  from: MigrationReconciliationStatus,
  to: MigrationReconciliationStatus,
): boolean {
  return RECON_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertReconciliationTransition(
  from: MigrationReconciliationStatus,
  to: MigrationReconciliationStatus,
): void {
  if (!canReconciliationTransition(from, to)) {
    throw new Error(`Invalid reconciliation transition: ${from} → ${to}`);
  }
}

export function validationOutcomeStatus(input: {
  rowsValid: number;
  rowsInvalid: number;
}): Extract<MigrationBatchStatus, 'VALIDATION_FAILED' | 'READY_FOR_APPROVAL'> {
  if (input.rowsValid <= 0) return 'VALIDATION_FAILED';
  return 'READY_FOR_APPROVAL';
}

export function importOutcomeStatus(input: {
  rowsFailed: number;
  rowsImported: number;
}): Extract<MigrationBatchStatus, 'COMPLETED' | 'COMPLETED_WITH_EXCEPTIONS' | 'FAILED'> {
  if (input.rowsImported <= 0 && input.rowsFailed > 0) return 'FAILED';
  if (input.rowsFailed > 0) return 'COMPLETED_WITH_EXCEPTIONS';
  return 'COMPLETED';
}

/** Import completion does not imply successful reconciliation. */
export function isImportTerminal(status: MigrationBatchStatus): boolean {
  return status === 'COMPLETED' || status === 'COMPLETED_WITH_EXCEPTIONS' || status === 'FAILED';
}

export function isSuccessfullyReconciled(status: MigrationReconciliationStatus): boolean {
  return status === 'MATCHED' || status === 'ACCEPTED';
}
