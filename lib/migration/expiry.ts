/**
 * Expiry evaluation for unapproved packages.
 *
 * The expiry clock starts at package creation and is not restarted by file
 * replacement. Approved / importing / imported packages are not expired by the
 * 14-day rule.
 */

import { isExpiryEligibleStatus } from '@/lib/migration/lifecycle';
import type { MigrationPackageStatus } from '@/lib/migration/types';

export function shouldExpireUnapprovedPackage(input: {
  status: MigrationPackageStatus;
  expiresAt: Date;
  now?: Date;
}): boolean {
  if (!isExpiryEligibleStatus(input.status)) return false;
  const now = input.now ?? new Date();
  return now.getTime() >= input.expiresAt.getTime();
}

/**
 * File replacement must not mutate expiresAt. This helper documents and tests
 * the invariant: nextExpiresAt === previousExpiresAt.
 */
export function assertExpiryClockImmutable(input: {
  previousExpiresAt: Date;
  nextExpiresAt: Date;
}): void {
  if (input.previousExpiresAt.getTime() !== input.nextExpiresAt.getTime()) {
    throw new Error('Migration package expiresAt must not change when files are replaced.');
  }
}
