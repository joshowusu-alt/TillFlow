/**
 * Slice 2A — failure-path / unfinalised-object retention (Option B).
 *
 * Locked invariant: no failure-path cleanup may delete a Blob if a concurrent
 * operation can establish (or has established) a successful MigrationFile
 * reference to that Blob.
 *
 * A PostgreSQL reference count followed by an external Blob delete is a
 * classic TOCTOU race and is NOT race-safe. Slice 2A has no schema-backed
 * deletion lease / advisory-lock convention that covers both reference
 * creation and Blob I/O outside short DB transactions.
 *
 * Therefore synchronous automatic Blob deletion is disabled. Failed or
 * unused prepared uploads are deliberately retained. Bounded operational
 * orphans under the `mig/` prefix are preferable to a successful database
 * record referencing a missing object. Automatic orphan collection is
 * deferred to separately authorised lifecycle work.
 *
 * Authority checks below exist only to sanitise operational logs and to
 * reject treating a raw client pathname as cleanup authority — they never
 * authorise deletion.
 */

import { MigrationServiceError, safeMigrationLogFields } from '@/lib/services/migration/errors';
import { assertServerOwnedMigrationPathname } from '@/lib/services/migration/file-policy';
import type { MigrationEntityType } from '@/lib/migration/types';

export type CleanupOutcome =
  | 'retained_deferred'
  | 'retained_not_authorised';

export type PreparedUploadCleanupIdentity = {
  businessId: string;
  packageId: string;
  entityType: MigrationEntityType;
  /** Exact pathname authorised by prepare (or minted in-process). */
  preparedPathname: string;
};

/** Optional deterministic test hook — never used for deletion. */
export type DeferredCleanupTestHooks = {
  /**
   * Invoked after prepared-identity validation, before returning deferred
   * retention. Used to prove concurrent reference creation can commit while
   * cleanup holds no delete authority (Option B critical interleaving).
   */
  afterRetentionDecision?: () => Promise<void>;
};

/**
 * Record that an unfinalised prepared upload is retained (no Blob delete).
 *
 * Does not call storage.delete. Prefer retaining an orphan over risking a
 * dangling MigrationFile.storageKey.
 */
export async function deferUnfinalisedMigrationObjectCleanup(
  identity: PreparedUploadCleanupIdentity,
  candidatePathname: string,
  hooks: DeferredCleanupTestHooks = {},
): Promise<CleanupOutcome> {
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

  console.error(
    '[migration.cleanup] retained_deferred: synchronous Blob delete disabled (TOCTOU)',
    safeMigrationLogFields({
      code: 'CLEANUP_DEFERRED',
      businessId: identity.businessId,
      packageId: identity.packageId,
      entityType: identity.entityType,
      storageKey: candidatePathname,
    }),
  );

  if (hooks.afterRetentionDecision) {
    await hooks.afterRetentionDecision();
  }

  return 'retained_deferred';
}

/**
 * @deprecated Name retained for call-site clarity during Option B — does not delete.
 * Prefer {@link deferUnfinalisedMigrationObjectCleanup}.
 */
export async function safeDeleteUnreferencedMigrationObject(
  _deps: { db?: unknown; storage?: { delete?: (pathname: string) => Promise<void> } },
  identity: PreparedUploadCleanupIdentity,
  candidatePathname: string,
  hooks: DeferredCleanupTestHooks = {},
): Promise<CleanupOutcome> {
  // Explicitly never invoke storage.delete — count-then-delete is not race-safe.
  return deferUnfinalisedMigrationObjectCleanup(identity, candidatePathname, hooks);
}

/**
 * Verify a short-lived prepare token authorises finalise of pathname.
 * Does not accept a raw pathname as authority (including for any cleanup).
 */
export async function assertPreparedUploadTokenMatchesPathname(
  storage: { verifyClientUploadToken(input: { clientToken: string; pathname: string }): Promise<boolean> },
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
