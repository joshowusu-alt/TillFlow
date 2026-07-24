import { describe, expect, it } from 'vitest';
import {
  assertReconciliationTransition,
  assertTransition,
  canReconciliationTransition,
  canTransition,
  importOutcomeStatus,
  isSuccessfullyReconciled,
  validationOutcomeStatus,
} from '@/lib/migration/lifecycle';

describe('migration lifecycle', () => {
  it('allows the Phase 1 happy path', () => {
    expect(canTransition('UPLOADED', 'VALIDATING')).toBe(true);
    expect(canTransition('VALIDATING', 'READY_FOR_APPROVAL')).toBe(true);
    expect(canTransition('READY_FOR_APPROVAL', 'APPROVED')).toBe(true);
    expect(canTransition('APPROVED', 'IMPORTING')).toBe(true);
    expect(canTransition('IMPORTING', 'COMPLETED')).toBe(true);
  });

  it('blocks skipping approval and recommit from completed', () => {
    expect(canTransition('READY_FOR_APPROVAL', 'IMPORTING')).toBe(false);
    expect(canTransition('COMPLETED', 'IMPORTING')).toBe(false);
    expect(() => assertTransition('READY_FOR_APPROVAL', 'IMPORTING')).toThrow(/Invalid/);
  });

  it('chooses validation outcomes', () => {
    expect(validationOutcomeStatus({ rowsValid: 0, rowsInvalid: 3 })).toBe('VALIDATION_FAILED');
    expect(validationOutcomeStatus({ rowsValid: 2, rowsInvalid: 1 })).toBe('READY_FOR_APPROVAL');
    expect(validationOutcomeStatus({ rowsValid: 5, rowsInvalid: 0 })).toBe('READY_FOR_APPROVAL');
  });

  it('chooses import outcomes', () => {
    expect(importOutcomeStatus({ rowsImported: 10, rowsFailed: 0 })).toBe('COMPLETED');
    expect(importOutcomeStatus({ rowsImported: 8, rowsFailed: 2 })).toBe('COMPLETED_WITH_EXCEPTIONS');
    expect(importOutcomeStatus({ rowsImported: 0, rowsFailed: 4 })).toBe('FAILED');
  });

  it('keeps reconciliation distinct from import completion', () => {
    expect(isSuccessfullyReconciled('NOT_STARTED')).toBe(false);
    expect(isSuccessfullyReconciled('PENDING')).toBe(false);
    expect(isSuccessfullyReconciled('MISMATCHED')).toBe(false);
    expect(isSuccessfullyReconciled('MATCHED')).toBe(true);
    expect(isSuccessfullyReconciled('ACCEPTED')).toBe(true);
    expect(canReconciliationTransition('MATCHED', 'ACCEPTED')).toBe(true);
    expect(canReconciliationTransition('ACCEPTED', 'PENDING')).toBe(false);
    expect(() => assertReconciliationTransition('ACCEPTED', 'MISMATCHED')).toThrow(/Invalid/);
  });
});
