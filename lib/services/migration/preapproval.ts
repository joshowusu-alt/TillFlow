/**
 * Shared pre-approval package lock + material-mutation demotion helpers.
 */

import type { Prisma, PrismaClient } from '@prisma/client';
import { isPreApprovalMutableStatus } from '@/lib/migration/lifecycle';
import type { MigrationPackageStatus } from '@/lib/migration/types';
import {
  MigrationServiceError,
  safeMigrationLogFields,
} from '@/lib/services/migration/errors';

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
    throw new MigrationServiceError('NOT_FOUND', undefined, 404);
  }
  return pkg;
}

export function assertPreApprovalMutable(status: string): void {
  if (!isPreApprovalMutableStatus(status as MigrationPackageStatus)) {
    throw new MigrationServiceError('LIFECYCLE', undefined, 409);
  }
}

/**
 * Material mutations require an explicit integer package version for CAS.
 * Omission or malformed values fail closed — adapters must not auto-fetch.
 */
export function requireExpectedVersion(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 1) {
    throw new MigrationServiceError(
      'STALE_VERSION',
      'expectedVersion is required and must be a positive integer.',
      409,
    );
  }
  return raw;
}

export function assertExpectedVersion(
  pkg: LockedMigrationPackage,
  expectedVersion: number,
): void {
  if (pkg.version !== expectedVersion) {
    throw new MigrationServiceError('STALE_VERSION', undefined, 409);
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
    console.error(
      '[migration.audit] write failed',
      safeMigrationLogFields({
        code: 'AUDIT_FAILURE',
        businessId: input.businessId,
        packageId: input.entityId,
      }),
    );
    // Never propagate raw DB/provider messages to callers.
    throw new MigrationServiceError('AUDIT_FAILURE', undefined, 500);
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
    throw new MigrationServiceError('UNAUTHENTICATED', undefined, 401);
  }
  if (actor.userRole !== 'OWNER' && actor.userRole !== 'MANAGER') {
    throw new MigrationServiceError('ROLE_DENIED', undefined, 403);
  }
  return {
    userId: actor.userId,
    userName: '',
    userRole: actor.userRole,
    businessId: actor.businessId,
  };
}

export type DbClient = PrismaClient;
