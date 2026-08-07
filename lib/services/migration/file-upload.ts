/**
 * Slice 2A — private staged upload, finalisation, replacement.
 */

import { prisma } from '@/lib/prisma';
import { MigrationServiceError } from '@/lib/services/migration/errors';
import {
  assertMigrationEntityType,
  assertUploadContentPolicy,
  buildMigrationStoragePathname,
  newMigrationUploadId,
  sha256HexOfBuffer,
} from '@/lib/services/migration/file-policy';
import {
  applyMaterialMutationDemotion,
  assertExpectedVersion,
  assertMigrationActor,
  assertPreApprovalMutable,
  lockPackageForBusiness,
  writeMigrationAudit,
  type ActorContext,
  type DbClient,
} from '@/lib/services/migration/preapproval';
import {
  getMigrationObjectStorage,
  type MigrationObjectStorage,
} from '@/lib/services/migration/storage';
import type { MigrationEntityType } from '@/lib/migration/types';

export type UploadMigrationFileInput = {
  packageId: string;
  entityType: string;
  bytes: Buffer;
  originalFilename?: string | null;
  contentType?: string | null;
  /** When true, replace existing FINALISED file with different checksum. */
  replace?: boolean;
  expectedVersion?: number | null;
  /** Ignored if supplied. */
  businessId?: string;
  storageKey?: string;
  uploadChecksum?: string;
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

  const entityType = assertMigrationEntityType(input.entityType);
  const policy = assertUploadContentPolicy({
    originalFilename: input.originalFilename,
    contentType: input.contentType,
    bytes: input.bytes,
  });
  const checksum = sha256HexOfBuffer(input.bytes);

  // Pre-check mutable ownership without holding a long lock across Blob I/O.
  const preview = await db.migrationPackage.findFirst({
    where: { id: input.packageId, businessId: actor.businessId },
    select: { id: true, status: true, version: true },
  });
  if (!preview) {
    throw new MigrationServiceError('NOT_FOUND', 'Migration package not found.', 404);
  }
  assertPreApprovalMutable(preview.status);
  assertExpectedVersion(
    { ...preview, businessId: actor.businessId, latestValidationRunId: null },
    input.expectedVersion,
  );

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

  let uploadedUrl: string | null = null;
  try {
    const putMeta = await storage.put({
      pathname,
      body: input.bytes,
      contentType: policy.contentType,
    });
    uploadedUrl = putMeta.url;

    const headMeta = await storage.head(putMeta.url);
    if (headMeta.size !== input.bytes.length) {
      throw new MigrationServiceError(
        'STORAGE_FAILURE',
        'Stored object size does not match uploaded bytes.',
        502,
      );
    }

    const previousStorageKey = existing?.storageKey ?? null;

    const result = await db.$transaction(async (tx) => {
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
          entityType,
        },
      });

      if (
        current &&
        current.uploadChecksum === checksum &&
        current.storageStatus === 'FINALISED'
      ) {
        // Lost the race to an identical finalisation — treat as replay.
        return {
          fileId: current.id,
          packageId: current.packageId,
          entityType,
          storageStatus: current.storageStatus,
          uploadChecksum: current.uploadChecksum,
          byteLength: current.byteLength,
          originalFilename: current.originalFilename,
          storageKey: current.storageKey!,
          packageVersion: pkg.version,
          packageStatus: pkg.status,
          replayed: true,
          replaced: false,
          orphanNewObject: true as const,
        };
      }

      if (current && current.uploadChecksum !== checksum && !input.replace) {
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
            originalFilename: policy.originalFilename,
            contentType: policy.contentType,
            byteLength: input.bytes.length,
            uploadChecksum: checksum,
            storageKey: pathname,
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
            entityType,
            storageStatus: 'FINALISED',
            originalFilename: policy.originalFilename,
            contentType: policy.contentType,
            byteLength: input.bytes.length,
            uploadChecksum: checksum,
            storageKey: pathname,
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
          entityType,
          uploadChecksum: checksum,
          byteLength: input.bytes.length,
          storageKey: pathname,
          replaced: Boolean(current),
          previousStorageKey: previousStorageKey,
          packageVersion: demotion.nextVersion,
          packageStatus: demotion.nextStatus,
        },
      });

      return {
        fileId: file.id,
        packageId: file.packageId,
        entityType,
        storageStatus: file.storageStatus,
        uploadChecksum: file.uploadChecksum,
        byteLength: file.byteLength,
        originalFilename: file.originalFilename,
        storageKey: file.storageKey!,
        packageVersion: demotion.nextVersion,
        packageStatus: demotion.nextStatus,
        replayed: false,
        replaced: Boolean(current),
        orphanNewObject: false as const,
      };
    });

    if (result.orphanNewObject && uploadedUrl) {
      try {
        await storage.delete(uploadedUrl);
      } catch {
        // Best-effort only.
      }
    }

    const { orphanNewObject: _o, ...publicResult } = result;
    return publicResult;
  } catch (error) {
    if (uploadedUrl) {
      try {
        await storage.delete(uploadedUrl);
      } catch {
        // Best-effort orphan cleanup after finalisation failure.
      }
    }
    if (error instanceof MigrationServiceError) throw error;
    throw error;
  }
}
