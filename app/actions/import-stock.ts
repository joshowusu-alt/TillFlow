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

    // ── Process rows: create products, track skips ───────────────────────
    const created: { row: ConfirmedImportRow; productId: string }[] = [];
    const skippedNames: string[] = [];

    for (const row of resolvedRows) {
      // Resolve / upsert category
      let categoryId: string | null = null;
      if (row.category) {
        const key = row.category.toLowerCase();
        if (categoryMap.has(key)) {
          categoryId = categoryMap.get(key)!;
        } else {
          const newCat = await prisma.category.create({
            data: { businessId, name: row.category },
            select: { id: true },
          });
          categoryId = newCat.id;
          categoryMap.set(key, newCat.id);
        }
      }

      try {
        const product = await quickCreateProduct(businessId, {
          name: row.name,
          sku: row.sku || null,
          barcode: row.barcode || null,
          sellingPriceBasePence: row.sellingPricePence,
          defaultCostBasePence: row.costPricePence,
          vatRateBps: 0,
          baseUnitId: row.baseUnitId,
          packagingUnitId: row.packUnitId ?? null,
          packagingConversion: row.packSize > 1 ? row.packSize : null,
        });

        // Attach category if present (quickCreateProduct doesn't accept categoryId)
        if (categoryId) {
          await prisma.product.update({
            where: { id: product.id },
            data: { categoryId },
          });
        }

        created.push({ row, productId: product.id });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        // Duplicate name is expected for existing products — skip gracefully
        if (msg.toLowerCase().includes('already exists')) {
          skippedNames.push(row.name);
        } else {
          // Re-throw unexpected errors so safeAction wraps them
          throw e;
        }
      }
    }

    // ── Split created rows into PAID / UNPAID buckets ────────────────────
    const paidRows = created.filter((c) => c.row.paymentStatus === 'PAID');
    const unpaidRows = created.filter((c) => c.row.paymentStatus === 'UNPAID');

    const toPurchaseLines = (items: typeof created) =>
      items.map(({ row, productId }) => ({
        productId,
        unitId: row.qtyInUnitId,
        qtyInUnit: row.quantity,
        unitCostPence: row.costPricePence,
      }));

    let paidValuePence = 0;
    let unpaidValuePence = 0;

    if (paidRows.length > 0) {
      await createPurchase({
        businessId,
        storeId: store.id,
        supplierId: null,
        paymentStatus: 'PAID',
        dueDate: null,
        payments: [],
        lines: toPurchaseLines(paidRows),
      });
      paidValuePence = paidRows.reduce(
        (sum, { row }) => sum + Math.round(row.costPricePence * row.quantity),
        0
      );
    }

    if (unpaidRows.length > 0) {
      await createPurchase({
        businessId,
        storeId: store.id,
        supplierId: null,
        paymentStatus: 'UNPAID',
        dueDate: null,
        payments: [],
        lines: toPurchaseLines(unpaidRows),
      });
      unpaidValuePence = unpaidRows.reduce(
        (sum, { row }) => sum + Math.round(row.costPricePence * row.quantity),
        0
      );
    }

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
        created: created.length,
        skipped: skippedNames.length,
        paidCount: paidRows.length,
        unpaidCount: unpaidRows.length,
      },
    }).catch((e) => console.error('[audit]', e));

    revalidateTag('pos-products');
    revalidateTag('reports');

    return ok<ImportStockResult>({
      created: created.length,
      skipped: skippedNames.length,
      skippedNames,
      paidCount: paidRows.length,
      unpaidCount: unpaidRows.length,
      paidValuePence,
      unpaidValuePence,
    });
  });
}
