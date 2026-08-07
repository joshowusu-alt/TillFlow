/**
 * Slice 2A — bounded orphan cleanup that never deletes a referenced Blob.
 *
 * Invariant: never delete an object referenced by any successful MigrationFile.
 * Prefer retaining an uncertain orphan over deleting a live reference.
 *
 * Cleanup authority requires:
 * 1. server-owned pathname under the authenticated business/package/entity;
 * 2. prepared-upload identity (verified client token OR in-process server-minted path);
 * 3. a latest tenant-scoped DB reference check immediately before delete.
 *
 * A raw client pathname alone is never sufficient deletion authority.
 */

import { MigrationServiceError, safeMigrationLogFields } from '@/lib/services/migration/errors';
import { assertServerOwnedMigrationPathname } from '@/lib/services/migration/file-policy';
import type { DbClient } from '@/lib/services/migration/preapproval';
import type { MigrationObjectStorage } from '@/lib/services/migration/storage';
import type { MigrationEntityType } from '@/lib/migration/types';

export type CleanupOutcome =
  | 'deleted'
  | 'retained_referenced'
  | 'retained_uncertain'
  | 'retained_not_authorised';

export type PreparedUploadCleanupIdentity = {
  businessId: string;
  packageId: string;
  entityType: MigrationEntityType;
  /** Exact pathname authorised by prepare (or minted in-process). */
  preparedPathname: string;
};

/**
 * Attempt best-effort deletion of a newly prepared, unfinalised object only.
 * Never deletes when any MigrationFile in the business references the key.
 */
export async function safeDeleteUnreferencedMigrationObject(
  deps: {
    db: DbClient;
    storage: MigrationObjectStorage;
  },
  identity: PreparedUploadCleanupIdentity,
  candidatePathname: string,
): Promise<CleanupOutcome> {
  // 1. Candidate must be exactly the prepared pathname — never a client-nominated alternate.
  if (!candidatePathname || candidatePathname !== identity.preparedPathname) {
    console.error(
      '[migration.cleanup] retained_not_authorised: pathname mismatch',
      safeMigrationLogFields({
        code: 'CLEANUP_PATH_MISMATCH',
        businessId: identity.businessId,
        packageId: identity.packageId,
        entityType: identity.entityType,
      }),
    );
    return 'retained_not_authorised';
  }

  try {
    assertServerOwnedMigrationPathname({
      pathname: candidatePathname,
      businessId: identity.businessId,
      packageId: identity.packageId,
      entityType: identity.entityType,
    });
  } catch {
    return 'retained_not_authorised';
  }

  // 2. Latest reference check immediately before delete (race-safe vs concurrent finalise).
  let referenced = true;
  try {
    const count = await deps.db.migrationFile.count({
      where: {
        businessId: identity.businessId,
        storageKey: candidatePathname,
      },
    });
    referenced = count > 0;
  } catch (error) {
    console.error(
      '[migration.cleanup] retained_uncertain: reference check failed',
      safeMigrationLogFields({
        code: 'CLEANUP_REF_CHECK_FAILED',
        businessId: identity.businessId,
        packageId: identity.packageId,
        entityType: identity.entityType,
        storageKey: candidatePathname,
      }),
    );
    return 'retained_uncertain';
  }

  if (referenced) {
    console.error(
      '[migration.cleanup] retained_referenced: MigrationFile still points at object',
      safeMigrationLogFields({
        code: 'CLEANUP_REFERENCED',
        businessId: identity.businessId,
        packageId: identity.packageId,
        entityType: identity.entityType,
        storageKey: candidatePathname,
      }),
    );
    return 'retained_referenced';
  }

  try {
    await deps.storage.delete(candidatePathname);
    return 'deleted';
  } catch {
    // Deletion failure is non-fatal; object may remain as operational orphan.
    console.error(
      '[migration.cleanup] delete attempt failed; retaining object',
      safeMigrationLogFields({
        code: 'CLEANUP_DELETE_FAILED',
        businessId: identity.businessId,
        packageId: identity.packageId,
        storageKey: candidatePathname,
      }),
    );
    return 'retained_uncertain';
  }
}

/**
 * Verify a short-lived prepare token authorises cleanup/finalise of pathname.
 * Does not accept a raw pathname as authority.
 */
export async function assertPreparedUploadTokenMatchesPathname(
  storage: MigrationObjectStorage,
  input: { clientToken: string; pathname: string },
): Promise<void> {
  if (!input.clientToken || typeof input.clientToken !== 'string') {
    throw new MigrationServiceError('CONTRACT', undefined);
  }
  const ok = await storage.verifyClientUploadToken({
    clientToken: input.clientToken,
    pathname: input.pathname,
  });
  if (!ok) {
    throw new MigrationServiceError('CONTRACT', undefined);
  }
}
