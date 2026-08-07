/**
 * Slice 2B — tenant-scoped migration package validation service.
 *
 * Read-only vs ordinary business data. Persists MigrationValidationRun and
 * CAS-transitions package to VALIDATED | VALIDATION_FAILED.
 */

import { createHash } from 'crypto';
import { prisma } from '@/lib/prisma';
import { assertPackageTransition } from '@/lib/migration/lifecycle';
import {
  clampJsonString,
  MIGRATION_MAX_EXCEPTIONS_RETAINED,
  truncateExceptionsForStorage,
} from '@/lib/migration/limits';
import {
  compareMigrationIssues,
  sanitiseMigrationIssue,
  type MigrationValidationIssue,
} from '@/lib/migration/issue-codes';
import { manifestChecksum } from '@/lib/migration/manifest';
import {
  MIGRATION_ENTITY_TYPES,
  type MigrationEntityType,
  type MigrationPackageStatus,
} from '@/lib/migration/types';
import { MigrationServiceError } from '@/lib/services/migration/errors';
import {
  assertExpectedVersion,
  assertMigrationActor,
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
import {
  applyCrossFileSemantics,
  summariseIssues,
  validateEntityFile,
  type EntityValidationOutput,
} from '@/lib/services/migration/validate-engine';

export type ValidateMigrationPackageInput = {
  packageId: string;
  expectedVersion: number;
  /** Ignored — session business is authoritative. */
  businessId?: string;
};

export type ValidateMigrationPackageResult = {
  packageId: string;
  packageStatus: 'VALIDATED' | 'VALIDATION_FAILED';
  packageVersion: number;
  validationRunId: string;
  runStatus: 'SUCCESS' | 'FAILED';
  manifestChecksum: string;
  replayed: boolean;
  durationMs: number;
  totalRowsProcessed: number;
  errorCount: number;
  warningCount: number;
  exceptionCount: number;
  exceptionsTruncated: number;
  exceptions: MigrationValidationIssue[];
  fileChecksums: Record<string, string>;
};

const ELIGIBLE = new Set(['DRAFT', 'VALIDATED', 'VALIDATION_FAILED']);

function emptyEntity(entityType: MigrationEntityType): EntityValidationOutput {
  return {
    entityType,
    checksum: '',
    expectedChecksum: '',
    checksumMatched: false,
    byteLength: 0,
    rowCount: 0,
    issues: [],
    sourceKeys: new Set(),
    sourceKeyDisplay: new Map(),
    skus: new Map(),
    barcodes: new Map(),
    defaultSupplierRefs: [],
    openingStockRefs: [],
  };
}

function digestSummary(payload: unknown): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

export async function validateMigrationPackage(
  actorInput: {
    userId: string;
    userName?: string | null;
    userRole: string;
    businessId: string;
  },
  input: ValidateMigrationPackageInput,
  deps: {
    db?: DbClient;
    storage?: MigrationObjectStorage;
  } = {},
): Promise<ValidateMigrationPackageResult> {
  const started = Date.now();
  const db = deps.db ?? prisma;
  const storage = deps.storage ?? getMigrationObjectStorage();
  const actor: ActorContext = {
    ...assertMigrationActor(actorInput),
    userName: actorInput.userName?.trim() || actorInput.userId,
  };
  const expectedVersion = requireExpectedVersion(input.expectedVersion);
  const packageId = String(input.packageId ?? '').trim();
  if (!packageId || packageId.length > 64) {
    throw new MigrationServiceError('NOT_FOUND', undefined, 404);
  }

  // Session business only — never trust client businessId.
  const preview = await db.migrationPackage.findFirst({
    where: { id: packageId, businessId: actor.businessId },
    include: {
      files: true,
      branchMappings: { select: { sourceBranchKey: true, targetStoreId: true } },
      latestValidationRun: true,
    },
  });
  if (!preview) {
    throw new MigrationServiceError('NOT_FOUND', undefined, 404);
  }
  if (!ELIGIBLE.has(preview.status)) {
    throw new MigrationServiceError('LIFECYCLE', undefined, 409);
  }
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

  const filesByType = new Map(preview.files.map((f) => [f.entityType, f]));
  const missing: string[] = [];
  for (const t of MIGRATION_ENTITY_TYPES) {
    const f = filesByType.get(t);
    if (!f || f.storageStatus !== 'FINALISED' || !f.storageKey || !f.uploadChecksum) {
      missing.push(t);
    }
  }

  // Idempotent replay: same SUCCESS checksum + matching version.
  if (
    preview.status === 'VALIDATED' &&
    preview.latestValidationRun &&
    preview.latestValidationRun.status === 'SUCCESS' &&
    !preview.latestValidationRun.supersededAt
  ) {
    const currentManifest = buildPreviewManifestChecksum(preview);
    if (preview.latestValidationRun.manifestChecksum === currentManifest && missing.length === 0) {
      const summary = safeParseSummary(preview.latestValidationRun.summaryJson);
      return {
        packageId: preview.id,
        packageStatus: 'VALIDATED',
        packageVersion: preview.version,
        validationRunId: preview.latestValidationRun.id,
        runStatus: 'SUCCESS',
        manifestChecksum: preview.latestValidationRun.manifestChecksum,
        replayed: true,
        durationMs: Date.now() - started,
        totalRowsProcessed: Number(summary.totalRowsProcessed ?? 0),
        errorCount: Number(summary.errorCount ?? 0),
        warningCount: Number(summary.warningCount ?? 0),
        exceptionCount: preview.latestValidationRun.exceptionCount,
        exceptionsTruncated: preview.latestValidationRun.exceptionsTruncated,
        exceptions: Array.isArray(summary.exceptions)
          ? (summary.exceptions as MigrationValidationIssue[])
          : [],
        fileChecksums: (summary.fileChecksums as Record<string, string>) ?? {},
      };
    }
  }

  const allIssues: MigrationValidationIssue[] = [];
  if (missing.length) {
    allIssues.push(
      sanitiseMigrationIssue({
        code: 'PACKAGE_INCOMPLETE',
        severity: 'error',
        entityType: 'PACKAGE',
        rowNumber: null,
        column: null,
        message: `Package is missing finalised files: ${missing.join(', ')}.`,
      }),
    );
  }

  await db.$transaction(async (tx) => {
    await writeMigrationAudit(tx, {
      businessId: actor.businessId,
      userId: actor.userId,
      userName: actor.userName,
      userRole: actor.userRole,
      action: 'MIGRATION_VALIDATION_REQUESTED',
      entityId: preview.id,
      details: {
        packageVersion: preview.version,
        status: preview.status,
        missingFiles: missing,
      },
    });
  });

  const entityResults: Record<MigrationEntityType, EntityValidationOutput> = {
    SUPPLIERS: emptyEntity('SUPPLIERS'),
    PRODUCTS: emptyEntity('PRODUCTS'),
    OPENING_STOCK: emptyEntity('OPENING_STOCK'),
  };

  if (missing.length === 0) {
    for (const entityType of MIGRATION_ENTITY_TYPES) {
      const file = filesByType.get(entityType)!;
      try {
        const { stream } = await storage.getStream(file.storageKey!);
        entityResults[entityType] = await validateEntityFile({
          entityType,
          stream,
          expectedChecksum: file.uploadChecksum,
        });
      } catch {
        entityResults[entityType] = {
          ...emptyEntity(entityType),
          expectedChecksum: file.uploadChecksum.toLowerCase(),
          issues: [
            sanitiseMigrationIssue({
              code: 'STORAGE_OBJECT_MISSING',
              severity: 'error',
              entityType,
              rowNumber: null,
              column: null,
              message: 'Private migration object could not be read.',
            }),
          ],
        };
      }
      allIssues.push(...entityResults[entityType].issues);
    }
    allIssues.push(
      ...applyCrossFileSemantics({
        suppliers: entityResults.SUPPLIERS,
        products: entityResults.PRODUCTS,
        openingStock: entityResults.OPENING_STOCK,
        branchMappings: preview.branchMappings,
      }),
    );
  }

  allIssues.sort(compareMigrationIssues);
  const { errorCount, warningCount } = summariseIssues(allIssues);
  const { retained, truncated } = truncateExceptionsForStorage(allIssues);
  const retainedSanitised = retained.map(sanitiseMigrationIssue);

  const fileChecksums: Record<string, string> = {};
  for (const t of MIGRATION_ENTITY_TYPES) {
    const f = filesByType.get(t);
    if (f) fileChecksums[t] = f.uploadChecksum.toLowerCase();
  }

  const nextManifest = manifestChecksum({
    contractVersion: preview.contractVersion,
    sourceSystemKey: preview.sourceSystemKey,
    sourceBusinessKey: preview.sourceBusinessKey,
    reportingCurrency: preview.reportingCurrency,
    packageAsOfDate: preview.packageAsOfDate,
    files: MIGRATION_ENTITY_TYPES.filter((t) => filesByType.get(t)?.uploadChecksum).map((t) => ({
      entityType: t,
      checksum: filesByType.get(t)!.uploadChecksum,
    })),
    branchMappings: preview.branchMappings.map((m) => ({
      sourceBranchKey: m.sourceBranchKey,
      targetStoreId: m.targetStoreId,
    })),
  });

  const success = errorCount === 0 && missing.length === 0;
  // Checksum mismatches are already errors in entity issues — belt and braces:
  for (const t of MIGRATION_ENTITY_TYPES) {
    if (entityResults[t].checksum && !entityResults[t].checksumMatched) {
      if (success) {
        /* unreachable when issues include CHECKSUM_MISMATCH */
      }
    }
  }
  const packageStatus = success ? 'VALIDATED' : 'VALIDATION_FAILED';
  const runStatus = success ? 'SUCCESS' : 'FAILED';
  const durationMs = Date.now() - started;
  const totalRowsProcessed =
    entityResults.SUPPLIERS.rowCount +
    entityResults.PRODUCTS.rowCount +
    entityResults.OPENING_STOCK.rowCount;

  const summaryObject = {
    contractVersion: preview.contractVersion,
    durationMs,
    totalRowsProcessed,
    validRowEstimate: Math.max(0, totalRowsProcessed),
    errorCount,
    warningCount,
    exceptionCount: allIssues.length,
    exceptionsTruncated: truncated,
    exceptions: retainedSanitised,
    fileChecksums,
    rowCounts: {
      SUPPLIERS: entityResults.SUPPLIERS.rowCount,
      PRODUCTS: entityResults.PRODUCTS.rowCount,
      OPENING_STOCK: entityResults.OPENING_STOCK.rowCount,
    },
  };
  const summaryJson = clampJsonString(summaryObject);
  const resultDigest = digestSummary({
    manifestChecksum: nextManifest,
    runStatus,
    errorCount,
    warningCount,
    exceptionCount: allIssues.length,
    exceptionsTruncated: truncated,
  });

  const persisted = await db.$transaction(async (tx) => {
    const locked = await lockPackageForBusiness(tx, {
      businessId: actor.businessId,
      packageId: preview.id,
    });
    assertExpectedVersion(locked, expectedVersion);
    if (!ELIGIBLE.has(locked.status)) {
      throw new MigrationServiceError('LIFECYCLE', undefined, 409);
    }

    // Re-verify finalised checksums under lock (replacement race).
    const freshFiles = await tx.migrationFile.findMany({
      where: { businessId: actor.businessId, packageId: preview.id },
    });
    for (const t of MIGRATION_ENTITY_TYPES) {
      const f = freshFiles.find((x) => x.entityType === t);
      const prior = fileChecksums[t];
      if (!f || f.storageStatus !== 'FINALISED' || !prior || f.uploadChecksum.toLowerCase() !== prior) {
        throw new MigrationServiceError('STALE_VERSION', undefined, 409);
      }
    }

    assertPackageTransition(locked.status as MigrationPackageStatus, packageStatus);

    if (locked.latestValidationRunId) {
      await tx.migrationValidationRun.updateMany({
        where: {
          id: locked.latestValidationRunId,
          businessId: actor.businessId,
          packageId: preview.id,
          supersededAt: null,
        },
        data: { status: 'STALE', supersededAt: new Date() },
      });
    }

    const run = await tx.migrationValidationRun.create({
      data: {
        businessId: actor.businessId,
        packageId: preview.id,
        status: runStatus,
        manifestChecksum: nextManifest,
        resultDigest,
        summaryJson,
        exceptionCount: allIssues.length,
        exceptionsTruncated: truncated,
        validatedByUserId: actor.userId,
      },
    });

    const nextVersion = locked.version + 1;
    await tx.migrationPackage.update({
      where: { id: preview.id },
      data: {
        status: packageStatus,
        version: nextVersion,
        latestValidationRunId: run.id,
        validatedAt: success ? new Date() : null,
        validatedByUserId: success ? actor.userId : null,
        errorMessage: success
          ? null
          : `Validation failed with ${errorCount} error(s).`,
        summaryJson: clampJsonString({
          lastValidationRunId: run.id,
          runStatus,
          errorCount,
          warningCount,
        }),
        manifestChecksum: nextManifest,
      },
    });

    if (success) {
      for (const t of MIGRATION_ENTITY_TYPES) {
        const f = freshFiles.find((x) => x.entityType === t)!;
        await tx.migrationFile.update({
          where: { id: f.id },
          data: {
            validationChecksum: f.uploadChecksum,
            validatedAt: new Date(),
            rowCount: entityResults[t].rowCount,
          },
        });
      }
    }

    const hasChecksumIssue = allIssues.some((i) => i.code === 'CHECKSUM_MISMATCH');
    await writeMigrationAudit(tx, {
      businessId: actor.businessId,
      userId: actor.userId,
      userName: actor.userName,
      userRole: actor.userRole,
      action: success
        ? 'MIGRATION_VALIDATION_SUCCEEDED'
        : hasChecksumIssue
          ? 'MIGRATION_VALIDATION_CHECKSUM_MISMATCH'
          : 'MIGRATION_VALIDATION_FAILED',
      entityId: preview.id,
      details: {
        validationRunId: run.id,
        fromStatus: locked.status,
        toStatus: packageStatus,
        fromVersion: locked.version,
        toVersion: nextVersion,
        manifestChecksumPrefix: nextManifest.slice(0, 12),
        durationMs,
        totalRowsProcessed,
        errorCount,
        warningCount,
        exceptionCount: allIssues.length,
        exceptionsTruncated: truncated,
        replayed: false,
      },
    });

    return { runId: run.id, nextVersion };
  });

  return {
    packageId: preview.id,
    packageStatus,
    packageVersion: persisted.nextVersion,
    validationRunId: persisted.runId,
    runStatus,
    manifestChecksum: nextManifest,
    replayed: false,
    durationMs,
    totalRowsProcessed,
    errorCount,
    warningCount,
    exceptionCount: Math.min(allIssues.length, MIGRATION_MAX_EXCEPTIONS_RETAINED + truncated),
    exceptionsTruncated: truncated,
    exceptions: retainedSanitised,
    fileChecksums,
  };
}

export async function getMigrationValidationRun(
  actorInput: {
    userId: string;
    userName?: string | null;
    userRole: string;
    businessId: string;
  },
  input: { packageId: string; runId: string },
  db: DbClient = prisma,
): Promise<{
  packageId: string;
  validationRunId: string;
  runStatus: string;
  packageStatus: string;
  packageVersion: number;
  manifestChecksum: string;
  exceptionCount: number;
  exceptionsTruncated: number;
  exceptions: MigrationValidationIssue[];
  supersededAt: string | null;
  createdAt: string;
}> {
  const actor = assertMigrationActor(actorInput);
  const pkg = await db.migrationPackage.findFirst({
    where: { id: input.packageId, businessId: actor.businessId },
    select: { id: true, status: true, version: true },
  });
  if (!pkg) {
    throw new MigrationServiceError('NOT_FOUND', undefined, 404);
  }
  const run = await db.migrationValidationRun.findFirst({
    where: {
      id: input.runId,
      packageId: input.packageId,
      businessId: actor.businessId,
    },
  });
  if (!run) {
    throw new MigrationServiceError('NOT_FOUND', undefined, 404);
  }
  const summary = safeParseSummary(run.summaryJson);
  return {
    packageId: pkg.id,
    validationRunId: run.id,
    runStatus: run.status,
    packageStatus: pkg.status,
    packageVersion: pkg.version,
    manifestChecksum: run.manifestChecksum,
    exceptionCount: run.exceptionCount,
    exceptionsTruncated: run.exceptionsTruncated,
    exceptions: Array.isArray(summary.exceptions)
      ? (summary.exceptions as MigrationValidationIssue[]).map(sanitiseMigrationIssue)
      : [],
    supersededAt: run.supersededAt ? run.supersededAt.toISOString() : null,
    createdAt: run.createdAt.toISOString(),
  };
}

function safeParseSummary(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function buildPreviewManifestChecksum(preview: {
  contractVersion: string;
  sourceSystemKey: string;
  sourceBusinessKey: string;
  reportingCurrency: string;
  packageAsOfDate: string;
  files: Array<{ entityType: string; uploadChecksum: string; storageStatus: string }>;
  branchMappings: Array<{ sourceBranchKey: string; targetStoreId: string }>;
}): string {
  const files = MIGRATION_ENTITY_TYPES.map((t) => {
    const f = preview.files.find((x) => x.entityType === t && x.storageStatus === 'FINALISED');
    return f ? { entityType: t, checksum: f.uploadChecksum } : null;
  }).filter(Boolean) as Array<{ entityType: MigrationEntityType; checksum: string }>;
  return manifestChecksum({
    contractVersion: preview.contractVersion,
    sourceSystemKey: preview.sourceSystemKey,
    sourceBusinessKey: preview.sourceBusinessKey,
    reportingCurrency: preview.reportingCurrency,
    packageAsOfDate: preview.packageAsOfDate,
    files,
    branchMappings: preview.branchMappings,
  });
}
