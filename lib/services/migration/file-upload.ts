/**
 * Slice 2A — private staged upload prepare / finalise / in-process upload.
 *
 * Application transport (Preview/Production):
 *   1. prepareMigrationClientUpload → short-lived client token (migration RW token never leaves server)
 *   2. browser/SDK put() direct to private Blob (bypasses Vercel 4.5 MiB function body limit)
 *   3. finaliseMigrationUploadedObject → head + bounded hash + DB finalise
 *
 * In-process uploadMigrationFile remains for tests/fakes with injected storage.
 */

import { prisma } from '@/lib/prisma';
import { MIGRATION_MAX_UPLOAD_BYTES } from '@/lib/migration/limits';
import { MigrationServiceError } from '@/lib/services/migration/errors';
import {
  assertMigrationEntityType,
  assertServerOwnedMigrationPathname,
  assertUploadContentPolicy,
  buildMigrationStoragePathname,
  MIGRATION_ALLOWED_UPLOAD_CONTENT_TYPES,
  newMigrationUploadId,
  sha256HexOfBuffer,
  sha256HexOfStreamBounded,
} from '@/lib/services/migration/file-policy';
import {
  applyMaterialMutationDemotion,
  assertExpectedVersion,
  assertMigrationActor,
  assertPreApprovalMutable,
  lockPackageForBusiness,
  requireExpectedVersion,
  writeMigrationAudit,
  type ActorContext,
  type DbClient,
} from '@/lib/services/migration/preapproval';
import {
  getMigrationObjectStorage,
  type MigrationObjectStorage,
} from '@/lib/services/migration/storage';
import type { MigrationEntityType } from '@/lib/migration/types';
import {
  assertPreparedUploadTokenMatchesPathname,
  deferUnfinalisedMigrationObjectCleanup,
  type PreparedUploadCleanupIdentity,
} from '@/lib/services/migration/cleanup';

const CLIENT_TOKEN_TTL_MS = 15 * 60 * 1000;

export type PrepareMigrationClientUploadInput = {
  packageId: string;
  entityType: string;
  expectedVersion: number;
  replace?: boolean;
  originalFilename?: string | null;
  contentType?: string | null;
};

export type PrepareMigrationClientUploadResult = {
  pathname: string;
  clientToken: string;
  access: 'private';
  maximumSizeInBytes: number;
  allowedContentTypes: readonly string[];
  packageVersion: number;
  packageStatus: string;
  validUntilMs: number;
};

export type FinaliseMigrationUploadedObjectInput = {
  packageId: string;
  entityType: string;
  pathname: string;
  /** Short-lived token from prepare — binds cleanup/finalise to prepared identity. */
  clientToken: string;
  expectedVersion: number;
  replace?: boolean;
  originalFilename?: string | null;
  contentType?: string | null;
};

export type UploadMigrationFileResult = {
  fileId: string;
  packageId: string;
  entityType: MigrationEntityType;
  storageStatus: string;
  uploadChecksum: string;
  byteLength: number;
  originalFilename: string | null;
  storageKey: string;
  packageVersion: number;
  packageStatus: string;
  replayed: boolean;
  replaced: boolean;
};

export type UploadMigrationFileInput = {
  packageId: string;
  entityType: string;
  bytes: Buffer;
  originalFilename?: string | null;
  contentType?: string | null;
  replace?: boolean;
  expectedVersion: number;
};

async function loadMutablePackagePreview(
  db: DbClient,
  actor: ActorContext,
  packageId: string,
  expectedVersion: number,
) {
  const preview = await db.migrationPackage.findFirst({
    where: { id: packageId, businessId: actor.businessId },
    select: { id: true, status: true, version: true, latestValidationRunId: true },
  });
  if (!preview) {
    throw new MigrationServiceError('NOT_FOUND', undefined, 404);
  }
  assertPreApprovalMutable(preview.status);
  assertExpectedVersion(
    {
      id: preview.id,
      businessId: actor.businessId,
      status: preview.status,
      version: preview.version,
      latestValidationRunId: preview.latestValidationRunId,
    },
    expectedVersion,
  );
  return preview;
}

export async function prepareMigrationClientUpload(
  actorInput: {
    userId: string;
    userName?: string | null;
    userRole: string;
    businessId: string;
  },
  input: PrepareMigrationClientUploadInput,
  deps: {
    db?: DbClient;
    storage?: MigrationObjectStorage;
  } = {},
): Promise<PrepareMigrationClientUploadResult> {
  const db = deps.db ?? prisma;
  const storage = deps.storage ?? getMigrationObjectStorage();
  const actor: ActorContext = {
    ...assertMigrationActor(actorInput),
    userName: actorInput.userName?.trim() || actorInput.userId,
  };
  const expectedVersion = requireExpectedVersion(input.expectedVersion);
  const entityType = assertMigrationEntityType(input.entityType);
  const preview = await loadMutablePackagePreview(db, actor, input.packageId, expectedVersion);

  const existing = await db.migrationFile.findFirst({
    where: {
      businessId: actor.businessId,
      packageId: input.packageId,
      entityType,
    },
  });
  if (existing && existing.storageStatus === 'FINALISED' && !input.replace) {
    // Conflict if client intends a new upload without replace; exact replay is handled at finalise.
    // Still allow prepare so client can re-upload identical bytes for replay finalise.
  }

  const uploadId = newMigrationUploadId();
  const pathname = buildMigrationStoragePathname({
    businessId: actor.businessId,
    packageId: input.packageId,
    uploadId,
    entityType,
  });
  const validUntilMs = Date.now() + CLIENT_TOKEN_TTL_MS;
  const clientToken = await storage.createClientUploadToken({
    pathname,
    maximumSizeInBytes: MIGRATION_MAX_UPLOAD_BYTES,
    allowedContentTypes: [...MIGRATION_ALLOWED_UPLOAD_CONTENT_TYPES],
    validUntilMs,
  });

  // Never return the migration RW token — only the short-lived client token.
  if (clientToken === process.env.MIGRATION_BLOB_READ_WRITE_TOKEN) {
    throw new MigrationServiceError('STORAGE_FAILURE', undefined, 502);
  }

  return {
    pathname,
    clientToken,
    access: 'private',
    maximumSizeInBytes: MIGRATION_MAX_UPLOAD_BYTES,
    allowedContentTypes: MIGRATION_ALLOWED_UPLOAD_CONTENT_TYPES,
    packageVersion: preview.version,
    packageStatus: preview.status,
    validUntilMs,
  };
}

type FinaliseCoreResult = UploadMigrationFileResult & { orphanNewObject: boolean };

async function finaliseKnownObject(
  actor: ActorContext,
  input: {
    packageId: string;
    entityType: MigrationEntityType;
    pathname: string;
    expectedVersion: number;
    replace?: boolean;
    policy: { contentType: string; originalFilename: string | null };
    checksum: string;
    byteLength: number;
    previousStorageKey: string | null;
  },
  db: DbClient,
): Promise<FinaliseCoreResult> {
  return db.$transaction(async (tx) => {
    const pkg = await lockPackageForBusiness(tx, {
      businessId: actor.businessId,
      packageId: input.packageId,
    });
    assertPreApprovalMutable(pkg.status);
    assertExpectedVersion(pkg, input.expectedVersion);

    const current = await tx.migrationFile.findFirst({
      where: {
        businessId: actor.businessId,
        packageId: input.packageId,
        entityType: input.entityType,
      },
    });

    if (
      current &&
      current.uploadChecksum === input.checksum &&
      current.storageStatus === 'FINALISED'
    ) {
      return {
        fileId: current.id,
        packageId: current.packageId,
        entityType: input.entityType,
        storageStatus: current.storageStatus,
        uploadChecksum: current.uploadChecksum,
        byteLength: current.byteLength,
        originalFilename: current.originalFilename,
        storageKey: current.storageKey!,
        packageVersion: pkg.version,
        packageStatus: pkg.status,
        replayed: true,
        replaced: false,
        orphanNewObject: true,
      };
    }

    if (current && current.uploadChecksum !== input.checksum && !input.replace) {
      throw new MigrationServiceError(
        'CONFLICT',
        'A different file already exists for this entity type. Pass replace=true to replace it.',
        409,
      );
    }

    const demotion = await applyMaterialMutationDemotion(tx, pkg);

    let file;
    if (current) {
      file = await tx.migrationFile.update({
        where: { id: current.id },
        data: {
          storageStatus: 'FINALISED',
          originalFilename: input.policy.originalFilename,
          contentType: input.policy.contentType,
          byteLength: input.byteLength,
          uploadChecksum: input.checksum,
          storageKey: input.pathname,
          validationChecksum: null,
          validatedAt: null,
          approvedChecksum: null,
          approvedAt: null,
          rowCount: null,
        },
      });
    } else {
      file = await tx.migrationFile.create({
        data: {
          businessId: actor.businessId,
          packageId: input.packageId,
          entityType: input.entityType,
          storageStatus: 'FINALISED',
          originalFilename: input.policy.originalFilename,
          contentType: input.policy.contentType,
          byteLength: input.byteLength,
          uploadChecksum: input.checksum,
          storageKey: input.pathname,
        },
      });
    }

    await writeMigrationAudit(tx, {
      businessId: actor.businessId,
      userId: actor.userId,
      userName: actor.userName,
      userRole: actor.userRole,
      action: current ? 'MIGRATION_FILE_REPLACE' : 'MIGRATION_FILE_UPLOAD',
      entityId: input.packageId,
      details: {
        fileId: file.id,
        entityType: input.entityType,
        uploadChecksum: input.checksum,
        byteLength: input.byteLength,
        storageKey: input.pathname,
        replaced: Boolean(current),
        previousStorageKey: input.previousStorageKey,
        packageVersion: demotion.nextVersion,
        packageStatus: demotion.nextStatus,
      },
    });

    return {
      fileId: file.id,
      packageId: file.packageId,
      entityType: input.entityType,
      storageStatus: file.storageStatus,
      uploadChecksum: file.uploadChecksum,
      byteLength: file.byteLength,
      originalFilename: file.originalFilename,
      storageKey: file.storageKey!,
      packageVersion: demotion.nextVersion,
      packageStatus: demotion.nextStatus,
      replayed: false,
      replaced: Boolean(current),
      orphanNewObject: false,
    };
  });
}

export async function finaliseMigrationUploadedObject(
  actorInput: {
    userId: string;
    userName?: string | null;
    userRole: string;
    businessId: string;
  },
  input: FinaliseMigrationUploadedObjectInput,
  deps: {
    db?: DbClient;
    storage?: MigrationObjectStorage;
  } = {},
): Promise<UploadMigrationFileResult> {
  const db = deps.db ?? prisma;
  const storage = deps.storage ?? getMigrationObjectStorage();
  const actor: ActorContext = {
    ...assertMigrationActor(actorInput),
    userName: actorInput.userName?.trim() || actorInput.userId,
  };
  const expectedVersion = requireExpectedVersion(input.expectedVersion);
  const entityType = assertMigrationEntityType(input.entityType);
  assertServerOwnedMigrationPathname({
    pathname: input.pathname,
    businessId: actor.businessId,
    packageId: input.packageId,
    entityType,
  });
  // Prepared-upload identity: clientToken must authorise this exact pathname.
  await assertPreparedUploadTokenMatchesPathname(storage, {
    clientToken: input.clientToken,
    pathname: input.pathname,
  });

  const cleanupIdentity: PreparedUploadCleanupIdentity = {
    businessId: actor.businessId,
    packageId: input.packageId,
    entityType,
    preparedPathname: input.pathname,
  };

  // Failure/orphan retention only — synchronous Blob delete disabled (TOCTOU).
  // Prepared pathname is logged for operational orphan tracking; never deleted here.
  let mayAttemptOrphanCleanup = true;

  try {
    await loadMutablePackagePreview(db, actor, input.packageId, expectedVersion);

    const existing = await db.migrationFile.findFirst({
      where: {
        businessId: actor.businessId,
        packageId: input.packageId,
        entityType,
      },
    });

    const headMeta = await storage.head(input.pathname);
    if (headMeta.size > MIGRATION_MAX_UPLOAD_BYTES) {
      throw new MigrationServiceError('FILE_POLICY', undefined);
    }
    const { stream } = await storage.getStream(input.pathname);
    const hashed = await sha256HexOfStreamBounded(stream);
    if (hashed.byteLength !== headMeta.size) {
      throw new MigrationServiceError('STORAGE_FAILURE', undefined, 502);
    }

    const policy = assertUploadContentPolicy({
      originalFilename: input.originalFilename,
      contentType: input.contentType ?? headMeta.contentType,
      bytes: hashed.bytes,
    });

    if (
      existing &&
      existing.uploadChecksum === hashed.hex &&
      existing.storageStatus === 'FINALISED'
    ) {
      // Exact replay — no version bump. Unused NEW object retained (Option B).
      if (existing.storageKey !== input.pathname) {
        await deferUnfinalisedMigrationObjectCleanup(cleanupIdentity, input.pathname);
      }
      mayAttemptOrphanCleanup = false;
      return {
        fileId: existing.id,
        packageId: existing.packageId,
        entityType,
        storageStatus: existing.storageStatus,
        uploadChecksum: existing.uploadChecksum,
        byteLength: existing.byteLength,
        originalFilename: existing.originalFilename,
        storageKey: existing.storageKey!,
        packageVersion: expectedVersion,
        packageStatus: (await db.migrationPackage.findFirst({
          where: { id: input.packageId, businessId: actor.businessId },
          select: { status: true },
        }))!.status,
        replayed: true,
        replaced: false,
      };
    }

    const result = await finaliseKnownObject(
      actor,
      {
        packageId: input.packageId,
        entityType,
        pathname: input.pathname,
        expectedVersion,
        replace: input.replace,
        policy,
        checksum: hashed.hex,
        byteLength: hashed.byteLength,
        previousStorageKey: existing?.storageKey ?? null,
      },
      db,
    );

    if (result.orphanNewObject) {
      await deferUnfinalisedMigrationObjectCleanup(cleanupIdentity, input.pathname);
    }
    mayAttemptOrphanCleanup = false;
    const { orphanNewObject: _o, ...publicResult } = result;
    return publicResult;
  } catch (error) {
    if (mayAttemptOrphanCleanup) {
      await deferUnfinalisedMigrationObjectCleanup(cleanupIdentity, input.pathname);
    }
    if (error instanceof MigrationServiceError) throw error;
    throw error;
  }
}

/**
 * In-process upload for tests and synthetic runners with injected storage.
 * Still enforces mandatory expectedVersion and 25 MiB policy.
 */
export async function uploadMigrationFile(
  actorInput: {
    userId: string;
    userName?: string | null;
    userRole: string;
    businessId: string;
  },
  input: UploadMigrationFileInput,
  deps: {
    db?: DbClient;
    storage?: MigrationObjectStorage;
  } = {},
): Promise<UploadMigrationFileResult> {
  const db = deps.db ?? prisma;
  const storage = deps.storage ?? getMigrationObjectStorage();
  const actor: ActorContext = {
    ...assertMigrationActor(actorInput),
    userName: actorInput.userName?.trim() || actorInput.userId,
  };
  const expectedVersion = requireExpectedVersion(input.expectedVersion);
  const entityType = assertMigrationEntityType(input.entityType);
  const policy = assertUploadContentPolicy({
    originalFilename: input.originalFilename,
    contentType: input.contentType,
    bytes: input.bytes,
  });
  const checksum = sha256HexOfBuffer(input.bytes);

  const preview = await loadMutablePackagePreview(db, actor, input.packageId, expectedVersion);
  const existing = await db.migrationFile.findFirst({
    where: {
      businessId: actor.businessId,
      packageId: input.packageId,
      entityType,
    },
  });

  if (existing && existing.uploadChecksum === checksum && existing.storageStatus === 'FINALISED') {
    return {
      fileId: existing.id,
      packageId: existing.packageId,
      entityType,
      storageStatus: existing.storageStatus,
      uploadChecksum: existing.uploadChecksum,
      byteLength: existing.byteLength,
      originalFilename: existing.originalFilename,
      storageKey: existing.storageKey!,
      packageVersion: preview.version,
      packageStatus: preview.status,
      replayed: true,
      replaced: false,
    };
  }

  if (existing && existing.uploadChecksum !== checksum && !input.replace) {
    throw new MigrationServiceError(
      'CONFLICT',
      'A different file already exists for this entity type. Pass replace=true to replace it.',
      409,
    );
  }

  const uploadId = newMigrationUploadId();
  const pathname = buildMigrationStoragePathname({
    businessId: actor.businessId,
    packageId: input.packageId,
    uploadId,
    entityType,
  });

  const cleanupIdentity: PreparedUploadCleanupIdentity = {
    businessId: actor.businessId,
    packageId: input.packageId,
    entityType,
    preparedPathname: pathname,
  };

  let uploadedPathname: string | null = null;
  try {
    const putMeta = await storage.put({
      pathname,
      body: input.bytes,
      contentType: policy.contentType,
    });
    uploadedPathname = pathname;
    const headMeta = await storage.head(putMeta.url);
    if (headMeta.size !== input.bytes.length) {
      throw new MigrationServiceError('STORAGE_FAILURE', undefined, 502);
    }

    const result = await finaliseKnownObject(
      actor,
      {
        packageId: input.packageId,
        entityType,
        pathname,
        expectedVersion,
        replace: input.replace,
        policy,
        checksum,
        byteLength: input.bytes.length,
        previousStorageKey: existing?.storageKey ?? null,
      },
      db,
    );

    if (result.orphanNewObject && uploadedPathname) {
      await deferUnfinalisedMigrationObjectCleanup(cleanupIdentity, uploadedPathname);
    }
    const { orphanNewObject: _o, ...publicResult } = result;
    return publicResult;
  } catch (error) {
    if (uploadedPathname) {
      await deferUnfinalisedMigrationObjectCleanup(cleanupIdentity, uploadedPathname);
    }
    if (error instanceof MigrationServiceError) throw error;
    throw error;
  }
}
