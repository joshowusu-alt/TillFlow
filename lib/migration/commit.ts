/**
 * Phase 1 commit paths — catalogue, suppliers, branch opening stock.
 * Callers must wrap IMPORT chunk work + MigrationChunkReceipt.create in one transaction.
 */

import { suggestImportCategoryName } from '@/lib/import/category-import';
import { recordOpeningInventory } from '@/lib/services/opening-inventory';
import { ensureChartOfAccounts } from '@/lib/accounting';
import type { CatalogueRow, OpeningStockRow, SupplierRow } from '@/lib/migration/types';

type Tx = any;

export type CommitChunkResult = {
  imported: number;
  skipped: number;
  failed: number;
  exceptions: Array<{ rowNumber: number; code: string; message: string }>;
};

async function upsertEntityMap(
  tx: Tx,
  input: {
    businessId: string;
    migrationBatchId: string;
    sourceSystemKey: string;
    entityType: 'PRODUCT' | 'SUPPLIER' | 'CATEGORY';
    sourceReference: string;
    targetId: string;
  },
) {
  await tx.migrationEntityMap.upsert({
    where: {
      businessId_sourceSystemKey_entityType_sourceReference: {
        businessId: input.businessId,
        sourceSystemKey: input.sourceSystemKey,
        entityType: input.entityType,
        sourceReference: input.sourceReference,
      },
    },
    create: {
      businessId: input.businessId,
      migrationBatchId: input.migrationBatchId,
      sourceSystemKey: input.sourceSystemKey,
      entityType: input.entityType,
      sourceReference: input.sourceReference,
      targetId: input.targetId,
    },
    update: {
      targetId: input.targetId,
      migrationBatchId: input.migrationBatchId,
    },
  });
}

async function resolveUnitId(tx: Tx, unitName: string): Promise<string> {
  const trimmed = unitName.trim();
  const all = await tx.unit.findMany({ select: { id: true, name: true } });
  const hit = all.find((u: { name: string }) => u.name.toLowerCase() === trimmed.toLowerCase());
  if (hit) return hit.id;
  const created = await tx.unit.create({
    data: { name: trimmed, pluralName: trimmed.endsWith('s') ? trimmed : `${trimmed}s` },
    select: { id: true },
  });
  return created.id;
}

function supplierNotes(row: SupplierRow): string | null {
  const parts: string[] = [];
  if (row.contactName) parts.push(`Contact: ${row.contactName}`);
  if (row.address) parts.push(`Address: ${row.address}`);
  return parts.length ? parts.join('\n') : null;
}

export async function commitSupplierChunk(
  tx: Tx,
  input: {
    businessId: string;
    migrationBatchId: string;
    sourceSystemKey: string;
    rows: SupplierRow[];
  },
): Promise<CommitChunkResult> {
  let imported = 0;
  let skipped = 0;
  let failed = 0;
  const exceptions: CommitChunkResult['exceptions'] = [];

  for (const row of input.rows) {
    try {
      const existingMap = await tx.migrationEntityMap.findUnique({
        where: {
          businessId_sourceSystemKey_entityType_sourceReference: {
            businessId: input.businessId,
            sourceSystemKey: input.sourceSystemKey,
            entityType: 'SUPPLIER',
            sourceReference: row.legacySupplierId,
          },
        },
      });
      if (existingMap) {
        const target = await tx.supplier.findFirst({
          where: { id: existingMap.targetId, businessId: input.businessId },
          select: { id: true },
        });
        if (!target) {
          failed += 1;
          exceptions.push({
            rowNumber: row.rowNumber,
            code: 'MAPPED_TARGET_MISSING',
            message: 'Mapped supplier was deleted — re-map required; row not auto-recreated.',
          });
          continue;
        }
        await tx.supplier.update({
          where: { id: existingMap.targetId },
          data: {
            name: row.supplierName,
            phone: row.phone || null,
            email: row.email || null,
            notes: supplierNotes(row),
          },
        });
        skipped += 1;
        continue;
      }

      const created = await tx.supplier.create({
        data: {
          businessId: input.businessId,
          name: row.supplierName,
          phone: row.phone || null,
          email: row.email || null,
          notes: supplierNotes(row),
        },
        select: { id: true },
      });
      await upsertEntityMap(tx, {
        businessId: input.businessId,
        migrationBatchId: input.migrationBatchId,
        sourceSystemKey: input.sourceSystemKey,
        entityType: 'SUPPLIER',
        sourceReference: row.legacySupplierId,
        targetId: created.id,
      });
      imported += 1;
    } catch (e) {
      failed += 1;
      exceptions.push({
        rowNumber: row.rowNumber,
        code: 'SUPPLIER_COMMIT_FAILED',
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return { imported, skipped, failed, exceptions };
}

export async function commitCatalogueChunk(
  tx: Tx,
  input: {
    businessId: string;
    migrationBatchId: string;
    sourceSystemKey: string;
    rows: CatalogueRow[];
  },
): Promise<CommitChunkResult> {
  let imported = 0;
  let skipped = 0;
  let failed = 0;
  const exceptions: CommitChunkResult['exceptions'] = [];

  for (const row of input.rows) {
    try {
      const existingMap = await tx.migrationEntityMap.findUnique({
        where: {
          businessId_sourceSystemKey_entityType_sourceReference: {
            businessId: input.businessId,
            sourceSystemKey: input.sourceSystemKey,
            entityType: 'PRODUCT',
            sourceReference: row.legacyProductId,
          },
        },
      });
      if (existingMap) {
        const target = await tx.product.findFirst({
          where: { id: existingMap.targetId, businessId: input.businessId },
          select: { id: true },
        });
        if (!target) {
          failed += 1;
          exceptions.push({
            rowNumber: row.rowNumber,
            code: 'MAPPED_TARGET_MISSING',
            message: 'Mapped product was deleted — re-map required; row not auto-recreated.',
          });
          continue;
        }
        skipped += 1;
        continue;
      }

      let categoryId: string | null = null;
      if (row.category.trim()) {
        const catName = suggestImportCategoryName(row.category) || row.category.trim();
        const existingCatMap = await tx.migrationEntityMap.findUnique({
          where: {
            businessId_sourceSystemKey_entityType_sourceReference: {
              businessId: input.businessId,
              sourceSystemKey: input.sourceSystemKey,
              entityType: 'CATEGORY',
              sourceReference: catName,
            },
          },
        });
        if (existingCatMap) {
          categoryId = existingCatMap.targetId;
        } else {
          const existingCat = await tx.category.findFirst({
            where: { businessId: input.businessId, name: catName },
            select: { id: true },
          });
          categoryId =
            existingCat?.id ??
            (
              await tx.category.create({
                data: { businessId: input.businessId, name: catName },
                select: { id: true },
              })
            ).id;
          await upsertEntityMap(tx, {
            businessId: input.businessId,
            migrationBatchId: input.migrationBatchId,
            sourceSystemKey: input.sourceSystemKey,
            entityType: 'CATEGORY',
            sourceReference: catName,
            targetId: categoryId!,
          });
        }
      }

      let preferredSupplierId: string | null = null;
      if (row.preferredSupplierLegacyId) {
        const supplierMap = await tx.migrationEntityMap.findUnique({
          where: {
            businessId_sourceSystemKey_entityType_sourceReference: {
              businessId: input.businessId,
              sourceSystemKey: input.sourceSystemKey,
              entityType: 'SUPPLIER',
              sourceReference: row.preferredSupplierLegacyId,
            },
          },
        });
        if (!supplierMap) {
          failed += 1;
          exceptions.push({
            rowNumber: row.rowNumber,
            code: 'UNKNOWN_PREFERRED_SUPPLIER',
            message: `preferredSupplierLegacyId "${row.preferredSupplierLegacyId}" is not mapped in this source namespace.`,
          });
          continue;
        }
        const supplierOk = await tx.supplier.findFirst({
          where: { id: supplierMap.targetId, businessId: input.businessId },
          select: { id: true },
        });
        if (!supplierOk) {
          failed += 1;
          exceptions.push({
            rowNumber: row.rowNumber,
            code: 'MAPPED_TARGET_MISSING',
            message: 'Preferred supplier mapping points to a deleted supplier.',
          });
          continue;
        }
        preferredSupplierId = supplierMap.targetId;
      }

      let barcode: string | null = row.primaryBarcode || null;
      if (barcode) {
        const conflict = await tx.product.findFirst({
          where: { barcode },
          select: { id: true },
        });
        if (conflict) {
          failed += 1;
          exceptions.push({
            rowNumber: row.rowNumber,
            code: 'BARCODE_CONFLICT',
            message: 'primaryBarcode already exists — row not imported.',
          });
          continue;
        }
      }

      const nameConflict = await tx.product.findFirst({
        where: { businessId: input.businessId, name: row.productName },
        select: { id: true },
      });
      if (nameConflict) {
        await upsertEntityMap(tx, {
          businessId: input.businessId,
          migrationBatchId: input.migrationBatchId,
          sourceSystemKey: input.sourceSystemKey,
          entityType: 'PRODUCT',
          sourceReference: row.legacyProductId,
          targetId: nameConflict.id,
        });
        skipped += 1;
        continue;
      }

      const unitId = await resolveUnitId(tx, row.unitOfMeasure);
      const created = await tx.product.create({
        data: {
          businessId: input.businessId,
          name: row.productName,
          sku: row.sku || null,
          barcode,
          categoryId,
          sellingPriceBasePence: row.sellingPrice,
          defaultCostBasePence: row.costPrice,
          active: row.active,
          reorderPointBase: row.reorderLevel,
          preferredSupplierId,
          storefrontDescription: row.description || null,
          productUnits: {
            create: [{ unitId, isBaseUnit: true, conversionToBase: 1 }],
          },
        },
        select: { id: true },
      });

      await upsertEntityMap(tx, {
        businessId: input.businessId,
        migrationBatchId: input.migrationBatchId,
        sourceSystemKey: input.sourceSystemKey,
        entityType: 'PRODUCT',
        sourceReference: row.legacyProductId,
        targetId: created.id,
      });
      imported += 1;
    } catch (e) {
      failed += 1;
      exceptions.push({
        rowNumber: row.rowNumber,
        code: 'PRODUCT_COMMIT_FAILED',
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return { imported, skipped, failed, exceptions };
}

export async function resolveBranchStoreId(
  tx: Tx,
  businessId: string,
  branchCode: string,
): Promise<string | null> {
  const code = branchCode.trim();
  const branch = await tx.branch.findFirst({
    where: {
      businessId,
      OR: [{ code: code }, { name: code }],
    },
    select: { storeId: true },
  });
  if (branch) return branch.storeId;

  const store = await tx.store.findFirst({
    where: { businessId, name: code },
    select: { id: true },
  });
  return store?.id ?? null;
}

export async function commitOpeningStockChunk(
  tx: Tx,
  input: {
    businessId: string;
    migrationBatchId: string;
    sourceSystemKey: string;
    userId: string;
    rows: OpeningStockRow[];
  },
): Promise<CommitChunkResult> {
  let imported = 0;
  let skipped = 0;
  let failed = 0;
  const exceptions: CommitChunkResult['exceptions'] = [];

  await ensureChartOfAccounts(input.businessId);

  for (const row of input.rows) {
    if (row.quantity <= 0) {
      skipped += 1;
      continue;
    }

    try {
      const productMap = await tx.migrationEntityMap.findUnique({
        where: {
          businessId_sourceSystemKey_entityType_sourceReference: {
            businessId: input.businessId,
            sourceSystemKey: input.sourceSystemKey,
            entityType: 'PRODUCT',
            sourceReference: row.legacyProductId,
          },
        },
      });
      if (!productMap) {
        failed += 1;
        exceptions.push({
          rowNumber: row.rowNumber,
          code: 'UNKNOWN_PRODUCT',
          message: `legacyProductId "${row.legacyProductId}" is not mapped in this source namespace.`,
        });
        continue;
      }

      const product = await tx.product.findFirst({
        where: { id: productMap.targetId, businessId: input.businessId },
        select: { id: true },
      });
      if (!product) {
        failed += 1;
        exceptions.push({
          rowNumber: row.rowNumber,
          code: 'MAPPED_TARGET_MISSING',
          message: 'Mapped product missing or not in this business.',
        });
        continue;
      }

      const storeId = await resolveBranchStoreId(tx, input.businessId, row.branchCode);
      if (!storeId) {
        failed += 1;
        exceptions.push({
          rowNumber: row.rowNumber,
          code: 'UNKNOWN_BRANCH',
          message: `branchCode "${row.branchCode}" does not match a branch/store in this business.`,
        });
        continue;
      }

      const storeOk = await tx.store.findFirst({
        where: { id: storeId, businessId: input.businessId },
        select: { id: true },
      });
      if (!storeOk) {
        failed += 1;
        exceptions.push({
          rowNumber: row.rowNumber,
          code: 'CROSS_TENANT_BRANCH',
          message: 'Resolved store is not in this business.',
        });
        continue;
      }

      const baseUnit = await tx.productUnit.findFirst({
        where: { productId: product.id, conversionToBase: 1 },
        select: { unitId: true },
      });
      if (!baseUnit) {
        failed += 1;
        exceptions.push({
          rowNumber: row.rowNumber,
          code: 'MISSING_BASE_UNIT',
          message: 'Product has no base unit configured.',
        });
        continue;
      }

      const referenceId = `mig-open:${input.migrationBatchId}:${storeId}:${product.id}`;

      // Durable row claim — unique constraint prevents double stock on retry/concurrency.
      try {
        await tx.migrationOpeningStockPosting.create({
          data: {
            businessId: input.businessId,
            migrationBatchId: input.migrationBatchId,
            sourceSystemKey: input.sourceSystemKey,
            sourceReference: row.legacyProductId,
            storeId,
            productId: product.id,
            referenceId,
            qtyBase: Math.round(row.quantity),
            unitCostBasePence: row.unitCost && row.unitCost > 0 ? row.unitCost : null,
          },
        });
      } catch (claimErr) {
        const msg = claimErr instanceof Error ? claimErr.message : String(claimErr);
        if (/Unique constraint|P2002/i.test(msg)) {
          skipped += 1; // already posted for this batch/store/product
          continue;
        }
        throw claimErr;
      }

      const result = await recordOpeningInventory({
        businessId: input.businessId,
        storeId,
        userId: input.userId,
        referenceId,
        description: `Migration opening stock ${input.migrationBatchId}`,
        prismaClient: tx,
        lines: [
          {
            productId: product.id,
            unitId: baseUnit.unitId,
            qtyInUnit: row.quantity,
            unitCostBasePence: row.unitCost && row.unitCost > 0 ? row.unitCost : 0,
          },
        ],
      });

      if (result.alreadyPosted) skipped += 1;
      else imported += 1;
    } catch (e) {
      failed += 1;
      exceptions.push({
        rowNumber: row.rowNumber,
        code: 'OPENING_STOCK_COMMIT_FAILED',
        message: e instanceof Error ? e.message : String(e),
      });
      // Re-throw so the outer chunk transaction rolls back (no receipt without consistent state).
      throw e;
    }
  }

  // Row-level failures that did not throw still allow the chunk to complete with exceptions,
  // but any thrown error aborts the whole chunk TX (no orphan stock / no false receipt).
  if (failed > 0 && imported === 0 && skipped === 0) {
    throw new Error(`Opening-stock chunk failed for all rows (${failed} errors).`);
  }

  return { imported, skipped, failed, exceptions };
}
