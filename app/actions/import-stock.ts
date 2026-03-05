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

    // ── Single atomic transaction: categories + products + purchase invoices ─
    const createdItems = await prisma.$transaction(
      async (tx) => {
        // Work from a local copy of the category map so new categories
        // created in this tx are visible to later rows in the same tx.
        const txCategoryMap = new Map(categoryMap);
        const items: { row: ConfirmedImportRow; productId: string }[] = [];

        for (const row of rowsToCreate) {
          let categoryId: string | null = null;
          if (row.category) {
            const key = row.category.toLowerCase();
            if (txCategoryMap.has(key)) {
              categoryId = txCategoryMap.get(key)!;
            } else {
              const newCat = await tx.category.create({
                data: { businessId, name: row.category },
                select: { id: true },
              });
              categoryId = newCat.id;
              txCategoryMap.set(key, newCat.id);
            }
          }

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
            await tx.product.update({
              where: { id: product.id },
              data: { categoryId },
            });
          }

          items.push({ row, productId: product.id });
        }

        // Split into PAID / UNPAID buckets
        const paidItems = items.filter((c) => c.row.paymentStatus === 'PAID');
        const unpaidItems = items.filter((c) => c.row.paymentStatus === 'UNPAID');

        // Only include rows with quantity > 0 in the purchase invoice.
        // Zero-qty rows still get a product record created — the owner can
        // add stock later via a manual purchase.
        //
        // IMPORTANT: cost_price in the CSV is always per BASE unit (tin/piece).
        // If the quantity was entered in pack units (e.g. 5 cartons), we must
        // convert to base units before building the purchase line so that
        // createPurchase records the correct total (5 cartons × 12 tins = 60 tins
        // @ GH₴9.50/tin = GH₴570, not GH₴47.50).
        const toPurchaseLines = (list: typeof items) =>
          list
            .filter(({ row }) => row.quantity > 0)
            .map(({ row, productId }) => {
              const isQtyInPackUnit =
                row.packUnitId !== null && row.qtyInUnitId === row.packUnitId;
              const qtyBase = isQtyInPackUnit
                ? row.quantity * (row.packSize > 1 ? row.packSize : 1)
                : row.quantity;
              return {
                productId,
                unitId: row.baseUnitId,   // always base unit
                qtyInUnit: qtyBase,        // total base units
                unitCostPence: row.costPricePence, // cost per base unit (unchanged)
              };
            });

        const paidLines = toPurchaseLines(paidItems);
        const unpaidLines = toPurchaseLines(unpaidItems);

        if (paidLines.length > 0) {
          await createPurchase(
            {
              businessId,
              storeId: store.id,
              supplierId: null,
              paymentStatus: 'PAID',
              dueDate: null,
              payments: [],
              lines: paidLines,
              userId: user.id,
            },
            tx
          );
        }

        if (unpaidLines.length > 0) {
          await createPurchase(
            {
              businessId,
              storeId: store.id,
              supplierId: null,
              paymentStatus: 'UNPAID',
              dueDate: null,
              payments: [],
              lines: unpaidLines,
              userId: user.id,
            },
            tx
          );
        }

        return items;
      },
      { timeout: 30000, maxWait: 5000 }
    );

    const paidRows = createdItems.filter((c) => c.row.paymentStatus === 'PAID');
    const unpaidRows = createdItems.filter((c) => c.row.paymentStatus === 'UNPAID');

    // Apply the same base-unit conversion used in toPurchaseLines so the
    // result summary matches what was actually recorded on the invoice.
    const rowCostPence = (row: ConfirmedImportRow): number => {
      const isQtyInPackUnit =
        row.packUnitId !== null && row.qtyInUnitId === row.packUnitId;
      const qtyBase = isQtyInPackUnit
        ? row.quantity * (row.packSize > 1 ? row.packSize : 1)
        : row.quantity;
      return Math.round(row.costPricePence * qtyBase);
    };

    const paidValuePence = paidRows.reduce(
      (sum, { row }) => sum + rowCostPence(row),
      0
    );
    const unpaidValuePence = unpaidRows.reduce(
      (sum, { row }) => sum + rowCostPence(row),
      0
    );

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
