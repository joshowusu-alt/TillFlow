/**
 * Slice 2A — branch mapping create / update / delete.
 */

import { prisma } from '@/lib/prisma';
import { canonicaliseSourceBranchKey } from '@/lib/migration/source-branch-key';
import { MigrationContractError } from '@/lib/migration/errors';
import { MigrationServiceError } from '@/lib/services/migration/errors';
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

export type UpsertBranchMappingInput = {
  packageId: string;
  sourceBranchKey: string;
  targetStoreId: string;
  mappingId?: string | null;
  expectedVersion?: number | null;
};

export type DeleteBranchMappingInput = {
  packageId: string;
  mappingId: string;
  expectedVersion?: number | null;
};

export type BranchMappingResult = {
  mappingId: string;
  packageId: string;
  sourceBranchKey: string;
  targetStoreId: string;
  packageVersion: number;
  packageStatus: string;
};

function mapBranchKey(raw: string): string {
  try {
    return canonicaliseSourceBranchKey(raw);
  } catch (error) {
    if (error instanceof MigrationContractError) {
      throw new MigrationServiceError('CONTRACT', error.message);
    }
    throw error;
  }
}

export async function upsertMigrationBranchMapping(
  actorInput: {
    userId: string;
    userName?: string | null;
    userRole: string;
    businessId: string;
  },
  input: UpsertBranchMappingInput,
  db: DbClient = prisma,
): Promise<BranchMappingResult> {
  const actor: ActorContext = {
    ...assertMigrationActor(actorInput),
    userName: actorInput.userName?.trim() || actorInput.userId,
  };
  const sourceBranchKey = mapBranchKey(input.sourceBranchKey);
  const targetStoreId = String(input.targetStoreId ?? '').trim();
  if (!targetStoreId) {
    throw new MigrationServiceError('CONTRACT', 'targetStoreId is required.');
  }

  try {
    return await db.$transaction(async (tx) => {
      const pkg = await lockPackageForBusiness(tx, {
        businessId: actor.businessId,
        packageId: input.packageId,
      });
      assertPreApprovalMutable(pkg.status);
      assertExpectedVersion(pkg, input.expectedVersion);

      const store = await tx.store.findFirst({
        where: { id: targetStoreId, businessId: actor.businessId },
        select: { id: true },
      });
      if (!store) {
        // Do not reveal whether the store exists in another business.
        throw new MigrationServiceError('NOT_FOUND', 'Store not found.', 404);
      }

      const demotion = await applyMaterialMutationDemotion(tx, pkg);

      let mapping;
      if (input.mappingId) {
        const existing = await tx.migrationBranchMapping.findFirst({
          where: {
            id: input.mappingId,
            businessId: actor.businessId,
            packageId: input.packageId,
          },
        });
        if (!existing) {
          throw new MigrationServiceError('NOT_FOUND', 'Branch mapping not found.', 404);
        }
        mapping = await tx.migrationBranchMapping.update({
          where: { id: existing.id },
          data: { sourceBranchKey, targetStoreId },
        });
      } else {
        mapping = await tx.migrationBranchMapping.create({
          data: {
            businessId: actor.businessId,
            packageId: input.packageId,
            sourceBranchKey,
            targetStoreId,
          },
        });
      }

      await writeMigrationAudit(tx, {
        businessId: actor.businessId,
        userId: actor.userId,
        userName: actor.userName,
        userRole: actor.userRole,
        action: input.mappingId
          ? 'MIGRATION_BRANCH_MAPPING_UPDATE'
          : 'MIGRATION_BRANCH_MAPPING_CREATE',
        entityId: input.packageId,
        details: {
          mappingId: mapping.id,
          sourceBranchKey,
          targetStoreId,
          packageVersion: demotion.nextVersion,
          packageStatus: demotion.nextStatus,
        },
      });

      return {
        mappingId: mapping.id,
        packageId: mapping.packageId,
        sourceBranchKey: mapping.sourceBranchKey,
        targetStoreId: mapping.targetStoreId,
        packageVersion: demotion.nextVersion,
        packageStatus: demotion.nextStatus,
      };
    });
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: string }).code === 'P2002'
    ) {
      throw new MigrationServiceError(
        'CONFLICT',
        'Branch mapping conflicts with an existing source branch or store on this package.',
        409,
      );
    }
    throw error;
  }
}

export async function deleteMigrationBranchMapping(
  actorInput: {
    userId: string;
    userName?: string | null;
    userRole: string;
    businessId: string;
  },
  input: DeleteBranchMappingInput,
  db: DbClient = prisma,
): Promise<{ packageVersion: number; packageStatus: string }> {
  const actor: ActorContext = {
    ...assertMigrationActor(actorInput),
    userName: actorInput.userName?.trim() || actorInput.userId,
  };

  return db.$transaction(async (tx) => {
    const pkg = await lockPackageForBusiness(tx, {
      businessId: actor.businessId,
      packageId: input.packageId,
    });
    assertPreApprovalMutable(pkg.status);
    assertExpectedVersion(pkg, input.expectedVersion);

    const existing = await tx.migrationBranchMapping.findFirst({
      where: {
        id: input.mappingId,
        businessId: actor.businessId,
        packageId: input.packageId,
      },
    });
    if (!existing) {
      throw new MigrationServiceError('NOT_FOUND', 'Branch mapping not found.', 404);
    }

    const demotion = await applyMaterialMutationDemotion(tx, pkg);
    await tx.migrationBranchMapping.delete({ where: { id: existing.id } });

    await writeMigrationAudit(tx, {
      businessId: actor.businessId,
      userId: actor.userId,
      userName: actor.userName,
      userRole: actor.userRole,
      action: 'MIGRATION_BRANCH_MAPPING_DELETE',
      entityId: input.packageId,
      details: {
        mappingId: existing.id,
        sourceBranchKey: existing.sourceBranchKey,
        targetStoreId: existing.targetStoreId,
        packageVersion: demotion.nextVersion,
        packageStatus: demotion.nextStatus,
      },
    });

    return {
      packageVersion: demotion.nextVersion,
      packageStatus: demotion.nextStatus,
    };
  });
}
