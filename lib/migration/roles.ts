/**
 * Locked Migration Framework role policy (P0).
 *
 * - Cashier: no migration access
 * - Manager: may upload / inspect / validate (when wired in P1+)
 * - Owner: final package approval
 * - Execution: future server-side authorised action (not implemented in P0)
 *
 * No migration-admin role. No mandatory dual control in Phase 1.
 */

import type { Role } from '@/lib/auth';
import { MigrationPolicyError } from '@/lib/migration/errors';

export function canAccessMigration(role: Role | null | undefined): boolean {
  return role === 'OWNER' || role === 'MANAGER';
}

export function canUploadOrValidateMigration(role: Role | null | undefined): boolean {
  return role === 'OWNER' || role === 'MANAGER';
}

/** Final package approval is Owner-only. */
export function canApproveMigrationPackage(role: Role | null | undefined): boolean {
  return role === 'OWNER';
}

/** Import execution is not exposed in P0; policy is locked for future use. */
export function canExecuteMigrationPackage(role: Role | null | undefined): boolean {
  return role === 'OWNER';
}

export function assertAuthenticatedMigrationActor(input: {
  userId: string | null | undefined;
  role: Role | null | undefined;
}): asserts input is { userId: string; role: Role } {
  if (!input.userId || !input.role) {
    throw new MigrationPolicyError('Authentication required for migration access.', 'UNAUTHENTICATED');
  }
}

export function assertCanAccessMigration(role: Role | null | undefined): void {
  if (!canAccessMigration(role)) {
    throw new MigrationPolicyError('Migration access denied for this role.', 'ROLE_DENIED');
  }
}

export function assertCanApproveMigrationPackage(role: Role | null | undefined): void {
  if (!canApproveMigrationPackage(role)) {
    throw new MigrationPolicyError(
      'Only an Owner may approve a migration package.',
      'APPROVAL_ROLE_DENIED',
    );
  }
}

export function assertSameBusinessActor(input: {
  actorBusinessId: string;
  packageBusinessId: string;
}): void {
  if (input.actorBusinessId !== input.packageBusinessId) {
    throw new MigrationPolicyError(
      'Cross-tenant migration access is denied.',
      'CROSS_TENANT_DENIED',
    );
  }
}
