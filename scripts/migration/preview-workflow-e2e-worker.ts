/**
 * Worker: synthetic migration workflow against Preview Postgres.
 * Avoids importing Next/server action utils (react.cache).
 */
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import {
  commitCatalogueChunk,
  commitOpeningStockChunk,
  commitSupplierChunk,
} from '../../lib/migration/commit';
import { emptyValidationState, validateRawRow } from '../../lib/migration/validate';
import type { CatalogueRow, OpeningStockRow, SupplierRow } from '../../lib/migration/types';

const url = process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL;
if (!url || new URL(url).pathname !== '/tillflow_preview_qa') {
  throw new Error('Refusing non-preview database');
}

const PRODUCT_COUNT = Number(process.env.MIGRATION_E2E_PRODUCTS || 2500);
const CHUNK = Number(process.env.MIGRATION_E2E_CHUNK || 10);
const TX_OPTS = { maxWait: 60_000, timeout: 300_000, isolationLevel: 'ReadCommitted' as const };
console.log('TX_OPTS', TX_OPTS, 'CHUNK', CHUNK, 'urlHost', new URL(url).hostname.split('.')[0]);
const prisma = new PrismaClient({
  datasources: { db: { url } },
  log: ['error'],
  transactionOptions: {
    maxWait: TX_OPTS.maxWait,
    timeout: TX_OPTS.timeout,
  },
});
const readPrisma = new PrismaClient({
  datasources: { db: { url } },
  log: ['error'],
});

function sha(s: string) {
  return createHash('sha256').update(s).digest('hex');
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function concurrentPosReads(businessId: string, rounds: number) {
  const times: number[] = [];
  for (let i = 0; i < rounds; i++) {
    const t0 = performance.now();
    await Promise.all([
      readPrisma.product.count({ where: { businessId, active: true } }),
      readPrisma.product.findMany({
        where: { businessId, active: true },
        take: 50,
        orderBy: { name: 'asc' },
        select: { id: true, name: true, sellingPriceBasePence: true },
      }),
      readPrisma.inventoryBalance.findMany({
        where: { store: { businessId } },
        take: 50,
        select: { productId: true, qtyOnHandBase: true },
      }),
    ]);
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  return {
    rounds,
    p50Ms: Math.round(times[Math.floor(times.length * 0.5)] ?? 0),
    p95Ms: Math.round(times[Math.floor(times.length * 0.95)] ?? 0),
    maxMs: Math.round(times[times.length - 1] ?? 0),
  };
}

async function createBatch(input: {
  businessId: string;
  userId: string;
  templateKind: 'SUPPLIERS' | 'CATALOGUE' | 'OPENING_STOCK';
  sourceSystemKey: string;
  clientBatchKey: string;
  fileContent: string;
  chunksTotal: number;
}) {
  const fileChecksum = sha(input.fileContent);
  return prisma.migrationBatch.create({
    data: {
      businessId: input.businessId,
      templateKind: input.templateKind,
      contractVersion: '1.0.0',
      sourceSystemKey: input.sourceSystemKey,
      sourceSystemLabel: 'Preview E2E',
      fileName: `${input.templateKind.toLowerCase()}.csv`,
      fileChecksum,
      fileByteLength: Buffer.byteLength(input.fileContent),
      status: 'UPLOADED',
      reconciliationStatus: 'NOT_STARTED',
      clientBatchKey: input.clientBatchKey,
      uploadedByUserId: input.userId,
      chunkSize: CHUNK,
      chunksTotal: input.chunksTotal,
    },
  });
}

async function runTemplate(input: {
  businessId: string;
  userId: string;
  storeId: string;
  kind: 'SUPPLIERS' | 'CATALOGUE' | 'OPENING_STOCK';
  rows: Array<SupplierRow | CatalogueRow | OpeningStockRow>;
  toRaw: (row: any) => Record<string, string>;
  suffix: string;
}) {
  const chunks = chunkArray(input.rows, CHUNK);
  const batch = await createBatch({
    businessId: input.businessId,
    userId: input.userId,
    templateKind: input.kind,
    sourceSystemKey: 'mig-e2e-preview',
    clientBatchKey: `${input.kind.toLowerCase()}-${input.suffix}`,
    fileContent: `${input.kind}:${input.suffix}:${input.rows.length}`,
    chunksTotal: chunks.length,
  });

  // VALIDATE chunks + receipts
  await prisma.migrationBatch.update({
    where: { id: batch.id },
    data: { status: 'VALIDATING' },
  });

  let rowsValid = 0;
  let rowsInvalid = 0;
  for (let i = 0; i < chunks.length; i++) {
    const state = emptyValidationState();
    const valid: any[] = [];
    for (const row of chunks[i]!) {
      const result = validateRawRow(input.kind, row.rowNumber, input.toRaw(row), state);
      if (result.ok && result.row) valid.push(result.row);
      else rowsInvalid += 1;
    }
    rowsValid += valid.length;
    chunks[i] = valid;

    await prisma.migrationChunkReceipt.create({
      data: {
        businessId: input.businessId,
        migrationBatchId: batch.id,
        phase: 'VALIDATE',
        chunkIndex: i,
        rowCount: valid.length,
        status: 'COMPLETED',
        fileChecksum: batch.fileChecksum,
      },
    });
  }

  await prisma.migrationBatch.update({
    where: { id: batch.id },
    data: {
      status: rowsValid > 0 ? 'READY_FOR_APPROVAL' : 'VALIDATION_FAILED',
      rowsParsed: rowsValid + rowsInvalid,
      rowsValid,
      rowsInvalid,
      chunksValidated: chunks.length,
    },
  });

  await prisma.migrationBatch.update({
    where: { id: batch.id },
    data: {
      status: 'APPROVED',
      approvedByUserId: input.userId,
      approvedAt: new Date(),
      approvedFileChecksum: batch.fileChecksum,
    },
  });

  await prisma.migrationBatch.update({
    where: { id: batch.id },
    data: { status: 'IMPORTING', startedImportAt: new Date(), reconciliationStatus: 'PENDING' },
  });

  let imported = 0;
  let skipped = 0;
  let failed = 0;
  const posReadSamples: number[] = [];

  for (let i = 0; i < chunks.length; i++) {
    if (i % 5 === 0) console.log(`  ${input.kind} chunk ${i + 1}/${chunks.length}`);
    const result = await prisma.$transaction(async (tx) => {
      const prior = await tx.migrationChunkReceipt.findUnique({
        where: {
          businessId_migrationBatchId_phase_chunkIndex: {
            businessId: input.businessId,
            migrationBatchId: batch.id,
            phase: 'IMPORT',
            chunkIndex: i,
          },
        },
      });
      if (prior) return { duplicate: true as const, imported: 0, skipped: 0, failed: 0 };

      let commitResult;
      if (input.kind === 'SUPPLIERS') {
        commitResult = await commitSupplierChunk(tx, {
          businessId: input.businessId,
          migrationBatchId: batch.id,
          sourceSystemKey: 'mig-e2e-preview',
          rows: chunks[i] as SupplierRow[],
        });
      } else if (input.kind === 'CATALOGUE') {
        commitResult = await commitCatalogueChunk(tx, {
          businessId: input.businessId,
          migrationBatchId: batch.id,
          sourceSystemKey: 'mig-e2e-preview',
          rows: chunks[i] as CatalogueRow[],
        });
      } else {
        commitResult = await commitOpeningStockChunk(tx, {
          businessId: input.businessId,
          migrationBatchId: batch.id,
          sourceSystemKey: 'mig-e2e-preview',
          userId: input.userId,
          rows: chunks[i] as OpeningStockRow[],
        });
      }

      await tx.migrationChunkReceipt.create({
        data: {
          businessId: input.businessId,
          migrationBatchId: batch.id,
          phase: 'IMPORT',
          chunkIndex: i,
          rowCount: chunks[i]!.length,
          status: 'COMPLETED',
          fileChecksum: batch.fileChecksum,
        },
      });

      await tx.migrationBatch.update({
        where: { id: batch.id },
        data: {
          rowsImported: { increment: commitResult.imported },
          rowsSkipped: { increment: commitResult.skipped },
          rowsFailed: { increment: commitResult.failed },
          chunksImported: { increment: 1 },
        },
      });

      return { duplicate: false as const, ...commitResult };
    }, TX_OPTS);

    if (!result.duplicate) {
      imported += result.imported;
      skipped += result.skipped;
      failed += result.failed;
    }

    // Concurrent POS-style reads between chunks (separate client; not inside TX).
    const read = await concurrentPosReads(input.businessId, 1);
    posReadSamples.push(read.p50Ms);

    // Retry same chunk — must see durable receipt
    const prior = await prisma.migrationChunkReceipt.findUnique({
      where: {
        businessId_migrationBatchId_phase_chunkIndex: {
          businessId: input.businessId,
          migrationBatchId: batch.id,
          phase: 'IMPORT',
          chunkIndex: i,
        },
      },
    });
    if (!prior) throw new Error(`${input.kind} chunk ${i} retry missing receipt`);
  }

  posReadSamples.sort((a, b) => a - b);
  const posReads = {
    rounds: posReadSamples.length,
    p50Ms: posReadSamples[Math.floor(posReadSamples.length * 0.5)] ?? 0,
    p95Ms: posReadSamples[Math.floor(posReadSamples.length * 0.95)] ?? 0,
    maxMs: posReadSamples[posReadSamples.length - 1] ?? 0,
  };
  const status = failed > 0 ? (imported > 0 ? 'COMPLETED_WITH_EXCEPTIONS' : 'FAILED') : 'COMPLETED';
  await prisma.migrationBatch.update({
    where: { id: batch.id },
    data: {
      status,
      completedAt: new Date(),
      reconciliationStatus: 'PENDING',
    },
  });

  return {
    batchId: batch.id,
    status,
    imported,
    skipped,
    failed,
    chunks: chunks.length,
    posReads,
  };
}

async function main() {
  const suffix = `${Date.now().toString(36)}`;
  const passwordHash = await bcrypt.hash('MigE2e99!', 10);
  const business = await prisma.business.create({
    data: {
      name: `Migration E2E ${suffix}`,
      currency: 'GHS',
      plan: 'STARTER',
      planStatus: 'ACTIVE',
      selectedPlan: 'STARTER',
      subscriptionStatus: 'TRIAL_ACTIVE',
    },
  });
  const user = await prisma.user.create({
    data: {
      businessId: business.id,
      email: `mig.e2e.${suffix}@tillflow-test.invalid`,
      name: 'Migration E2E Owner',
      role: 'OWNER',
      passwordHash,
      active: true,
    },
  });
  const store = await prisma.store.create({
    data: { businessId: business.id, name: 'Main', isMainStore: true },
  });
  await prisma.branch.create({
    data: {
      businessId: business.id,
      storeId: store.id,
      name: 'Main',
      code: 'MAIN',
    },
  });

  let unit = await prisma.unit.findFirst({ where: { name: 'Each' } });
  if (!unit) unit = await prisma.unit.create({ data: { name: 'Each', pluralName: 'Each' } });

  const supplierRows: SupplierRow[] = Array.from({ length: 20 }, (_, i) => ({
    rowNumber: i + 2,
    legacySupplierId: `S${i + 1}`,
    supplierName: `Supplier ${i + 1} ${suffix}`,
    phone: null,
    email: null,
    contactName: null,
    address: null,
  }));

  const catalogueRows: CatalogueRow[] = Array.from({ length: PRODUCT_COUNT }, (_, i) => ({
    rowNumber: i + 2,
    legacyProductId: `P${i + 1}`,
    productName: `Mig Prod ${suffix} ${String(i + 1).padStart(5, '0')}`,
    sku: `SKU-${suffix}-${i + 1}`,
    primaryBarcode: null,
    category: `Cat ${(i % 10) + 1}`,
    unitOfMeasure: 'Each',
    sellingPrice: 100 + (i % 50),
    costPrice: 50 + (i % 20),
    preferredSupplierLegacyId: `S${(i % 20) + 1}`,
    reorderLevel: 0,
    active: true,
    description: null,
  }));

  const openingRows: OpeningStockRow[] = catalogueRows.slice(0, Math.min(500, PRODUCT_COUNT)).map((p, i) => ({
    rowNumber: i + 2,
    legacyProductId: p.legacyProductId,
    branchCode: 'MAIN',
    quantity: (i % 5) + 1,
    unitCost: p.costPrice,
  }));

  const ctx = {
    businessId: business.id,
    userId: user.id,
    storeId: store.id,
    suffix,
  };

  console.log('Importing suppliers...');
  const suppliers = await runTemplate({
    ...ctx,
    kind: 'SUPPLIERS',
    rows: supplierRows,
    toRaw: (row) => ({
      legacySupplierId: row.legacySupplierId,
      supplierName: row.supplierName,
    }),
  });

  console.log('Importing catalogue...');
  const catalogue = await runTemplate({
    ...ctx,
    kind: 'CATALOGUE',
    rows: catalogueRows,
    toRaw: (row) => ({
      legacyProductId: row.legacyProductId,
      productName: row.productName,
      sku: row.sku || '',
      primaryBarcode: '',
      category: row.category,
      unitOfMeasure: row.unitOfMeasure,
      sellingPrice: String(row.sellingPrice),
      costPrice: String(row.costPrice),
      preferredSupplierLegacyId: row.preferredSupplierLegacyId || '',
      reorderLevel: '0',
      active: 'true',
      description: '',
    }),
  });

  console.log('Importing opening stock...');
  const opening = await runTemplate({
    ...ctx,
    kind: 'OPENING_STOCK',
    rows: openingRows,
    toRaw: (row) => ({
      legacyProductId: row.legacyProductId,
      branchCode: row.branchCode,
      quantity: String(row.quantity),
      unitCost: String(row.unitCost ?? ''),
    }),
  });

  const productCount = await prisma.product.count({ where: { businessId: business.id } });
  const mapCount = await prisma.migrationEntityMap.count({
    where: { businessId: business.id, entityType: 'PRODUCT' },
  });
  const stockAgg = await prisma.migrationOpeningStockPosting.aggregate({
    where: { businessId: business.id },
    _sum: { qtyBase: true },
    _count: true,
  });
  const expectedQty = openingRows.reduce((s, r) => s + Math.round(r.quantity), 0);
  const expectedValue = openingRows.reduce(
    (s, r) => s + Math.round(r.quantity) * (r.unitCost && r.unitCost > 0 ? r.unitCost : 0),
    0,
  );
  const balances = await prisma.inventoryBalance.findMany({
    where: { storeId: store.id },
    select: { qtyOnHandBase: true, avgCostBasePence: true },
  });
  const stockQty = balances.reduce((s, b) => s + b.qtyOnHandBase, 0);
  const stockValue = balances.reduce((s, b) => s + b.qtyOnHandBase * b.avgCostBasePence, 0);

  await prisma.migrationBatch.update({
    where: { id: opening.batchId },
    data: {
      reconciliationStatus:
        (stockAgg._sum.qtyBase ?? 0) === expectedQty ? 'MATCHED' : 'MISMATCHED',
      reconciliationJson: JSON.stringify({
        expectedQty,
        actualQty: stockAgg._sum.qtyBase ?? 0,
        expectedValue,
        inventoryValue: stockValue,
        productCount,
      }),
    },
  });

  const sales = await prisma.salesInvoice.count({ where: { businessId: business.id } });
  const shifts = await prisma.shift.count({ where: { user: { businessId: business.id } } });
  const momo = await prisma.mobileMoneyCollection.count({ where: { businessId: business.id } });
  const purchases = await prisma.purchaseInvoice.count({ where: { businessId: business.id } });
  const otherTenantProducts = await prisma.product.count({
    where: { businessId: { not: business.id }, name: { startsWith: `Mig Prod ${suffix}` } },
  });

  // Second opening-stock retry must not raise qty
  const qtyBeforeRetry = stockQty;
  await prisma.$transaction(async (tx) => {
    await commitOpeningStockChunk(tx, {
      businessId: business.id,
      migrationBatchId: opening.batchId,
      sourceSystemKey: 'mig-e2e-preview',
      userId: user.id,
      rows: openingRows.slice(0, 10),
    });
  });
  const qtyAfterRetry = (
    await prisma.inventoryBalance.aggregate({
      where: { storeId: store.id },
      _sum: { qtyOnHandBase: true },
    })
  )._sum.qtyOnHandBase ?? 0;

  const report = {
    at: new Date().toISOString(),
    database: 'tillflow_preview_qa',
    businessId: business.id,
    unitId: unit.id,
    productTarget: PRODUCT_COUNT,
    suppliers,
    catalogue,
    opening,
    reconcile: {
      productCount,
      mapCount,
      postingCount: stockAgg._count,
      postingQty: stockAgg._sum.qtyBase ?? 0,
      expectedQty,
      inventoryQty: stockQty,
      expectedValue,
      inventoryValue: stockValue,
      productsMatch: productCount === PRODUCT_COUNT && mapCount === PRODUCT_COUNT,
      qtyMatch: (stockAgg._sum.qtyBase ?? 0) === expectedQty && stockQty === expectedQty,
      retryQtyUnchanged: qtyAfterRetry === qtyBeforeRetry,
    },
    nonImpact: { sales, shifts, momo, purchases, otherTenantProducts },
    ok:
      productCount === PRODUCT_COUNT &&
      mapCount === PRODUCT_COUNT &&
      (stockAgg._sum.qtyBase ?? 0) === expectedQty &&
      stockQty === expectedQty &&
      qtyAfterRetry === qtyBeforeRetry &&
      sales === 0 &&
      shifts === 0 &&
      momo === 0 &&
      purchases === 0 &&
      otherTenantProducts === 0,
  };

  mkdirSync('tmp', { recursive: true });
  writeFileSync('tmp/migration-preview-workflow-e2e.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await Promise.all([prisma.$disconnect(), readPrisma.$disconnect()]);
  });
