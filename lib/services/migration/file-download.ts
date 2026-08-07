/**
 * Slice 2A — authorised private download of a finalised migration file.
 */

import { prisma } from '@/lib/prisma';
import { sanitizeOriginalFilename } from '@/lib/migration/limits';
import { MigrationServiceError } from '@/lib/services/migration/errors';
import {
  assertMigrationActor,
  type ActorContext,
  type DbClient,
} from '@/lib/services/migration/preapproval';
import {
  getMigrationObjectStorage,
  type MigrationObjectStorage,
} from '@/lib/services/migration/storage';

export type DownloadMigrationFileResult = {
  stream: ReadableStream;
  contentType: string;
  byteLength: number;
  downloadFilename: string;
  uploadChecksum: string;
  entityType: string;
  packageId: string;
};

export async function openMigrationFileDownload(
  actorInput: {
    userId: string;
    userName?: string | null;
    userRole: string;
    businessId: string;
  },
  input: { fileId: string },
  deps: {
    db?: DbClient;
    storage?: MigrationObjectStorage;
  } = {},
): Promise<DownloadMigrationFileResult> {
  const db = deps.db ?? prisma;
  const storage = deps.storage ?? getMigrationObjectStorage();
  const actor: ActorContext = {
    ...assertMigrationActor(actorInput),
    userName: actorInput.userName?.trim() || actorInput.userId,
  };

  const file = await db.migrationFile.findFirst({
    where: { id: input.fileId, businessId: actor.businessId },
  });
  if (!file || file.storageStatus !== 'FINALISED' || !file.storageKey) {
    throw new MigrationServiceError('NOT_FOUND', 'Migration file not found.', 404);
  }

  const pkg = await db.migrationPackage.findFirst({
    where: { id: file.packageId, businessId: actor.businessId },
    select: { id: true },
  });
  if (!pkg) {
    throw new MigrationServiceError('NOT_FOUND', 'Migration file not found.', 404);
  }

  const { stream, meta } = await storage.getStream(file.storageKey);
  const safeName =
    sanitizeOriginalFilename(file.originalFilename) ||
    `${file.entityType.toLowerCase()}.csv`;

  return {
    stream,
    contentType: file.contentType || meta.contentType || 'text/csv',
    byteLength: file.byteLength || meta.size,
    downloadFilename: safeName,
    uploadChecksum: file.uploadChecksum,
    entityType: file.entityType,
    packageId: file.packageId,
  };
}
