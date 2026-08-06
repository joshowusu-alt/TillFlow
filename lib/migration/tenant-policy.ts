/**
 * Pure tenant / branch mapping policy helpers.
 *
 * Database composite FKs enforce store∈business. These helpers cover service-layer
 * checks that Prisma cannot express alone (unresolved mappings, package completeness).
 */

import { MigrationPolicyError } from '@/lib/migration/errors';
import { MIGRATION_ENTITY_TYPES, type MigrationEntityType } from '@/lib/migration/types';

export type BranchMappingInput = {
  sourceBranchKey: string;
  targetStoreId: string;
  /** Business id of the target store (looked up server-side). */
  targetStoreBusinessId: string;
};

export type PackageFilePresence = {
  entityType: MigrationEntityType;
  uploadChecksum: string;
};

export function assertStoreBelongsToPackageBusiness(input: {
  packageBusinessId: string;
  storeBusinessId: string;
  sourceBranchKey: string;
}): void {
  if (input.packageBusinessId !== input.storeBusinessId) {
    throw new MigrationPolicyError(
      `Branch mapping for "${input.sourceBranchKey}" targets a store outside this business.`,
      'CROSS_BUSINESS_STORE',
    );
  }
}

export function assertNoDuplicateSourceBranchKeys(
  mappings: Array<{ sourceBranchKey: string }>,
): void {
  const seen = new Set<string>();
  for (const m of mappings) {
    const key = m.sourceBranchKey.trim().normalize('NFC').toLowerCase();
    if (seen.has(key)) {
      throw new MigrationPolicyError(
        `Duplicate source branch key "${m.sourceBranchKey}".`,
        'DUPLICATE_SOURCE_BRANCH',
      );
    }
    seen.add(key);
  }
}

export function assertNoDuplicateTargetStores(
  mappings: Array<{ targetStoreId: string; sourceBranchKey: string }>,
): void {
  const seen = new Set<string>();
  for (const m of mappings) {
    if (seen.has(m.targetStoreId)) {
      throw new MigrationPolicyError(
        `Target store ${m.targetStoreId} is mapped more than once (source "${m.sourceBranchKey}").`,
        'DUPLICATE_TARGET_STORE',
      );
    }
    seen.add(m.targetStoreId);
  }
}

export function assertBranchMappingsResolved(input: {
  packageBusinessId: string;
  mappings: BranchMappingInput[];
  requiredSourceBranchKeys: string[];
}): void {
  if (input.mappings.length === 0 && input.requiredSourceBranchKeys.length > 0) {
    throw new MigrationPolicyError(
      'Branch mappings are required before validation/approval.',
      'UNRESOLVED_BRANCH_MAPPING',
    );
  }

  assertNoDuplicateSourceBranchKeys(input.mappings);
  assertNoDuplicateTargetStores(input.mappings);

  for (const m of input.mappings) {
    assertStoreBelongsToPackageBusiness({
      packageBusinessId: input.packageBusinessId,
      storeBusinessId: m.targetStoreBusinessId,
      sourceBranchKey: m.sourceBranchKey,
    });
  }

  const mapped = new Set(
    input.mappings.map((m) => m.sourceBranchKey.trim().normalize('NFC').toLowerCase()),
  );
  for (const required of input.requiredSourceBranchKeys) {
    const key = required.trim().normalize('NFC').toLowerCase();
    if (!mapped.has(key)) {
      throw new MigrationPolicyError(
        `Source branch "${required}" has no target store mapping.`,
        'UNRESOLVED_BRANCH_MAPPING',
      );
    }
  }
}

export function assertPackageHasExactlyThreePhase1Files(
  files: PackageFilePresence[],
): void {
  const byType = new Map<string, PackageFilePresence>();
  for (const f of files) {
    if (byType.has(f.entityType)) {
      throw new MigrationPolicyError(
        `Package already has a ${f.entityType} file.`,
        'DUPLICATE_ENTITY_FILE',
      );
    }
    if (!f.uploadChecksum) {
      throw new MigrationPolicyError(
        `${f.entityType} file is missing an upload checksum.`,
        'MISSING_FILE_CHECKSUM',
      );
    }
    byType.set(f.entityType, f);
  }
  for (const required of MIGRATION_ENTITY_TYPES) {
    if (!byType.has(required)) {
      throw new MigrationPolicyError(
        `Package is missing required ${required} file.`,
        'MISSING_ENTITY_FILE',
      );
    }
  }
  if (files.length !== MIGRATION_ENTITY_TYPES.length) {
    throw new MigrationPolicyError(
      'Phase 1 packages must contain exactly three files.',
      'INVALID_PACKAGE_FILE_COUNT',
    );
  }
}

export function assertPackageFileTenantMatch(input: {
  packageBusinessId: string;
  fileBusinessId: string;
}): void {
  if (input.packageBusinessId !== input.fileBusinessId) {
    throw new MigrationPolicyError(
      'Migration file businessId does not match its package.',
      'PACKAGE_FILE_TENANT_MISMATCH',
    );
  }
}
