'use server';

import { prisma } from '@/lib/prisma';
import { revalidateTag } from 'next/cache';
import { withBusinessContext, safeAction, ok, err, type ActionResult } from '@/lib/action-utils';
import { createPurchase } from '@/lib/services/purchases';
import { quickCreateProduct } from '@/lib/services/products';
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
      select: { name: true },
    });
    const existingNameSet = new Set(existingProductNames.map((p) => p.name.toLowerCase()));
    const skippedNames = resolvedRows
      .filter((r) => existingNameSet.has(r.name.toLowerCase()))
      .map((r) => r.name);
    const rowsAfterNameFilter = resolvedRows.filter(
      (r) => !existingNameSet.has(r.name.toLowerCase())
    );

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

    // ── Step 2: Create products in chunks of 100 ─────────────────────────
    // One 30 s transaction per chunk avoids the server-function timeout that
    // kills a single transaction covering 1 200+ products.
    const PRODUCT_CHUNK = 100;
    const allCreatedItems: { row: ConfirmedImportRow; productId: string }[] = [];

    for (let i = 0; i < rowsToCreate.length; i += PRODUCT_CHUNK) {
      const chunk = rowsToCreate.slice(i, i + PRODUCT_CHUNK);
      const chunkItems = await prisma.$transaction(
        async (tx) => {
          const items: { row: ConfirmedImportRow; productId: string }[] = [];
          for (const row of chunk) {
            const categoryId = row.category
              ? (categoryMap.get(row.category.toLowerCase()) ?? null)
              : null;

            const product = await quickCreateProduct(
              businessId,
              {
                name: row.name,
                sku: row.sku || null,
                barcode: row.barcode || null,
                sellingPriceBasePence: row.sellingPricePence,
                defaultCostBasePence: row.costPricePence,
                vatRateBps: 0,
                baseUnitId: row.baseUnitId,
                packagingUnitId: row.packUnitId ?? null,
                packagingConversion: row.packSize > 1 ? row.packSize : null,
              },
              tx
            );

            if (categoryId) {
              await tx.product.update({ where: { id: product.id }, data: { categoryId } });
            }

            items.push({ row, productId: product.id });
          }
          return items;
        },
        { timeout: 30000, maxWait: 5000 }
      );
      allCreatedItems.push(...chunkItems);
    }

    const createdItems = allCreatedItems;

    // ── Step 3: Create purchase invoices in chunks of 150 lines ──────────
    // Products are fully committed — no shared transaction needed.
    // Chunking avoids an oversized OR query in the DB driver.
    const INVOICE_CHUNK = 150;
    const paidItemsAll   = createdItems.filter((c) => c.row.paymentStatus === 'PAID');
    const unpaidItemsAll = createdItems.filter((c) => c.row.paymentStatus === 'UNPAID');
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

    const paidRows   = paidItemsAll;
    const unpaidRows = unpaidItemsAll;
    const paidValuePence   = paidRows.reduce((sum, { row }) => sum + rowToBaseCost(row), 0);
    const unpaidValuePence = unpaidRows.reduce((sum, { row }) => sum + rowToBaseCost(row), 0);

    // ── Audit + cache invalidation ────────────────────────────────────────
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
        paidCount: paidRows.length,
        unpaidCount: unpaidRows.length,
      },
    }).catch((e) => console.error('[audit]', e));

    revalidateTag('pos-products');
    revalidateTag('reports');

    return ok<ImportStockResult>({
      created: createdItems.length,
      skipped: skippedNames.length,
      skippedNames,
      barcodesCleared,
      paidCount: paidRows.length,
      unpaidCount: unpaidRows.length,
      paidValuePence,
      unpaidValuePence,
    });
  });
}
