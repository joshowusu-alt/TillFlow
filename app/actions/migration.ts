'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import { err, ok, safeAction, withBusinessContext, type ActionResult } from '@/lib/action-utils';
import {
  MIGRATION_CONTRACT_VERSION,
  MIGRATION_DEFAULT_CHUNK_SIZE,
  templateCsv,
  isMigrationTemplateKind,
  type CatalogueRow,
  type MigrationReconciliation,
  type MigrationTemplateKind,
  type OpeningStockRow,
  type SupplierRow,
} from '@/lib/migration';
import {
  acceptMigrationReconciliation,
  approveMigrationBatch,
  createMigrationBatch,
  describeBatchForUi,
  finalizeMigrationImport,
  finalizeMigrationValidation,
  getMigrationBatch,
  importMigrationChunk,
  listMigrationBatches,
  runMigrationReconciliation,
  validateMigrationChunk,
} from '@/lib/migration/batch-service';

function actor(ctx: Awaited<ReturnType<typeof withBusinessContext>>) {
  return {
    businessId: ctx.businessId,
    userId: ctx.user.id,
    userName: ctx.user.name,
    userRole: ctx.user.role,
  };
}

export async function createMigrationBatchAction(input: {
  templateKind: string;
  clientBatchKey: string;
  sourceSystemKey: string;
  sourceSystemLabel?: string;
  fileName?: string;
  fileContent: string;
  chunksTotal: number;
  chunkSize?: number;
  expectedRows?: number;
}): Promise<ActionResult<{ batchId: string; status: string; contractVersion: string; fileChecksum: string }>> {
  return safeAction(async () => {
    const ctx = await withBusinessContext(['OWNER', 'MANAGER']);
    if (!isMigrationTemplateKind(input.templateKind)) {
      return err('Choose catalogue, suppliers, or opening stock.');
    }
    if (!input.fileContent) return err('fileContent is required for checksum.');
    const batch = await createMigrationBatch({
      ...actor(ctx),
      templateKind: input.templateKind,
      clientBatchKey: input.clientBatchKey,
      sourceSystemKey: input.sourceSystemKey,
      sourceSystemLabel: input.sourceSystemLabel,
      fileName: input.fileName,
      fileContent: input.fileContent,
      chunksTotal: input.chunksTotal,
      chunkSize: input.chunkSize ?? MIGRATION_DEFAULT_CHUNK_SIZE,
      expectedRows: input.expectedRows,
    });
    return ok({
      batchId: batch.id,
      status: batch.status,
      contractVersion: batch.contractVersion || MIGRATION_CONTRACT_VERSION,
      fileChecksum: batch.fileChecksum,
    });
  });
}

export async function validateMigrationChunkAction(input: {
  batchId: string;
  chunkIndex: number;
  fileChecksum: string;
  rows: Array<{ rowNumber: number; raw: Record<string, string> }>;
}): Promise<ActionResult<unknown>> {
  return safeAction(async () => {
    const ctx = await withBusinessContext(['OWNER', 'MANAGER']);
    if (!input.rows?.length) return err('Chunk has no rows.');
    if (input.rows.length > MIGRATION_DEFAULT_CHUNK_SIZE) {
      return err(`Chunk exceeds maximum size of ${MIGRATION_DEFAULT_CHUNK_SIZE} rows.`);
    }
    const result = await validateMigrationChunk({
      businessId: ctx.businessId,
      batchId: input.batchId,
      chunkIndex: input.chunkIndex,
      fileChecksum: input.fileChecksum,
      rows: input.rows,
    });
    return ok(result);
  });
}

export async function finalizeMigrationValidationAction(input: {
  batchId: string;
  fileChecksum: string;
}): Promise<ActionResult<{ batchId: string; status: string }>> {
  return safeAction(async () => {
    const ctx = await withBusinessContext(['OWNER', 'MANAGER']);
    const batch = await finalizeMigrationValidation({
      businessId: ctx.businessId,
      batchId: input.batchId,
      fileChecksum: input.fileChecksum,
    });
    return ok({ batchId: batch.id, status: batch.status });
  });
}

export async function approveMigrationBatchAction(input: {
  batchId: string;
  fileChecksum: string;
}): Promise<ActionResult<{ batchId: string; status: string }>> {
  return safeAction(async () => {
    const ctx = await withBusinessContext(['OWNER', 'MANAGER']);
    const batch = await approveMigrationBatch({
      ...actor(ctx),
      batchId: input.batchId,
      fileChecksum: input.fileChecksum,
    });
    return ok({ batchId: batch.id, status: batch.status });
  });
}

export async function importMigrationChunkAction(input: {
  batchId: string;
  chunkIndex: number;
  fileChecksum: string;
  rows: Array<CatalogueRow | SupplierRow | OpeningStockRow>;
}): Promise<ActionResult<unknown>> {
  return safeAction(async () => {
    const ctx = await withBusinessContext(['OWNER', 'MANAGER']);
    if (!input.rows?.length) return err('Chunk has no rows.');
    if (input.rows.length > MIGRATION_DEFAULT_CHUNK_SIZE) {
      return err(`Chunk exceeds maximum size of ${MIGRATION_DEFAULT_CHUNK_SIZE} rows.`);
    }
    const result = await importMigrationChunk({
      businessId: ctx.businessId,
      userId: ctx.user.id,
      batchId: input.batchId,
      chunkIndex: input.chunkIndex,
      fileChecksum: input.fileChecksum,
      rows: input.rows,
    });
    return ok(result);
  });
}

export async function finalizeMigrationImportAction(input: {
  batchId: string;
  fileChecksum: string;
}): Promise<ActionResult<{ batchId: string; status: string; reconciliationStatus: string }>> {
  return safeAction(async () => {
    const ctx = await withBusinessContext(['OWNER', 'MANAGER']);
    const batch = await finalizeMigrationImport({
      ...actor(ctx),
      batchId: input.batchId,
      fileChecksum: input.fileChecksum,
    });
    revalidateTag('pos-products');
    revalidateTag('reports');
    revalidatePath('/products');
    revalidatePath('/settings/migration');
    revalidatePath('/onboarding');
    return ok({
      batchId: batch.id,
      status: batch.status,
      reconciliationStatus: batch.reconciliationStatus,
    });
  });
}

export async function runMigrationReconciliationAction(input: {
  batchId: string;
  expected: MigrationReconciliation;
}): Promise<ActionResult<{ batchId: string; reconciliationStatus: string }>> {
  return safeAction(async () => {
    const ctx = await withBusinessContext(['OWNER', 'MANAGER']);
    const batch = await runMigrationReconciliation({
      ...actor(ctx),
      batchId: input.batchId,
      expected: input.expected,
    });
    return ok({ batchId: batch.id, reconciliationStatus: batch.reconciliationStatus });
  });
}

export async function acceptMigrationReconciliationAction(input: {
  batchId: string;
  acceptMismatch?: boolean;
}): Promise<ActionResult<{ batchId: string; reconciliationStatus: string }>> {
  return safeAction(async () => {
    const ctx = await withBusinessContext(['OWNER']);
    const batch = await acceptMigrationReconciliation({
      ...actor(ctx),
      batchId: input.batchId,
      acceptMismatch: input.acceptMismatch,
    });
    return ok({ batchId: batch.id, reconciliationStatus: batch.reconciliationStatus });
  });
}

export async function listMigrationBatchesAction(): Promise<ActionResult<unknown>> {
  return safeAction(async () => {
    const ctx = await withBusinessContext(['OWNER', 'MANAGER']);
    const rows = await listMigrationBatches(ctx.businessId);
    return ok(
      rows.map((b) => ({
        ...b,
        ui: describeBatchForUi(b),
      })),
    );
  });
}

export async function getMigrationBatchAction(input: {
  batchId: string;
}): Promise<ActionResult<unknown>> {
  return safeAction(async () => {
    const ctx = await withBusinessContext(['OWNER', 'MANAGER']);
    const batch = await getMigrationBatch(ctx.businessId, input.batchId);
    return ok({ ...batch, ui: describeBatchForUi(batch) });
  });
}

export async function getMigrationTemplateCsvAction(input: {
  templateKind: string;
}): Promise<ActionResult<{ csv: string; fileName: string }>> {
  return safeAction(async () => {
    await withBusinessContext(['OWNER', 'MANAGER']);
    if (!isMigrationTemplateKind(input.templateKind)) {
      return err('Unknown template.');
    }
    const kind = input.templateKind as MigrationTemplateKind;
    return ok({
      csv: templateCsv(kind),
      fileName: `tillflow-migration-${kind.toLowerCase()}-v${MIGRATION_CONTRACT_VERSION}.csv`,
    });
  });
}
