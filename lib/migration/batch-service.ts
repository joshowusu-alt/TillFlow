import { prisma } from '@/lib/prisma';
import { audit } from '@/lib/audit';
import { UserError } from '@/lib/action-utils';
import {
  MIGRATION_CONTRACT_VERSION,
  type CatalogueRow,
  type MigrationBatchStatus,
  type MigrationException,
  type MigrationReconciliation,
  type MigrationReconciliationStatus,
  type MigrationTemplateKind,
  type OpeningStockRow,
  type SupplierRow,
  isMigrationBatchStatus,
  isMigrationReconciliationStatus,
  isMigrationTemplateKind,
} from '@/lib/migration/types';
import {
  assertReconciliationTransition,
  assertTransition,
  importOutcomeStatus,
  isSuccessfullyReconciled,
  validationOutcomeStatus,
} from '@/lib/migration/lifecycle';
import { emptyValidationState, validateRawRow } from '@/lib/migration/validate';
import { reconcileValidRows } from '@/lib/migration/reconcile';
import {
  commitCatalogueChunk,
  commitOpeningStockChunk,
  commitSupplierChunk,
} from '@/lib/migration/commit';
import { normaliseSourceSystemKey } from '@/lib/migration/source-system-key';
import { sha256Hex } from '@/lib/migration/checksum';
import {
  MIGRATION_DEFAULT_CHUNK_SIZE,
  MIGRATION_MAX_FILE_BYTES,
  MIGRATION_MAX_ROWS,
  clampJsonString,
  truncateExceptionsForStorage,
} from '@/lib/migration/limits';

export { sha256Hex } from '@/lib/migration/checksum';

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function loadBatch(businessId: string, batchId: string) {
  const batch = await prisma.migrationBatch.findFirst({
    where: { id: batchId, businessId },
  });
  if (!batch) throw new UserError('Migration batch not found.');
  return batch;
}

function statusOf(batch: { status: string }): MigrationBatchStatus {
  if (!isMigrationBatchStatus(batch.status)) {
    throw new UserError(`Unknown migration batch status: ${batch.status}`);
  }
  return batch.status;
}

function reconOf(batch: { reconciliationStatus: string }): MigrationReconciliationStatus {
  if (!isMigrationReconciliationStatus(batch.reconciliationStatus)) {
    throw new UserError(`Unknown reconciliation status: ${batch.reconciliationStatus}`);
  }
  return batch.reconciliationStatus;
}

function assertImmutableFile(batch: { fileChecksum: string }, fileChecksum: string) {
  if (batch.fileChecksum !== fileChecksum) {
    throw new UserError(
      'Uploaded content does not match this batch fileChecksum. Create a new batch for changed files.',
    );
  }
}

function assertNotApprovedMutation(batch: { status: string; approvedFileChecksum: string | null }) {
  const status = statusOf(batch as { status: string });
  if (
    status === 'APPROVED' ||
    status === 'IMPORTING' ||
    status === 'COMPLETED' ||
    status === 'COMPLETED_WITH_EXCEPTIONS'
  ) {
    throw new UserError('Approved or completed batches cannot change template, source, or file identity.');
  }
}

export async function createMigrationBatch(input: {
  businessId: string;
  userId: string;
  userName: string | null;
  userRole: string;
  templateKind: MigrationTemplateKind;
  clientBatchKey: string;
  sourceSystemKey: string;
  sourceSystemLabel?: string | null;
  fileName?: string | null;
  /** Raw file bytes/text used to compute server-side checksum. */
  fileContent: string | Buffer;
  chunksTotal: number;
  chunkSize?: number;
  expectedRows?: number;
}) {
  if (!isMigrationTemplateKind(input.templateKind)) {
    throw new UserError('Choose a valid migration template: catalogue, suppliers, or opening stock.');
  }
  const key = input.clientBatchKey.trim();
  if (!key) throw new UserError('clientBatchKey is required.');
  if (input.chunksTotal < 1) throw new UserError('chunksTotal must be at least 1.');

  const sourceSystemKey = normaliseSourceSystemKey(input.sourceSystemKey);
  const fileChecksum = sha256Hex(input.fileContent);
  const fileByteLength = Buffer.byteLength(input.fileContent);
  if (fileByteLength <= 0) throw new UserError('Uploaded file is empty.');
  if (fileByteLength > MIGRATION_MAX_FILE_BYTES) {
    throw new UserError(`File exceeds maximum size of ${MIGRATION_MAX_FILE_BYTES} bytes.`);
  }
  if (input.expectedRows != null && input.expectedRows > MIGRATION_MAX_ROWS) {
    throw new UserError(`File exceeds maximum of ${MIGRATION_MAX_ROWS} rows.`);
  }

  const existing = await prisma.migrationBatch.findUnique({
    where: {
      businessId_clientBatchKey: {
        businessId: input.businessId,
        clientBatchKey: key,
      },
    },
  });
  if (existing) {
    if (existing.fileChecksum !== fileChecksum) {
      throw new UserError(
        'clientBatchKey already exists with different file contents. Use a new clientBatchKey.',
      );
    }
    if (existing.sourceSystemKey !== sourceSystemKey) {
      throw new UserError('clientBatchKey already exists with a different sourceSystemKey.');
    }
    if (existing.templateKind !== input.templateKind) {
      throw new UserError('clientBatchKey already exists with a different template kind.');
    }
    return existing;
  }

  const batch = await prisma.migrationBatch.create({
    data: {
      businessId: input.businessId,
      templateKind: input.templateKind,
      contractVersion: MIGRATION_CONTRACT_VERSION,
      sourceSystemKey,
      sourceSystemLabel: input.sourceSystemLabel?.trim() || null,
      fileName: input.fileName?.trim() || null,
      fileChecksum,
      fileByteLength,
      status: 'UPLOADED',
      reconciliationStatus: 'NOT_STARTED',
      clientBatchKey: key,
      uploadedByUserId: input.userId,
      chunkSize: input.chunkSize ?? MIGRATION_DEFAULT_CHUNK_SIZE,
      chunksTotal: input.chunksTotal,
      summaryJson: clampJsonString({
        financialEffects: {
          affectsCash: false,
          affectsMoMo: false,
          affectsSalesReports: false,
          openingStockUsesEquityOnly: input.templateKind === 'OPENING_STOCK',
        },
        importCompleteIsNotReconciled: true,
      }),
    },
  });

  await audit({
    businessId: input.businessId,
    userId: input.userId,
    userName: input.userName,
    userRole: input.userRole,
    action: 'MIGRATION_BATCH',
    entity: 'MigrationBatch',
    entityId: batch.id,
    details: {
      templateKind: input.templateKind,
      status: batch.status,
      sourceSystemKey,
      fileChecksum,
    },
  });

  return batch;
}

export async function validateMigrationChunk(input: {
  businessId: string;
  batchId: string;
  chunkIndex: number;
  fileChecksum: string;
  rows: Array<{ rowNumber: number; raw: Record<string, string> }>;
}) {
  const batch = await loadBatch(input.businessId, input.batchId);
  assertImmutableFile(batch, input.fileChecksum);
  const status = statusOf(batch);

  if (status === 'UPLOADED') {
    assertTransition(status, 'VALIDATING');
    await prisma.migrationBatch.update({
      where: { id: batch.id },
      data: { status: 'VALIDATING' },
    });
  } else if (status !== 'VALIDATING') {
    throw new UserError(`Cannot validate chunk while batch is ${status}.`);
  }

  if (input.chunkIndex < 0 || input.chunkIndex >= batch.chunksTotal) {
    throw new UserError('chunkIndex out of range.');
  }
  if (input.rows.length > batch.chunkSize) {
    throw new UserError(`Chunk exceeds batch chunkSize of ${batch.chunkSize}.`);
  }

  return prisma.$transaction(async (tx) => {
    const prior = await tx.migrationChunkReceipt.findUnique({
      where: {
        businessId_migrationBatchId_phase_chunkIndex: {
          businessId: input.businessId,
          migrationBatchId: batch.id,
          phase: 'VALIDATE',
          chunkIndex: input.chunkIndex,
        },
      },
    });
    if (prior) {
      return { duplicate: true as const, batchId: batch.id, chunkIndex: input.chunkIndex };
    }

    const kind = batch.templateKind as MigrationTemplateKind;
    const state = emptyValidationState();
    const exceptions: MigrationException[] = [];
    const validRows: Array<CatalogueRow | SupplierRow | OpeningStockRow> = [];

    for (const row of input.rows) {
      const result = validateRawRow(kind, row.rowNumber, row.raw, state);
      exceptions.push(...result.exceptions);
      if (result.ok && result.row) validRows.push(result.row);
    }

    const rowsInvalid = input.rows.length - validRows.length;
    const chunkRecon = reconcileValidRows(kind, validRows);
    const existingExceptions = parseJson<MigrationException[]>(batch.exceptionReportJson, []);
    const { retained, truncated } = truncateExceptionsForStorage([
      ...existingExceptions,
      ...exceptions,
    ]);

    await tx.migrationChunkReceipt.create({
      data: {
        businessId: input.businessId,
        migrationBatchId: batch.id,
        phase: 'VALIDATE',
        chunkIndex: input.chunkIndex,
        rowCount: input.rows.length,
        status: 'COMPLETED',
        fileChecksum: batch.fileChecksum,
      },
    });

    await tx.migrationBatch.update({
      where: { id: batch.id },
      data: {
        rowsParsed: { increment: input.rows.length },
        rowsValid: { increment: validRows.length },
        rowsInvalid: { increment: rowsInvalid },
        chunksValidated: { increment: 1 },
        exceptionReportJson: clampJsonString({
          exceptions: retained,
          truncated,
        }),
        reconciliationJson: clampJsonString({
          lastValidateChunk: chunkRecon,
          note: 'Final control totals are computed at reconciliation time.',
        }),
      },
    });

    return {
      duplicate: false as const,
      batchId: batch.id,
      chunkIndex: input.chunkIndex,
      rowsValid: validRows.length,
      rowsInvalid,
      exceptions,
      validRows,
    };
  }, { maxWait: 20_000, timeout: 120_000 });
}

export async function finalizeMigrationValidation(input: {
  businessId: string;
  batchId: string;
  fileChecksum: string;
}) {
  const batch = await loadBatch(input.businessId, input.batchId);
  assertImmutableFile(batch, input.fileChecksum);
  const status = statusOf(batch);
  if (status !== 'VALIDATING' && status !== 'UPLOADED') {
    throw new UserError(`Cannot finalise validation while batch is ${status}.`);
  }

  const receipts = await prisma.migrationChunkReceipt.count({
    where: { businessId: input.businessId, migrationBatchId: batch.id, phase: 'VALIDATE' },
  });
  if (receipts < batch.chunksTotal) {
    throw new UserError(`Validation incomplete: ${receipts}/${batch.chunksTotal} chunks received.`);
  }

  if (status === 'UPLOADED') {
    assertTransition('UPLOADED', 'VALIDATING');
    await prisma.migrationBatch.update({
      where: { id: batch.id },
      data: { status: 'VALIDATING' },
    });
  }

  const fresh = await loadBatch(input.businessId, input.batchId);
  const next = validationOutcomeStatus({
    rowsValid: fresh.rowsValid,
    rowsInvalid: fresh.rowsInvalid,
  });
  assertTransition('VALIDATING', next);

  return prisma.migrationBatch.update({
    where: { id: batch.id },
    data: { status: next },
  });
}

export async function approveMigrationBatch(input: {
  businessId: string;
  userId: string;
  userName: string | null;
  userRole: string;
  batchId: string;
  fileChecksum: string;
}) {
  const batch = await loadBatch(input.businessId, input.batchId);
  assertImmutableFile(batch, input.fileChecksum);
  const status = statusOf(batch);
  assertTransition(status, 'APPROVED');
  if (batch.rowsValid <= 0) throw new UserError('Cannot approve a batch with no valid rows.');
  if (batch.contractVersion !== MIGRATION_CONTRACT_VERSION) {
    throw new UserError('Batch contract version is not the current supported version.');
  }

  const updated = await prisma.migrationBatch.update({
    where: { id: batch.id },
    data: {
      status: 'APPROVED',
      approvedByUserId: input.userId,
      approvedAt: new Date(),
      approvedFileChecksum: batch.fileChecksum,
    },
  });

  await audit({
    businessId: input.businessId,
    userId: input.userId,
    userName: input.userName,
    userRole: input.userRole,
    action: 'MIGRATION_BATCH',
    entity: 'MigrationBatch',
    entityId: batch.id,
    details: {
      status: 'APPROVED',
      templateKind: batch.templateKind,
      fileChecksum: batch.fileChecksum,
      sourceSystemKey: batch.sourceSystemKey,
    },
  });

  return updated;
}

export async function importMigrationChunk(input: {
  businessId: string;
  userId: string;
  batchId: string;
  chunkIndex: number;
  fileChecksum: string;
  rows: Array<CatalogueRow | SupplierRow | OpeningStockRow>;
}) {
  const batch = await loadBatch(input.businessId, input.batchId);
  assertImmutableFile(batch, input.fileChecksum);
  if (!batch.approvedFileChecksum || batch.approvedFileChecksum !== batch.fileChecksum) {
    throw new UserError('Batch is not approved for this fileChecksum.');
  }
  if (input.fileChecksum !== batch.approvedFileChecksum) {
    throw new UserError('Commit checksum does not match the approved file.');
  }

  let status = statusOf(batch);
  if (status === 'APPROVED') {
    assertTransition(status, 'IMPORTING');
    await prisma.migrationBatch.update({
      where: { id: batch.id },
      data: { status: 'IMPORTING', startedImportAt: new Date(), reconciliationStatus: 'PENDING' },
    });
    status = 'IMPORTING';
  }
  if (status !== 'IMPORTING') {
    throw new UserError(`Cannot import chunk while batch is ${status}.`);
  }
  if (input.chunkIndex < 0 || input.chunkIndex >= batch.chunksTotal) {
    throw new UserError('chunkIndex out of range.');
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const prior = await tx.migrationChunkReceipt.findUnique({
        where: {
          businessId_migrationBatchId_phase_chunkIndex: {
            businessId: input.businessId,
            migrationBatchId: batch.id,
            phase: 'IMPORT',
            chunkIndex: input.chunkIndex,
          },
        },
      });
      if (prior) {
        return { duplicate: true as const, batchId: batch.id, chunkIndex: input.chunkIndex };
      }

      const kind = batch.templateKind as MigrationTemplateKind;
      let result;
      if (kind === 'SUPPLIERS') {
        result = await commitSupplierChunk(tx, {
          businessId: input.businessId,
          migrationBatchId: batch.id,
          sourceSystemKey: batch.sourceSystemKey,
          rows: input.rows as SupplierRow[],
        });
      } else if (kind === 'CATALOGUE') {
        result = await commitCatalogueChunk(tx, {
          businessId: input.businessId,
          migrationBatchId: batch.id,
          sourceSystemKey: batch.sourceSystemKey,
          rows: input.rows as CatalogueRow[],
        });
      } else {
        result = await commitOpeningStockChunk(tx, {
          businessId: input.businessId,
          migrationBatchId: batch.id,
          sourceSystemKey: batch.sourceSystemKey,
          userId: input.userId,
          rows: input.rows as OpeningStockRow[],
        });
      }

      // Receipt only after business writes in the same TX.
      await tx.migrationChunkReceipt.create({
        data: {
          businessId: input.businessId,
          migrationBatchId: batch.id,
          phase: 'IMPORT',
          chunkIndex: input.chunkIndex,
          rowCount: input.rows.length,
          status: 'COMPLETED',
          fileChecksum: batch.fileChecksum,
        },
      });

      const existingReport = parseJson<{ exceptions?: MigrationException[]; truncated?: number }>(
        batch.exceptionReportJson,
        { exceptions: [] },
      );
      const commitExceptions: MigrationException[] = result.exceptions.map((e) => ({
        rowNumber: e.rowNumber,
        severity: 'error' as const,
        code: e.code,
        message: e.message,
      }));
      const { retained, truncated } = truncateExceptionsForStorage([
        ...(existingReport.exceptions ?? []),
        ...commitExceptions,
      ]);

      await tx.migrationBatch.update({
        where: { id: batch.id },
        data: {
          rowsImported: { increment: result.imported },
          rowsSkipped: { increment: result.skipped },
          rowsFailed: { increment: result.failed },
          chunksImported: { increment: 1 },
          exceptionReportJson: clampJsonString({
            exceptions: retained,
            truncated: truncated + (existingReport.truncated ?? 0),
          }),
        },
      });

      return {
        duplicate: false as const,
        batchId: batch.id,
        chunkIndex: input.chunkIndex,
        ...result,
      };
    }, { maxWait: 20_000, timeout: 120_000 });
  } catch (e) {
    // Unique violation on receipt = concurrent winner already completed the chunk.
    const msg = e instanceof Error ? e.message : String(e);
    if (/Unique constraint|P2002/i.test(msg)) {
      return { duplicate: true as const, batchId: batch.id, chunkIndex: input.chunkIndex };
    }
    throw e;
  }
}

export async function finalizeMigrationImport(input: {
  businessId: string;
  userId: string;
  userName: string | null;
  userRole: string;
  batchId: string;
  fileChecksum: string;
}) {
  const batch = await loadBatch(input.businessId, input.batchId);
  assertImmutableFile(batch, input.fileChecksum);
  const status = statusOf(batch);
  if (status !== 'IMPORTING') {
    throw new UserError(`Cannot finalise import while batch is ${status}.`);
  }

  const receipts = await prisma.migrationChunkReceipt.count({
    where: { businessId: input.businessId, migrationBatchId: batch.id, phase: 'IMPORT' },
  });
  if (receipts < batch.chunksTotal) {
    throw new UserError(`Import incomplete: ${receipts}/${batch.chunksTotal} chunks received.`);
  }

  const fresh = await loadBatch(input.businessId, input.batchId);
  const next = importOutcomeStatus({
    rowsFailed: fresh.rowsFailed,
    rowsImported: fresh.rowsImported,
  });
  assertTransition('IMPORTING', next);

  const updated = await prisma.migrationBatch.update({
    where: { id: batch.id },
    data: {
      status: next,
      completedAt: new Date(),
      // Import terminal ≠ reconciled
      reconciliationStatus: fresh.reconciliationStatus === 'NOT_STARTED' ? 'PENDING' : fresh.reconciliationStatus,
    },
  });

  await audit({
    businessId: input.businessId,
    userId: input.userId,
    userName: input.userName,
    userRole: input.userRole,
    action: 'MIGRATION_BATCH',
    entity: 'MigrationBatch',
    entityId: batch.id,
    details: {
      status: next,
      reconciliationStatus: updated.reconciliationStatus,
      rowsImported: fresh.rowsImported,
      rowsFailed: fresh.rowsFailed,
      templateKind: batch.templateKind,
      note: 'Import completion is not reconciliation success.',
    },
  });

  return updated;
}

export async function runMigrationReconciliation(input: {
  businessId: string;
  userId: string;
  userName: string | null;
  userRole: string;
  batchId: string;
  /** Expected control totals from the validated file (client or operator). */
  expected: MigrationReconciliation;
}) {
  const batch = await loadBatch(input.businessId, input.batchId);
  const status = statusOf(batch);
  if (status !== 'COMPLETED' && status !== 'COMPLETED_WITH_EXCEPTIONS') {
    throw new UserError('Reconciliation runs only after import completion.');
  }

  const from = reconOf(batch);
  if (from === 'ACCEPTED') {
    throw new UserError('Reconciliation was already accepted and is immutable.');
  }
  if (from === 'NOT_STARTED') {
    assertReconciliationTransition(from, 'PENDING');
  }

  // Actuals from durable maps / postings
  let actual: MigrationReconciliation;
  const kind = batch.templateKind as MigrationTemplateKind;
  if (kind === 'CATALOGUE') {
    const maps = await prisma.migrationEntityMap.count({
      where: {
        businessId: input.businessId,
        migrationBatchId: batch.id,
        entityType: 'PRODUCT',
      },
    });
    actual = {
      ...(input.expected as Extract<MigrationReconciliation, { templateKind: 'CATALOGUE' }>),
      rowsValid: batch.rowsValid,
      distinctLegacyProductIds: maps,
    };
  } else if (kind === 'SUPPLIERS') {
    const maps = await prisma.migrationEntityMap.count({
      where: {
        businessId: input.businessId,
        migrationBatchId: batch.id,
        entityType: 'SUPPLIER',
      },
    });
    actual = {
      ...(input.expected as Extract<MigrationReconciliation, { templateKind: 'SUPPLIERS' }>),
      rowsValid: batch.rowsValid,
      distinctLegacySupplierIds: maps,
    };
  } else {
    const posts = await prisma.migrationOpeningStockPosting.aggregate({
      where: { businessId: input.businessId, migrationBatchId: batch.id },
      _sum: { qtyBase: true },
      _count: true,
    });
    actual = {
      templateKind: 'OPENING_STOCK',
      rowsValid: batch.rowsValid,
      distinctLegacyProductIds: 0,
      distinctBranchCodes: 0,
      totalQuantity: posts._sum.qtyBase ?? 0,
      valuedLines: posts._count,
      unvaluedLines: 0,
      totalStockValue: 0,
    };
  }

  const matched = JSON.stringify(actual) === JSON.stringify(input.expected) ||
    (kind === 'CATALOGUE' &&
      (actual as any).distinctLegacyProductIds === (input.expected as any).distinctLegacyProductIds &&
      batch.rowsFailed === 0) ||
    (kind === 'SUPPLIERS' &&
      (actual as any).distinctLegacySupplierIds === (input.expected as any).distinctLegacySupplierIds &&
      batch.rowsFailed === 0) ||
    (kind === 'OPENING_STOCK' &&
      (actual as any).totalQuantity === (input.expected as any).totalQuantity &&
      batch.rowsFailed === 0);

  const next: MigrationReconciliationStatus = matched ? 'MATCHED' : 'MISMATCHED';
  assertReconciliationTransition(from === 'NOT_STARTED' ? 'PENDING' : from, next);

  const updated = await prisma.migrationBatch.update({
    where: { id: batch.id },
    data: {
      reconciliationStatus: next,
      reconciliationJson: clampJsonString({ expected: input.expected, actual, matched }),
    },
  });

  await audit({
    businessId: input.businessId,
    userId: input.userId,
    userName: input.userName,
    userRole: input.userRole,
    action: 'MIGRATION_BATCH',
    entity: 'MigrationBatch',
    entityId: batch.id,
    details: { reconciliationStatus: next, matched },
  });

  return updated;
}

export async function acceptMigrationReconciliation(input: {
  businessId: string;
  userId: string;
  userName: string | null;
  userRole: string;
  batchId: string;
  /** Required when accepting a MISMATCHED batch. */
  acceptMismatch?: boolean;
}) {
  const batch = await loadBatch(input.businessId, input.batchId);
  const from = reconOf(batch);
  if (from === 'MISMATCHED' && !input.acceptMismatch) {
    throw new UserError('Mismatched controls require explicit acceptMismatch confirmation.');
  }
  if (from !== 'MATCHED' && from !== 'MISMATCHED') {
    throw new UserError('Only MATCHED or MISMATCHED batches can be accepted.');
  }
  assertReconciliationTransition(from, 'ACCEPTED');

  const updated = await prisma.migrationBatch.update({
    where: { id: batch.id },
    data: {
      reconciliationStatus: 'ACCEPTED',
      reconciledByUserId: input.userId,
      reconciledAt: new Date(),
    },
  });

  await audit({
    businessId: input.businessId,
    userId: input.userId,
    userName: input.userName,
    userRole: input.userRole,
    action: 'MIGRATION_BATCH',
    entity: 'MigrationBatch',
    entityId: batch.id,
    details: {
      reconciliationStatus: 'ACCEPTED',
      acceptedDespiteMismatch: from === 'MISMATCHED',
    },
  });

  return updated;
}

export async function listMigrationBatches(businessId: string, take = 20) {
  return prisma.migrationBatch.findMany({
    where: { businessId },
    orderBy: { createdAt: 'desc' },
    take,
    select: {
      id: true,
      templateKind: true,
      status: true,
      reconciliationStatus: true,
      fileName: true,
      fileChecksum: true,
      contractVersion: true,
      sourceSystemKey: true,
      sourceSystemLabel: true,
      rowsParsed: true,
      rowsValid: true,
      rowsInvalid: true,
      rowsImported: true,
      rowsFailed: true,
      createdAt: true,
      completedAt: true,
    },
  });
}

export async function getMigrationBatch(businessId: string, batchId: string) {
  return loadBatch(businessId, batchId);
}

export function describeBatchForUi(batch: {
  status: string;
  reconciliationStatus: string;
}) {
  return {
    importStatus: batch.status,
    reconciliationStatus: batch.reconciliationStatus,
    importComplete: isMigrationBatchStatus(batch.status)
      ? batch.status === 'COMPLETED' || batch.status === 'COMPLETED_WITH_EXCEPTIONS'
      : false,
    reconciledSuccessfully: isMigrationReconciliationStatus(batch.reconciliationStatus)
      ? isSuccessfullyReconciled(batch.reconciliationStatus)
      : false,
  };
}

/** Rejects attempts to mutate identity fields after approval (defence in depth). */
export function guardApprovedBatchIdentity(batch: {
  status: string;
  approvedFileChecksum: string | null;
  sourceSystemKey: string;
  templateKind: string;
  contractVersion: string;
  fileChecksum: string;
}, attempted: {
  sourceSystemKey?: string;
  templateKind?: string;
  contractVersion?: string;
  fileChecksum?: string;
}) {
  assertNotApprovedMutation(batch);
  if (attempted.sourceSystemKey != null && attempted.sourceSystemKey !== batch.sourceSystemKey) {
    throw new UserError('sourceSystemKey is immutable after batch creation.');
  }
  if (attempted.templateKind != null && attempted.templateKind !== batch.templateKind) {
    throw new UserError('templateKind cannot change after approval.');
  }
  if (attempted.contractVersion != null && attempted.contractVersion !== batch.contractVersion) {
    throw new UserError('contractVersion cannot change after approval.');
  }
  if (attempted.fileChecksum != null && attempted.fileChecksum !== batch.fileChecksum) {
    throw new UserError('fileChecksum is immutable for an existing batch.');
  }
}
