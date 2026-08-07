/**
 * Shared pre-approval package lock + material-mutation demotion helpers.
 */

import type { Prisma, PrismaClient } from '@prisma/client';
import { isPreApprovalMutableStatus } from '@/lib/migration/lifecycle';
import type { MigrationPackageStatus } from '@/lib/migration/types';
import { MigrationServiceError } from '@/lib/services/migration/errors';

export type MigrationTx = Prisma.TransactionClient;

export type LockedMigrationPackage = {
  id: string;
  businessId: string;
  status: string;
  version: number;
  latestValidationRunId: string | null;
};

export async function lockPackageForBusiness(
  tx: MigrationTx,
  input: { businessId: string; packageId: string },
): Promise<LockedMigrationPackage> {
  const rows = await tx.$queryRaw<LockedMigrationPackage[]>`
    SELECT id, "businessId", status, version, "latestValidationRunId"
    FROM "MigrationPackage"
    WHERE id = ${input.packageId} AND "businessId" = ${input.businessId}
    FOR UPDATE
  `;
  const pkg = rows[0];
  if (!pkg) {
    throw new MigrationServiceError(
      'NOT_FOUND',
      'Migration package not found.',
      404,
    );
  }
  return pkg;
}

export function assertPreApprovalMutable(status: string): void {
  if (!isPreApprovalMutableStatus(status as MigrationPackageStatus)) {
    throw new MigrationServiceError(
      'LIFECYCLE',
      'Package is not mutable in its current lifecycle state.',
      409,
    );
  }
}

export function assertExpectedVersion(
  pkg: LockedMigrationPackage,
  expectedVersion: number | null | undefined,
): void {
  if (expectedVersion == null) return;
  if (pkg.version !== expectedVersion) {
    throw new MigrationServiceError(
      'STALE_VERSION',
      'Package was modified by another request. Retry with the current version.',
      409,
    );
  }
}

/**
 * Apply material-mutation demotion inside an open transaction.
 * Retains historical validation runs; clears active pointer only.
 */
export async function applyMaterialMutationDemotion(
  tx: MigrationTx,
  pkg: LockedMigrationPackage,
): Promise<{ nextStatus: MigrationPackageStatus; nextVersion: number }> {
  assertPreApprovalMutable(pkg.status);

  const needsDemotion =
    pkg.status === 'VALIDATED' ||
    pkg.status === 'VALIDATION_FAILED' ||
    pkg.latestValidationRunId != null;

  const nextStatus: MigrationPackageStatus = needsDemotion
    ? 'DRAFT'
    : (pkg.status as MigrationPackageStatus);
  const nextVersion = pkg.version + 1;

  if (needsDemotion && pkg.latestValidationRunId) {
    await tx.migrationValidationRun.updateMany({
      where: {
        id: pkg.latestValidationRunId,
        businessId: pkg.businessId,
        packageId: pkg.id,
        supersededAt: null,
      },
      data: { supersededAt: new Date() },
    });
  }

  if (needsDemotion) {
    await tx.migrationFile.updateMany({
      where: { businessId: pkg.businessId, packageId: pkg.id },
      data: { validationChecksum: null, validatedAt: null },
    });
  }

  await tx.migrationPackage.update({
    where: { id: pkg.id },
    data: {
      status: nextStatus,
      version: nextVersion,
      ...(needsDemotion
        ? {
            latestValidationRunId: null,
            validatedAt: null,
            validatedByUserId: null,
          }
        : {}),
    },
  });

  return { nextStatus, nextVersion };
}

export async function writeMigrationAudit(
  tx: MigrationTx,
  input: {
    businessId: string;
    userId: string;
    userName: string;
    userRole: string;
    action: string;
    entityId: string;
    details: Record<string, unknown>;
  },
): Promise<void> {
  try {
    await tx.auditLog.create({
      data: {
        businessId: input.businessId,
        userId: input.userId,
        userName: input.userName,
        userRole: input.userRole,
        action: input.action,
        actionType: input.action,
        entity: 'MigrationPackage',
        entityType: 'MigrationPackage',
        entityId: input.entityId,
        details: JSON.stringify(input.details),
      },
    });
  } catch (error) {
    throw new MigrationServiceError(
      'AUDIT_FAILURE',
      error instanceof Error ? error.message : 'Audit write failed',
      500,
    );
  }
}

export type ActorContext = {
  userId: string;
  userName: string;
  userRole: string;
  businessId: string;
};

export function assertMigrationActor(actor: {
  userId?: string | null;
  userRole?: string | null;
  businessId?: string | null;
}): ActorContext {
  if (!actor.userId || !actor.userRole || !actor.businessId) {
    throw new MigrationServiceError(
      'UNAUTHENTICATED',
      'Authentication required for migration access.',
      401,
    );
  }
  if (actor.userRole !== 'OWNER' && actor.userRole !== 'MANAGER') {
    throw new MigrationServiceError(
      'ROLE_DENIED',
      'Migration access denied for this role.',
      403,
    );
  }
  return {
    userId: actor.userId,
    userName: '', // filled by callers when known
    userRole: actor.userRole,
    businessId: actor.businessId,
  };
}

export type DbClient = PrismaClient;
