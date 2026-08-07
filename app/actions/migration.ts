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
  uploadMigrationFile,
  type UploadMigrationFileResult,
} from '@/lib/services/migration/file-upload';
import {
  upsertMigrationBranchMapping,
  deleteMigrationBranchMapping,
  type BranchMappingResult,
} from '@/lib/services/migration/branch-mapping';
import {
  isMigrationServiceError,
  type MigrationServiceError,
} from '@/lib/services/migration/errors';

function mapError(error: unknown): never {
  if (isMigrationServiceError(error)) {
    throw new UserError(error.message);
  }
  throw error;
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

export async function uploadMigrationFileAction(input: {
  packageId: string;
  entityType: string;
  /** Base64-encoded file bytes (server actions cannot accept raw Buffer from the client form cleanly). */
  bytesBase64: string;
  originalFilename?: string | null;
  contentType?: string | null;
  replace?: boolean;
  expectedVersion?: number | null;
}): Promise<ActionResult<UploadMigrationFileResult>> {
  return safeAction(async () => {
    const ctx = await withBusinessContext(['MANAGER', 'OWNER']);
    try {
      const bytes = Buffer.from(input.bytesBase64, 'base64');
      const result = await uploadMigrationFile(actorFromContext(ctx), {
        packageId: input.packageId,
        entityType: input.entityType,
        bytes,
        originalFilename: input.originalFilename,
        contentType: input.contentType,
        replace: input.replace,
        expectedVersion: input.expectedVersion,
      });
      return ok(result);
    } catch (error) {
      mapError(error);
    }
  });
}

export async function upsertMigrationBranchMappingAction(input: {
  packageId: string;
  sourceBranchKey: string;
  targetStoreId: string;
  mappingId?: string | null;
  expectedVersion?: number | null;
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
  expectedVersion?: number | null;
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

/** Exported for route handlers that already hold a session context. */
export function migrationServiceErrorToHttp(error: MigrationServiceError): {
  status: number;
  body: { error: string; code: string };
} {
  return {
    status: error.httpStatus,
    body: { error: error.message, code: error.code },
  };
}
