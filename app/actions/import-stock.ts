'use server';

import { prisma } from '@/lib/prisma';
import { revalidateTag } from 'next/cache';
import { withBusinessContext, safeAction, ok, err, type ActionResult } from '@/lib/action-utils';
import { createPurchase } from '@/lib/services/purchases';
import { buildProductUnitCreates } from '@/lib/services/products';
import { audit } from '@/lib/audit';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ConfirmedImportRow = {
  name: string;
  sku: string;
  barcode: string;
  category: string;
  sellingPricePence: number;
  costPricePence: number;
  quantity: number;
  /** Resolved base unit ID (from global Unit table) */
  baseUnitId: string;
  /** Resolved packaging unit ID — null if single-unit product */
  packUnitId: string | null;
  /** How many base units per pack — 0 if no packaging unit */
  packSize: number;
  /** Resolved unit ID the quantity was counted in */
  qtyInUnitId: string;
  paymentStatus: 'PAID' | 'UNPAID';
};

export type ImportStockResult = {
  created: number;
  skipped: number;
  skippedNames: string[];
  /** Number of barcodes that were stripped because they conflicted with an existing product. */
  barcodesCleared: number;
  paidCount: number;
  unpaidCount: number;
  paidValuePence: number;
  unpaidValuePence: number;
  /** Existing products for which opening stock was recorded (had quantity > 0 in the CSV). */
  stockUpdated: number;
  stockUpdatedValuePence: number;
};

// ---------------------------------------------------------------------------
// Action
// ---------------------------------------------------------------------------

export async function importStockAction(
  rows: ConfirmedImportRow[]
): Promise<ActionResult<ImportStockResult>> {
  return safeAction(async () => {
    if (!rows.length) return err('No rows to import.');

    const { user, businessId } = await withBusinessContext(['MANAGER', 'OWNER']);

    const store = await prisma.store.findFirst({
      where: { businessId },
      select: { id: true },
    });
    if (!store) return err('No store found. Complete business setup first.');

    // ── Resolve "new:UnitName" sentinels → create Unit records ──────────
    // The preview UI sets baseUnitId / packUnitId / qtyInUnitId to "new:Name"
    // when the owner chooses to create a previously unknown unit.
    const newUnitNames = new Set<string>();
    for (const row of rows) {
      [row.baseUnitId, row.packUnitId, row.qtyInUnitId].forEach((v) => {
        if (v && v.startsWith('new:')) newUnitNames.add(v.slice(4).trim());
      });
    }

    const createdUnitMap = new Map<string, string>(); // "new:Name" → real id
    for (const unitName of newUnitNames) {
      const u = await prisma.unit.create({
        data: {
          name: unitName,
          pluralName: unitName + 's',
        },
        select: { id: true },
      });
      createdUnitMap.set(`new:${unitName}`, u.id);
    }

    const resolveUnitId = (v: string | null): string | null => {
      if (!v) return null;
      return createdUnitMap.get(v) ?? v;
    };

    // Re-map all rows so real IDs are used downstream
    const resolvedRows: ConfirmedImportRow[] = rows.map((row) => ({
      ...row,
      baseUnitId: resolveUnitId(row.baseUnitId) ?? row.baseUnitId,
      packUnitId: resolveUnitId(row.packUnitId),
      qtyInUnitId: resolveUnitId(row.qtyInUnitId) ?? row.qtyInUnitId,
    }));

    // ── Pre-fetch all categories for this business ──────────────────────
    const existingCategories = await prisma.category.findMany({
      where: { businessId },
      select: { id: true, name: true },
    });
    const categoryMap = new Map(
      existingCategories.map((c) => [c.name.toLowerCase(), c.id])
    );

    // ── Pre-check for duplicate names outside the transaction (read-only) ──
    // Fetch all current product names for this business and filter in-memory
    // (mode:'insensitive' is not supported on all Prisma adapters).
    const existingProductNames = await prisma.product.findMany({
      where: { businessId },
      select: { id: true, name: true },
    });
    const existingNameSet = new Set(existingProductNames.map((p) => p.name.toLowerCase()));
    // Build id map keyed by lowercase — reused in Step 3 so no second round-trip needed.
    const existingNameToIdMap = new Map(
      existingProductNames.map((p) => [p.name.toLowerCase(), p.id])
    );
    const skippedNames: string[] = resolvedRows
      .filter((r) => existingNameSet.has(r.name.toLowerCase()))
      .map((r) => r.name);
    // Also deduplicate within the batch — keep only the first occurrence of
    // each name. A within-batch duplicate would pass the existingNameSet
    // check, then hit a unique-constraint error inside the tx and roll back
    // the entire chunk (or the whole import).
    const seenNamesInBatch = new Set<string>();
    const rowsAfterNameFilter = resolvedRows.filter((r) => {
      const key = r.name.toLowerCase();
      if (existingNameSet.has(key)) return false;
      if (seenNamesInBatch.has(key)) { skippedNames.push(r.name); return false; }
      seenNamesInBatch.add(key);
      return true;
    });

    // ── Pre-check for duplicate barcodes — strip conflicts rather than abort ──
    // A single duplicate barcode would otherwise throw inside the transaction
    // and roll back all 1000+ products. Instead we null out the offending
    // barcode so the product still gets created (can be set manually later).
    const existingBarcodesRaw = await prisma.product.findMany({
      where: { businessId, barcode: { not: null } },
      select: { barcode: true },
    });
    const existingBarcodeSet = new Set(existingBarcodesRaw.map((p) => p.barcode as string));

    // Also deduplicate within the batch itself (two rows with the same barcode).
    const seenBarcodesInBatch = new Set<string>();
    let barcodesCleared = 0;
    const rowsToCreate = rowsAfterNameFilter.map((r) => {
      if (!r.barcode) return r;
      if (existingBarcodeSet.has(r.barcode) || seenBarcodesInBatch.has(r.barcode)) {
        barcodesCleared++;
        return { ...r, barcode: '' }; // strip duplicate; product still created
      }
      seenBarcodesInBatch.add(r.barcode);
      return r;
    });

    // ── Step 1: Pre-create all missing categories outside any transaction ──
    // IDs are stable before product chunks start, so no repeated category
    // creates inside the tx loop.
    const allCategoryNames = [
      ...new Set(rowsToCreate.filter((r) => r.category).map((r) => r.category)),
    ];
    for (const catName of allCategoryNames) {
      const key = catName.toLowerCase();
      if (!categoryMap.has(key)) {
        const newCat = await prisma.category.create({
          data: { businessId, name: catName },
          select: { id: true },
        });
        categoryMap.set(key, newCat.id);
      }
    }

    // Helper shared by Step 2 and the result summary
    const rowToBaseCost = (row: ConfirmedImportRow): number => {
      const isQtyInPackUnit = row.packUnitId !== null && row.qtyInUnitId === row.packUnitId;
      const qtyBase = isQtyInPackUnit ? row.quantity * (row.packSize > 1 ? row.packSize : 1) : row.quantity;
      return Math.round(row.costPricePence * qtyBase);
    };

    const toPurchaseLine = (row: ConfirmedImportRow, productId: string) => {
      const isQtyInPackUnit = row.packUnitId !== null && row.qtyInUnitId === row.packUnitId;
      const qtyBase = isQtyInPackUnit ? row.quantity * (row.packSize > 1 ? row.packSize : 1) : row.quantity;
      return { productId, unitId: row.baseUnitId, qtyInUnit: qtyBase, unitCostPence: row.costPricePence };
    };


    // -- Step 2: Create products in parallel batches of 25 -------------------
    // Sequential creates (1230 x 3 DB round-trips each) take ~110 s and hit
    // Vercel's 60 s limit. Running 25 direct prisma.product.create calls in
    // parallel per batch reduces wall-clock time to ~2 s total.
    // Names and barcodes are pre-validated above so we call prisma.product.create
    // directly -- 1 round-trip per product instead of 3.
    const PARALLEL_BATCH = 25;
    const allCreatedItems: { row: ConfirmedImportRow; productId: string }[] = [];

    for (let i = 0; i < rowsToCreate.length; i += PARALLEL_BATCH) {
      const batch = rowsToCreate.slice(i, i + PARALLEL_BATCH);
      const results = await Promise.allSettled(
        batch.map(async (row) => {
          const categoryId = row.category
            ? (categoryMap.get(row.category.toLowerCase()) ?? null)
            : null;

          const product = await prisma.product.create({
            data: {
              businessId,
              name: row.name,
              sku: row.sku || null,
              barcode: row.barcode || null,
              categoryId,
              sellingPriceBasePence: row.sellingPricePence,
              defaultCostBasePence: row.costPricePence,
              vatRateBps: 0,
              productUnits: {
                create: buildProductUnitCreates(
                  row.baseUnitId,
                  row.packUnitId ?? '',
                  row.packSize > 1 ? row.packSize : 0
                ),
              },
            },
            select: { id: true },
          });

          return { row, productId: product.id };
        })
      );

      results.forEach((result, idx) => {
        if (result.status === 'fulfilled') {
          allCreatedItems.push(result.value);
        } else {
          const row = batch[idx];
          const msg = result.reason instanceof Error ? result.reason.message : String(result.reason);
          console.error(`[import-stock] skipping "${row?.name}": ${msg}`);
          if (row) skippedNames.push(row.name);
        }
      });
    }

    const createdItems = allCreatedItems;

    // -- Step 3: Record opening stock for EXISTING products in the import ----
    // Products already in the catalogue were skipped above (no new record),
    // but the CSV may specify opening quantity + cost for them.
    // IMPORTANT: the unitId in the CSV row (row.baseUnitId) was resolved by
    // the preview UI from the global Unit table by name. But the existing
    // product's productUnit record was created in a prior session with whatever
    // unit ID was current at that time — it should be the same ID but we
    // must use the DB's actual record to avoid "Unit not configured for product".
    // Fetch the actual base productUnit (conversionToBase = 1) for each
    // existing product and use that unit ID in the purchase lines.
    const skippedRowsWithStock = resolvedRows.filter(
      (r) => existingNameSet.has(r.name.toLowerCase()) && r.quantity > 0
    );
    // Build map: productId → actual base unitId from DB
    const existingProductBaseUnitMap = new Map<string, string>();
    const skippedProductIds = skippedRowsWithStock
      .map((r) => existingNameToIdMap.get(r.name.toLowerCase()))
      .filter(Boolean) as string[];
    if (skippedProductIds.length > 0) {
      const existingUnits = await prisma.productUnit.findMany({
        where: {
          productId: { in: [...new Set(skippedProductIds)] },
          conversionToBase: 1,
        },
        select: { productId: true, unitId: true },
      });
      // If multiple units have conversionToBase=1 take the first encountered.
      for (const pu of existingUnits) {
        if (!existingProductBaseUnitMap.has(pu.productId)) {
          existingProductBaseUnitMap.set(pu.productId, pu.unitId);
        }
      }
    }
    const skippedWithStockItems = skippedRowsWithStock
      .map((row) => {
        const productId = existingNameToIdMap.get(row.name.toLowerCase());
        if (!productId) return null;
        // Use the unit the DB actually has for this product, override CSV value.
        const actualBaseUnitId = existingProductBaseUnitMap.get(productId) ?? row.baseUnitId;
        return { row: { ...row, baseUnitId: actualBaseUnitId }, productId };
      })
      .filter(Boolean) as { row: ConfirmedImportRow; productId: string }[];

    // -- Step 4: Create purchase invoices in chunks of 150 lines ----------
    // Products are fully committed -- no shared transaction needed.
    // Chunking avoids an oversized OR query in the DB driver.
    // Both newly-created and existing-with-stock items are included.
    const INVOICE_CHUNK = 150;
    const allItems = [...createdItems, ...skippedWithStockItems];
    const paidItemsAll   = allItems.filter((c) => c.row.paymentStatus === 'PAID');
    const unpaidItemsAll = allItems.filter((c) => c.row.paymentStatus === 'UNPAID');
    const paidLinesAll   = paidItemsAll.filter(({ row }) => row.quantity > 0).map(({ row, productId }) => toPurchaseLine(row, productId));
    const unpaidLinesAll = unpaidItemsAll.filter(({ row }) => row.quantity > 0).map(({ row, productId }) => toPurchaseLine(row, productId));

    for (let i = 0; i < paidLinesAll.length; i += INVOICE_CHUNK) {
      await createPurchase({
        businessId, storeId: store.id, supplierId: null,
        paymentStatus: 'PAID', dueDate: null, payments: [],
        lines: paidLinesAll.slice(i, i + INVOICE_CHUNK), userId: user.id,
      });
    }
    for (let i = 0; i < unpaidLinesAll.length; i += INVOICE_CHUNK) {
      await createPurchase({
        businessId, storeId: store.id, supplierId: null,
        paymentStatus: 'UNPAID', dueDate: null, payments: [],
        lines: unpaidLinesAll.slice(i, i + INVOICE_CHUNK), userId: user.id,
      });
    }

    const paidValuePence   = paidLinesAll.reduce((sum, l) => sum + (l.unitCostPence ?? 0) * l.qtyInUnit, 0);
    const unpaidValuePence = unpaidLinesAll.reduce((sum, l) => sum + (l.unitCostPence ?? 0) * l.qtyInUnit, 0);
    const stockUpdatedValuePence = skippedWithStockItems.reduce(
      (sum, { row }) => sum + rowToBaseCost(row), 0
    );

    audit({
      businessId,
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      action: 'PRODUCT_IMPORT',
      entity: 'Product',
      entityId: businessId,
      details: {
        created: createdItems.length,
        skipped: skippedNames.length,
        stockUpdated: skippedWithStockItems.length,
        paidCount: paidLinesAll.length,
        unpaidCount: unpaidLinesAll.length,
      },
    }).catch((e) => console.error('[audit]', e));

    revalidateTag('pos-products');
    revalidateTag('reports');

    return ok<ImportStockResult>({
      created: createdItems.length,
      skipped: skippedNames.length,
      // Cap the inline name list to avoid oversized action responses on large
      // re-imports where every product already exists (e.g. full 1200-row file
      // re-uploaded). The count is still accurate; the UI shows a truncation note.
      skippedNames: skippedNames.slice(0, 200),
      barcodesCleared,
      paidCount: paidLinesAll.length,
      unpaidCount: unpaidLinesAll.length,
      paidValuePence,
      unpaidValuePence,
      stockUpdated: skippedWithStockItems.length,
      stockUpdatedValuePence,
    });
  });
}
