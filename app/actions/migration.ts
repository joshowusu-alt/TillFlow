'use server';

import {
  withBusinessContext,
  safeAction,
  ok,
  UserError,
  type ActionResult,
} from '@/lib/action-utils';
import {
  createMigrationPackage,
  type CreateMigrationPackageInput,
  type CreateMigrationPackageResult,
} from '@/lib/services/migration/package-create';
import {
  prepareMigrationClientUpload,
  finaliseMigrationUploadedObject,
  type PrepareMigrationClientUploadResult,
  type UploadMigrationFileResult,
} from '@/lib/services/migration/file-upload';
import {
  upsertMigrationBranchMapping,
  deleteMigrationBranchMapping,
  type BranchMappingResult,
} from '@/lib/services/migration/branch-mapping';
import {
  isMigrationServiceError,
  toPublicMigrationError,
  MIGRATION_PUBLIC_ERROR_MESSAGES,
  type MigrationServiceError,
} from '@/lib/services/migration/errors';
import { assertRejectedBase64Transport } from '@/lib/services/migration/file-policy';

function mapError(error: unknown): never {
  const pub = toPublicMigrationError(error);
  throw new UserError(pub.body.error);
}

function actorFromContext(ctx: {
  user: { id: string; name: string | null; role: string };
  businessId: string;
}) {
  return {
    userId: ctx.user.id,
    userName: ctx.user.name,
    userRole: ctx.user.role,
    businessId: ctx.businessId,
  };
}

export async function createMigrationPackageAction(
  input: CreateMigrationPackageInput,
): Promise<ActionResult<CreateMigrationPackageResult>> {
  return safeAction(async () => {
    const ctx = await withBusinessContext(['MANAGER', 'OWNER']);
    try {
      const result = await createMigrationPackage(actorFromContext(ctx), input);
      return ok(result);
    } catch (error) {
      mapError(error);
    }
  });
}

/**
 * Issue a short-lived private client-upload token. The migration RW token never
 * leaves the server. File bytes must not be sent through this action (Vercel
 * Functions reject bodies above 4.5 MiB).
 */
export async function prepareMigrationUploadAction(input: {
  packageId: string;
  entityType: string;
  expectedVersion: number;
  replace?: boolean;
  originalFilename?: string | null;
  contentType?: string | null;
}): Promise<ActionResult<PrepareMigrationClientUploadResult>> {
  return safeAction(async () => {
    const ctx = await withBusinessContext(['MANAGER', 'OWNER']);
    try {
      const result = await prepareMigrationClientUpload(actorFromContext(ctx), input);
      return ok(result);
    } catch (error) {
      mapError(error);
    }
  });
}

export async function finaliseMigrationUploadAction(input: {
  packageId: string;
  entityType: string;
  pathname: string;
  expectedVersion: number;
  replace?: boolean;
  originalFilename?: string | null;
  contentType?: string | null;
}): Promise<ActionResult<UploadMigrationFileResult>> {
  return safeAction(async () => {
    const ctx = await withBusinessContext(['MANAGER', 'OWNER']);
    try {
      const result = await finaliseMigrationUploadedObject(actorFromContext(ctx), input);
      return ok(result);
    } catch (error) {
      mapError(error);
    }
  });
}

/**
 * Explicit rejection of the retired Base64 transport — never allocates file bytes.
 */
export async function uploadMigrationFileAction(input: {
  bytesBase64?: unknown;
}): Promise<ActionResult<void>> {
  return safeAction(async () => {
    await withBusinessContext(['MANAGER', 'OWNER']);
    try {
      assertRejectedBase64Transport(input.bytesBase64);
    } catch (error) {
      mapError(error);
    }
    // Unreachable: assertRejectedBase64Transport always throws.
    throw new UserError(MIGRATION_PUBLIC_ERROR_MESSAGES.FILE_POLICY);
  });
}

export async function upsertMigrationBranchMappingAction(input: {
  packageId: string;
  sourceBranchKey: string;
  targetStoreId: string;
  mappingId?: string | null;
  expectedVersion: number;
}): Promise<ActionResult<BranchMappingResult>> {
  return safeAction(async () => {
    const ctx = await withBusinessContext(['MANAGER', 'OWNER']);
    try {
      const result = await upsertMigrationBranchMapping(actorFromContext(ctx), input);
      return ok(result);
    } catch (error) {
      mapError(error);
    }
  });
}

export async function deleteMigrationBranchMappingAction(input: {
  packageId: string;
  mappingId: string;
  expectedVersion: number;
}): Promise<ActionResult<{ packageVersion: number; packageStatus: string }>> {
  return safeAction(async () => {
    const ctx = await withBusinessContext(['MANAGER', 'OWNER']);
    try {
      const result = await deleteMigrationBranchMapping(actorFromContext(ctx), input);
      return ok(result);
    } catch (error) {
      mapError(error);
    }
  });
}

export function migrationServiceErrorToHttp(error: MigrationServiceError): {
  status: number;
  body: { error: string; code: string };
} {
  return toPublicMigrationError(error);
}

export function isMigrationDomainError(error: unknown): boolean {
  return isMigrationServiceError(error);
}
