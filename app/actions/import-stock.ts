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
    const rowsToCreate = resolvedRows.filter(
      (r) => !existingNameSet.has(r.name.toLowerCase())
    );

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

        const toPurchaseLines = (list: typeof items) =>
          list.map(({ row, productId }) => ({
            productId,
            unitId: row.qtyInUnitId,
            qtyInUnit: row.quantity,
            unitCostPence: row.costPricePence,
          }));

        if (paidItems.length > 0) {
          await createPurchase(
            {
              businessId,
              storeId: store.id,
              supplierId: null,
              paymentStatus: 'PAID',
              dueDate: null,
              payments: [],
              lines: toPurchaseLines(paidItems),
              userId: user.id,
            },
            tx
          );
        }

        if (unpaidItems.length > 0) {
          await createPurchase(
            {
              businessId,
              storeId: store.id,
              supplierId: null,
              paymentStatus: 'UNPAID',
              dueDate: null,
              payments: [],
              lines: toPurchaseLines(unpaidItems),
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
    const paidValuePence = paidRows.reduce(
      (sum, { row }) => sum + Math.round(row.costPricePence * row.quantity),
      0
    );
    const unpaidValuePence = unpaidRows.reduce(
      (sum, { row }) => sum + Math.round(row.costPricePence * row.quantity),
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
      paidCount: paidRows.length,
      unpaidCount: unpaidRows.length,
      paidValuePence,
      unpaidValuePence,
    });
  });
}
