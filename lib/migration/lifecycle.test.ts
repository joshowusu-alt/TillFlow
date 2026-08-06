/** @vitest-environment node */
import { describe, expect, it } from 'vitest';
import {
  assertPackageTransition,
  assertReconciliationTransition,
  canTransitionPackage,
  canTransitionReconciliation,
  isPackageLifecycleTerminal,
  isExpiryEligibleStatus,
} from '@/lib/migration/lifecycle';
import { MigrationLifecycleError } from '@/lib/migration/errors';
import { shouldExpireUnapprovedPackage, assertExpiryClockImmutable } from '@/lib/migration/expiry';
import { computePackageExpiresAt } from '@/lib/migration/limits';

describe('migration package lifecycle', () => {
  it('allows DRAFT → VALIDATED and DRAFT → VALIDATION_FAILED', () => {
    expect(canTransitionPackage('DRAFT', 'VALIDATED')).toBe(true);
    expect(canTransitionPackage('DRAFT', 'VALIDATION_FAILED')).toBe(true);
    assertPackageTransition('DRAFT', 'VALIDATED');
  });

  it('allows VALIDATED → APPROVED and APPROVED → IMPORTING → IMPORTED', () => {
    assertPackageTransition('VALIDATED', 'APPROVED');
    assertPackageTransition('APPROVED', 'IMPORTING');
    assertPackageTransition('IMPORTING', 'IMPORTED');
  });

  it('rejects forbidden transitions fail-closed', () => {
    expect(canTransitionPackage('DRAFT', 'APPROVED')).toBe(false);
    expect(canTransitionPackage('DRAFT', 'IMPORTED')).toBe(false);
    expect(canTransitionPackage('IMPORTED', 'DRAFT')).toBe(false);
    expect(() => assertPackageTransition('DRAFT', 'IMPORTING')).toThrow(MigrationLifecycleError);
  });

  it('treats IMPORTED, EXPIRED, CANCELLED as terminal', () => {
    expect(isPackageLifecycleTerminal('IMPORTED')).toBe(true);
    expect(isPackageLifecycleTerminal('EXPIRED')).toBe(true);
    expect(isPackageLifecycleTerminal('CANCELLED')).toBe(true);
    expect(isPackageLifecycleTerminal('APPROVED')).toBe(false);
  });

  it('allows approval invalidation from APPROVED only via APPROVAL_INVALIDATED', () => {
    assertPackageTransition('APPROVED', 'APPROVAL_INVALIDATED');
    expect(canTransitionPackage('IMPORTED', 'APPROVAL_INVALIDATED')).toBe(false);
  });

  it('keeps reconciliation separate from package lifecycle', () => {
    expect(canTransitionReconciliation('NOT_STARTED', 'RECONCILING')).toBe(true);
    expect(canTransitionReconciliation('RECONCILING', 'MATCHED')).toBe(true);
    expect(canTransitionReconciliation('NOT_STARTED', 'MATCHED')).toBe(false);
    expect(() => assertReconciliationTransition('MATCHED', 'MISMATCHED')).toThrow(
      MigrationLifecycleError,
    );
    // MATCHED is not a package status transition target from DRAFT
    expect(canTransitionPackage('DRAFT', 'IMPORTED')).toBe(false);
  });
});

describe('migration expiry rules', () => {
  it('expires only unapproved-eligible statuses after expiresAt', () => {
    const created = new Date('2026-08-01T00:00:00.000Z');
    const expiresAt = computePackageExpiresAt(created);
    expect(expiresAt.toISOString()).toBe('2026-08-15T00:00:00.000Z');

    expect(isExpiryEligibleStatus('DRAFT')).toBe(true);
    expect(isExpiryEligibleStatus('APPROVED')).toBe(false);

    expect(
      shouldExpireUnapprovedPackage({
        status: 'DRAFT',
        expiresAt,
        now: new Date('2026-08-14T23:59:59.000Z'),
      }),
    ).toBe(false);
    expect(
      shouldExpireUnapprovedPackage({
        status: 'DRAFT',
        expiresAt,
        now: new Date('2026-08-15T00:00:00.000Z'),
      }),
    ).toBe(true);
    expect(
      shouldExpireUnapprovedPackage({
        status: 'APPROVED',
        expiresAt,
        now: new Date('2026-09-01T00:00:00.000Z'),
      }),
    ).toBe(false);
  });

  it('does not restart expiry clock on file replacement', () => {
    const expiresAt = new Date('2026-08-20T00:00:00.000Z');
    expect(() =>
      assertExpiryClockImmutable({ previousExpiresAt: expiresAt, nextExpiresAt: expiresAt }),
    ).not.toThrow();
    expect(() =>
      assertExpiryClockImmutable({
        previousExpiresAt: expiresAt,
        nextExpiresAt: new Date('2026-08-25T00:00:00.000Z'),
      }),
    ).toThrow(/must not change/);
  });
});
