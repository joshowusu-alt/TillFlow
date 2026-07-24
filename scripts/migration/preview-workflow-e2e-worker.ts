/**
 * Worker: synthetic migration workflow against Preview Postgres (Prisma client).
 */
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import {
  approveMigrationBatch,
  createMigrationBatch,
  finalizeMigrationImport,
  finalizeMigrationValidation,
  importMigrationChunk,
  runMigrationReconciliation,
  validateMigrationChunk,
} from '../../lib/migration/batch-service';
import type { CatalogueRow, OpeningStockRow, SupplierRow } from '../../lib/migration/types';

const url = process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL;
if (!url || new URL(url).pathname !== '/tillflow_preview_qa') {
  throw new Error('Refusing non-preview database');
}

const PRODUCT_COUNT = Number(process.env.MIGRATION_E2E_PRODUCTS || 2500);
const CHUNK = Number(process.env.MIGRATION_E2E_CHUNK || 200);
const prisma = new PrismaClient({ datasources: { db: { url } }, log: ['error'] });

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
      prisma.product.count({ where: { businessId, active: true } }),
      prisma.product.findMany({
        where: { businessId, active: true },
        take: 50,
        orderBy: { name: 'asc' },
        select: { id: true, name: true, sellingPriceBasePence: true },
      }),
      prisma.inventoryBalance.findMany({
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
  }).catch(async () => {
    // Branch model fields may vary — ensure store exists for branchCode resolve via store name
  });

  let unit = await prisma.unit.findFirst({ where: { name: 'Each' } });
  if (!unit) {
    unit = await prisma.unit.create({ data: { name: 'Each', pluralName: 'Each' } });
  }

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

  const actor = {
    businessId: business.id,
    userId: user.id,
    userName: user.name,
    userRole: 'OWNER',
  };

  async function runTemplate<T extends { rowNumber: number }>(
    kind: 'SUPPLIERS' | 'CATALOGUE' | 'OPENING_STOCK',
    rows: T[],
    toRaw: (row: T) => Record<string, string>,
  ) {
    const csv = `placeholder\n${rows.length}`;
    const fileChecksum = sha(`${kind}:${suffix}:${rows.length}:${csv}`);
    const chunks = chunkArray(rows, CHUNK);
    const batch = await createMigrationBatch({
      ...actor,
      templateKind: kind,
      clientBatchKey: `${kind.toLowerCase()}-${suffix}`,
      sourceSystemKey: 'mig-e2e-preview',
      sourceSystemLabel: 'Preview E2E',
      fileName: `${kind.toLowerCase()}-${suffix}.csv`,
      fileContent: `${kind}:${suffix}:${rows.length}`,
      chunksTotal: chunks.length,
      chunkSize: CHUNK,
      expectedRows: rows.length,
    });

    // Force checksum alignment — createMigrationBatch hashes fileContent
    const checksum = batch.fileChecksum;

    for (let i = 0; i < chunks.length; i++) {
      const rawRows = chunks[i]!.map((row) => ({
        rowNumber: row.rowNumber,
        raw: toRaw(row),
      }));
      await validateMigrationChunk({
        businessId: business.id,
        batchId: batch.id,
        chunkIndex: i,
        fileChecksum: checksum,
        rows: rawRows,
      });
    }
    await finalizeMigrationValidation({
      businessId: business.id,
      batchId: batch.id,
      fileChecksum: checksum,
    });
    await approveMigrationBatch({
      ...actor,
      batchId: batch.id,
      fileChecksum: checksum,
    });

    // Concurrent POS reads during import
    const readPromise = concurrentPosReads(business.id, 8);

    for (let i = 0; i < chunks.length; i++) {
      await importMigrationChunk({
        businessId: business.id,
        userId: user.id,
        batchId: batch.id,
        chunkIndex: i,
        fileChecksum: checksum,
        rows: chunks[i] as any,
      });

      // Retry same chunk — must be duplicate / no double effect
      const retry = await importMigrationChunk({
        businessId: business.id,
        userId: user.id,
        batchId: batch.id,
        chunkIndex: i,
        fileChecksum: checksum,
        rows: chunks[i] as any,
      });
      if (!(retry as any).duplicate) {
        throw new Error(`${kind} chunk ${i} retry did not report duplicate`);
      }
    }

    const posReads = await readPromise;
    const finalized = await finalizeMigrationImport({
      ...actor,
      batchId: batch.id,
      fileChecksum: checksum,
    });

    return { batchId: batch.id, status: finalized.status, checksum, posReads, chunks: chunks.length };
  }

  const suppliers = await runTemplate('SUPPLIERS', supplierRows, (row) => ({
    legacySupplierId: row.legacySupplierId,
    supplierName: row.supplierName,
  }));

  const catalogue = await runTemplate('CATALOGUE', catalogueRows, (row) => ({
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
  }));

  const opening = await runTemplate('OPENING_STOCK', openingRows, (row) => ({
    legacyProductId: row.legacyProductId,
    branchCode: row.branchCode,
    quantity: String(row.quantity),
    unitCost: String(row.unitCost ?? ''),
  }));

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

  // Inventory value approx from balances
  const balances = await prisma.inventoryBalance.findMany({
    where: { storeId: store.id },
    select: { qtyOnHandBase: true, avgCostBasePence: true },
  });
  const stockQty = balances.reduce((s, b) => s + b.qtyOnHandBase, 0);
  const stockValue = balances.reduce((s, b) => s + b.qtyOnHandBase * b.avgCostBasePence, 0);

  await runMigrationReconciliation({
    ...actor,
    batchId: opening.batchId,
    expected: {
      templateKind: 'OPENING_STOCK',
      rowsValid: openingRows.length,
      distinctLegacyProductIds: openingRows.length,
      distinctBranchCodes: 1,
      totalQuantity: expectedQty,
      valuedLines: openingRows.length,
      unvaluedLines: 0,
      totalStockValue: expectedValue,
    },
  });

  const sales = await prisma.salesInvoice.count({ where: { businessId: business.id } });
  const shifts = await prisma.shift.count({ where: { businessId: business.id } });
  const momo = await prisma.mobileMoneyCollection.count({ where: { businessId: business.id } });
  const purchases = await prisma.purchaseInvoice.count({ where: { businessId: business.id } });
  const otherTenantProducts = await prisma.product.count({
    where: { businessId: { not: business.id }, name: { startsWith: `Mig Prod ${suffix}` } },
  });

  const report = {
    at: new Date().toISOString(),
    database: 'tillflow_preview_qa',
    businessId: business.id,
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
    },
    nonImpact: { sales, shifts, momo, purchases, otherTenantProducts },
    ok:
      productCount === PRODUCT_COUNT &&
      mapCount === PRODUCT_COUNT &&
      (stockAgg._sum.qtyBase ?? 0) === expectedQty &&
      stockQty === expectedQty &&
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
    await prisma.$disconnect();
  });
