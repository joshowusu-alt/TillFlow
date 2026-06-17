'use server';

import { prisma } from '@/lib/prisma';
import { revalidateTag } from 'next/cache';
import { withBusinessContext, safeAction, ok, err, type ActionResult } from '@/lib/action-utils';
import { createPurchase } from '@/lib/services/purchases';
import type { SupplierProductLinkSummary, SupplierProductLinkSkippedProduct } from '@/lib/services/purchases';
import { buildProductUnitCreates } from '@/lib/services/products';
import { ensureChartOfAccounts } from '@/lib/accounting';
import { audit } from '@/lib/audit';
import { suggestImportCategoryName } from '@/lib/import/category-import';
import type { DuplicateAction } from '@/lib/import/import-validation';

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
  baseUnitId: string;
  packUnitId: string | null;
  packSize: number;
  qtyInUnitId: string;
  paymentStatus: 'PAID' | 'UNPAID';
  duplicateAction?: DuplicateAction;
  supplierName?: string;
  reorderPointBase?: number;
  storefrontPublished?: boolean;
  imageUrl?: string;
  notes?: string;
  confirmBelowCost?: boolean;
};

export type ImportStockMeta = {
  fileName?: string;
  rowsParsed?: number;
  rowsErrors?: number;
  rowsWarnings?: number;
  errorReportJson?: string;
};

export type ImportSupplierLinkSupplierSummary = {
  supplierId: string;
  supplierName: string;
  linkedCount: number;
  alreadyLinkedCount: number;
  skippedDifferentSupplierCount: number;
};

export type ImportSupplierLinkSummary = {
  linkedCount: number;
  alreadyLinkedCount: number;
  skippedDifferentSupplierCount: number;
  skippedProducts: SupplierProductLinkSkippedProduct[];
  supplierSummaries: ImportSupplierLinkSupplierSummary[];
};

export type ImportStockResult = {
  importId: string | null;
  created: number;
  updated: number;
  skipped: number;
  skippedNames: string[];
  barcodesCleared: number;
  paidCount: number;
  unpaidCount: number;
  paidValuePence: number;
  unpaidValuePence: number;
  stockUpdated: number;
  stockUpdatedValuePence: number;
  openingStockUnits: number;
  suppliersMatched: number;
  suppliersCreated: number;
  categoriesCreated: number;
  warningsAcknowledged: number;
  supplierLinkSummary: ImportSupplierLinkSummary;
};

function emptyImportSupplierLinkSummary(): ImportSupplierLinkSummary {
  return {
    linkedCount: 0,
    alreadyLinkedCount: 0,
    skippedDifferentSupplierCount: 0,
    skippedProducts: [],
    supplierSummaries: [],
  };
}

// ---------------------------------------------------------------------------
// Action
// ---------------------------------------------------------------------------

export async function importStockAction(
  rows: ConfirmedImportRow[],
  meta?: ImportStockMeta
): Promise<ActionResult<ImportStockResult>> {
  // ── Outermost safety net ────────────────────────────────────────────────
  // This try/catch guarantees the function ALWAYS returns an ActionResult
  // and NEVER lets anything (redirect errors, runtime errors, Prisma panics)
  // escape unhandled. When a redirect/error escapes a Next.js 14 server action
  // the client-side await resolves to `undefined` — causing the crash.
  try {
    return await _runImport(rows, meta);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[importStockAction] unhandled top-level error:', e);
    return err(`Import failed: ${msg}`);
  }
}

async function resolveSupplierId(
  businessId: string,
  supplierName: string | undefined,
  supplierMap: Map<string, string>,
  stats: { matched: number; created: number }
) {
  const trimmed = (supplierName ?? '').trim();
  if (!trimmed) return null;
  const key = trimmed.toLowerCase();
  const existing = supplierMap.get(key);
  if (existing) {
    stats.matched++;
    return existing;
  }
  const created = await prisma.supplier.create({
    data: { businessId, name: trimmed },
    select: { id: true },
  });
  supplierMap.set(key, created.id);
  stats.created++;
  return created.id;
}

async function _runImport(
  rows: ConfirmedImportRow[],
  meta?: ImportStockMeta
): Promise<ActionResult<ImportStockResult>> {
  // Auth resolved OUTSIDE safeAction so a redirect() from withBusinessContext
  // is caught here and converted to a typed err() instead of escaping.
  let authContext: Awaited<ReturnType<typeof withBusinessContext>>;
  try {
    authContext = await withBusinessContext(['MANAGER', 'OWNER']);
  } catch (_authErr) {
    // Any failure here (redirect, role error, DB error) = session/auth problem.
    console.error('[importStockAction] auth error:', _authErr);
    return err('Your session has expired. Please refresh the page and sign in again.');
  }

  return safeAction(async () => {
    if (!rows.length) return err('No rows to import.');

    const { user, businessId } = authContext;

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
    const skippedNames: string[] = [];
    const rowsForCreate: ConfirmedImportRow[] = [];
    const rowsForUpdate: Array<{ row: ConfirmedImportRow; productId: string }> = [];
    const seenNamesInBatch = new Set<string>();

    for (const row of resolvedRows) {
      const key = row.name.toLowerCase();
      const existingId = existingNameToIdMap.get(key);
      const action: DuplicateAction = row.duplicateAction ?? (existingId ? 'skip' : 'create');

      if (seenNamesInBatch.has(key) && !existingId) {
        skippedNames.push(row.name);
        continue;
      }
      seenNamesInBatch.add(key);

      if (action === 'update' && existingId) {
        rowsForUpdate.push({ row, productId: existingId });
        continue;
      }

      if (existingId || action === 'skip') {
        if (existingId && row.quantity > 0) {
          // handled in skippedWithStock below
        } else {
          skippedNames.push(row.name);
        }
        continue;
      }

      rowsForCreate.push(row);
    }

    const rowsAfterNameFilter = rowsForCreate;

    // ── Pre-check for duplicate barcodes — strip conflicts rather than abort ──
    // A single duplicate barcode would otherwise throw inside the transaction
    // and roll back all 1000+ products. Instead we null out the offending
    // barcode so the product still gets created (can be set manually later).
    // IMPORTANT: barcode has a GLOBAL @unique constraint (not scoped to businessId).
    // Must query ALL businesses — not just { businessId } — or a cross-business
    // collision still causes a P2002 that kills the entire createMany batch.
    const existingBarcodesRaw = await prisma.product.findMany({
      where: { barcode: { not: null } },
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
    const supplierMap = new Map(
      (
        await prisma.supplier.findMany({
          where: { businessId },
          select: { id: true, name: true },
        })
      ).map((s) => [s.name.toLowerCase(), s.id])
    );
    const supplierStats = { matched: 0, created: 0 };
    const supplierIdByName = new Map<string, string | null>();
    const resolveSupplierIdForRow = async (row: ConfirmedImportRow) => {
      const key = (row.supplierName ?? '').trim().toLowerCase();
      if (!key) return null;
      if (supplierIdByName.has(key)) return supplierIdByName.get(key) ?? null;
      const supplierId = await resolveSupplierId(
        businessId,
        row.supplierName,
        supplierMap,
        supplierStats
      );
      supplierIdByName.set(key, supplierId);
      return supplierId;
    };
    let categoriesCreated = 0;

    const allCategoryNames = [
      ...new Set(
        [...rowsToCreate, ...rowsForUpdate.map((u) => u.row)]
          .filter((r) => r.category)
          .map((r) => suggestImportCategoryName(r.category) || r.category)
      ),
    ];
    for (const catName of allCategoryNames) {
      const key = catName.toLowerCase();
      if (!categoryMap.has(key)) {
        const newCat = await prisma.category.create({
          data: { businessId, name: catName },
          select: { id: true },
        });
        categoryMap.set(key, newCat.id);
        categoriesCreated++;
      }
    }

    let updatedCount = 0;
    for (const { row, productId } of rowsForUpdate) {
      const categoryName = row.category
        ? suggestImportCategoryName(row.category) || row.category
        : '';
      const categoryId = categoryName
        ? categoryMap.get(categoryName.toLowerCase()) ?? null
        : null;
      let barcode = row.barcode || null;
      if (barcode) {
        const conflict = await prisma.product.findFirst({
          where: { barcode, id: { not: productId } },
          select: { id: true },
        });
        if (conflict) barcode = null;
      }

      await prisma.product.update({
        where: { id: productId },
        data: {
          sellingPriceBasePence: row.sellingPricePence,
          defaultCostBasePence: row.costPricePence,
          ...(categoryId ? { categoryId } : {}),
          ...(row.sku ? { sku: row.sku } : {}),
          ...(barcode ? { barcode } : {}),
          ...(row.reorderPointBase && row.reorderPointBase > 0
            ? { reorderPointBase: row.reorderPointBase }
            : {}),
          ...(row.storefrontPublished != null
            ? { storefrontPublished: row.storefrontPublished }
            : {}),
          ...(row.imageUrl ? { imageUrl: row.imageUrl } : {}),
        },
      });
      updatedCount++;
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


    // -- Step 2: Create products in 2 DB calls (createManyAndReturn + productUnit createMany) --
    // Previous approach: 25-concurrent batches × ceil(N/25) sequential iterations.
    // At 30ms Neon RTT that's still ceil(614/25)=25 iterations × ~1.5s = ~37s just for
    // products — and we still need purchase invoice calls after.
    // New approach: 1 createManyAndReturn for all products (1 RTT), then 1 productUnit
    // createMany for all unit records (1 RTT). Total: 2 RTTs regardless of row count.
    const allCreatedItems: { row: ConfirmedImportRow; productId: string }[] = [];

    if (rowsToCreate.length > 0) {
      const productData = await Promise.all(
        rowsToCreate.map(async (row) => {
          const categoryName = row.category
            ? suggestImportCategoryName(row.category) || row.category
            : '';
          const supplierId = await resolveSupplierIdForRow(row);
          return {
            businessId,
            name: row.name,
            sku: row.sku || null,
            barcode: row.barcode || null,
            categoryId: categoryName
              ? categoryMap.get(categoryName.toLowerCase()) ?? null
              : null,
            sellingPriceBasePence: row.sellingPricePence,
            defaultCostBasePence: row.costPricePence,
            vatRateBps: 0,
            reorderPointBase: row.reorderPointBase && row.reorderPointBase > 0 ? row.reorderPointBase : 0,
            storefrontPublished: row.storefrontPublished ?? false,
            imageUrl: row.imageUrl || null,
            preferredSupplierId: supplierId,
          };
        })
      );

      // createMany (skipDuplicates:true) + findMany — 2 RTTs, resilient to
      // last-moment unique violations. createManyAndReturn has NO skipDuplicates
      // support: a single barcode/name collision kills the entire 614-row batch.
      // With skipDuplicates, any colliding row is silently skipped so the rest
      // still commit. We then fetch back the IDs with a single findMany.
      const supportsSkipDuplicates =
        !!process.env.POSTGRES_PRISMA_URL ||
        !!process.env.POSTGRES_URL_NON_POOLING ||
        process.env.DATABASE_URL?.startsWith('postgres') === true;

      const createManyArgs: { data: typeof productData; skipDuplicates?: boolean } = {
        data: productData,
      };
      if (supportsSkipDuplicates) {
        createManyArgs.skipDuplicates = true;
      }

      await (prisma.product.createMany as unknown as (args: typeof createManyArgs) => Promise<unknown>)(createManyArgs);
      const createdProducts = await prisma.product.findMany({
        where: { businessId, name: { in: rowsToCreate.map((r) => r.name) } },
        select: { id: true, name: true },
      });

      // Build a name→id map to pair returned IDs back to the input rows
      const createdNameToId = new Map(createdProducts.map((p) => [p.name.toLowerCase(), p.id]));

      // Build all productUnit records — 1 createMany INSERT for the entire set
      const productUnitData: {
        productId: string; unitId: string; isBaseUnit: boolean; conversionToBase: number;
      }[] = [];

      for (const row of rowsToCreate) {
        const productId = createdNameToId.get(row.name.toLowerCase());
        if (!productId) {
          console.error(`[import-stock] no returned ID for "${row.name}" — skipping`);
          skippedNames.push(row.name);
          continue;
        }
        allCreatedItems.push({ row, productId });
        const units = buildProductUnitCreates(
          row.baseUnitId,
          row.packUnitId ?? '',
          row.packSize > 1 ? row.packSize : 0
        );
        for (const u of units) {
          productUnitData.push({ productId, ...u });
        }
      }

      if (productUnitData.length > 0) {
        await prisma.productUnit.createMany({ data: productUnitData });
      }
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
    const skippedRowsWithStock = resolvedRows.filter((r) => {
      const key = r.name.toLowerCase();
      const action = r.duplicateAction ?? 'skip';
      return existingNameSet.has(key) && r.quantity > 0 && action !== 'update';
    });
    // Build map: productId → actual base unitId from DB
    const existingProductBaseUnitMap = new Map<string, string>();
    const stockProductIds = [
      ...skippedRowsWithStock
        .map((r) => existingNameToIdMap.get(r.name.toLowerCase()))
        .filter(Boolean),
      ...rowsForUpdate.map((u) => u.productId),
    ] as string[];
    if (stockProductIds.length > 0) {
      const existingUnits = await prisma.productUnit.findMany({
        where: {
          productId: { in: [...new Set(stockProductIds)] },
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

    // -- Step 4: Create purchase invoices in chunks of 500 lines ----------
    // Products are fully committed — no shared transaction needed.
    // Chunking avoids an oversized IN (...) clause in the DB driver.
    // Both newly-created and existing-with-stock items are included.
    const INVOICE_CHUNK = 500;
    const updateWithStockItems = (
      await Promise.all(
        rowsForUpdate
          .filter(({ row }) => row.quantity > 0)
          .map(async ({ row, productId }) => {
            const actualBaseUnitId =
              existingProductBaseUnitMap.get(productId) ??
              (
                await prisma.productUnit.findFirst({
                  where: { productId, conversionToBase: 1 },
                  select: { unitId: true },
                })
              )?.unitId ??
              row.baseUnitId;
            return {
              row: { ...row, baseUnitId: actualBaseUnitId },
              productId,
            };
          })
      )
    ).filter(Boolean) as { row: ConfirmedImportRow; productId: string }[];

    const allItems = [...createdItems, ...skippedWithStockItems, ...updateWithStockItems];
    const paidItemsAll   = allItems.filter((c) => c.row.paymentStatus === 'PAID');
    const unpaidItemsAll = allItems.filter((c) => c.row.paymentStatus === 'UNPAID');
    const groupLinesBySupplier = async (
      items: Array<{ row: ConfirmedImportRow; productId: string }>
    ) => {
      const groups = new Map<
        string,
        { supplierId: string | null; supplierName: string | null; lines: ReturnType<typeof toPurchaseLine>[] }
      >();
      for (const item of items) {
        if (item.row.quantity <= 0) continue;
        const supplierId = await resolveSupplierIdForRow(item.row);
        const key = supplierId ?? '__NO_SUPPLIER__';
        const supplierName = supplierId ? (item.row.supplierName ?? '').trim() || null : null;
        const group = groups.get(key) ?? { supplierId, supplierName, lines: [] };
        group.lines.push(toPurchaseLine(item.row, item.productId));
        groups.set(key, group);
      }
      return [...groups.values()];
    };
    const paidLineGroups = await groupLinesBySupplier(paidItemsAll);
    const unpaidLineGroups = await groupLinesBySupplier(unpaidItemsAll);
    const paidLinesAll = paidLineGroups.flatMap((group) => group.lines);
    const unpaidLinesAll = unpaidLineGroups.flatMap((group) => group.lines);

    // Pre-seed the full chart of accounts ONCE before launching invoice
    // creation. Without this, multiple createPurchase calls may each try
    // to seed the AP account concurrently — a race that can cause silent
    // failures on the Neon/PostgreSQL connection pool.
    await ensureChartOfAccounts(businessId);

    // Run invoice chunks SEQUENTIALLY to avoid connection-pool contention.
    // Each chunk is wrapped in try/catch so a transient failure on one chunk
    // does NOT abort the remaining chunks — partial progress is preserved.
    // Products are already committed above; losing an invoice chunk is far
    // better than rolling back everything.
    const invoiceErrors: string[] = [];
    const supplierLinkSummary = emptyImportSupplierLinkSummary();
    const supplierSummaryMap = new Map<string, ImportSupplierLinkSupplierSummary>();
    const mergeSupplierProductLinkSummary = (
      summary: SupplierProductLinkSummary | undefined,
      group: { supplierId: string | null; supplierName: string | null },
    ) => {
      if (!summary || !group.supplierId) return;

      supplierLinkSummary.linkedCount += summary.linkedCount;
      supplierLinkSummary.alreadyLinkedCount += summary.alreadyLinkedCount;
      supplierLinkSummary.skippedDifferentSupplierCount += summary.skippedDifferentSupplierCount;
      supplierLinkSummary.skippedProducts.push(...summary.skippedProducts);

      const supplierName =
        group.supplierName ??
        summary.skippedProducts.find((product) => product.purchaseSupplierId === group.supplierId)?.purchaseSupplierName ??
        'Purchase supplier';
      const supplierSummary =
        supplierSummaryMap.get(group.supplierId) ??
        {
          supplierId: group.supplierId,
          supplierName,
          linkedCount: 0,
          alreadyLinkedCount: 0,
          skippedDifferentSupplierCount: 0,
        };
      supplierSummary.linkedCount += summary.linkedCount;
      supplierSummary.alreadyLinkedCount += summary.alreadyLinkedCount;
      supplierSummary.skippedDifferentSupplierCount += summary.skippedDifferentSupplierCount;
      supplierSummaryMap.set(group.supplierId, supplierSummary);
    };

    let paidChunkCount = 0;
    for (const group of paidLineGroups) {
      for (let i = 0; i < group.lines.length; i += INVOICE_CHUNK) {
        const chunk = group.lines.slice(i, i + INVOICE_CHUNK);
        try {
          const invoice = await createPurchase({
            businessId, storeId: store.id, supplierId: group.supplierId,
            paymentStatus: 'PAID', dueDate: null, payments: [],
            lines: chunk, userId: user.id,
            stockMovementType: 'OPENING',
            acknowledgeHighCost: true,
          });
          mergeSupplierProductLinkSummary((invoice as any).supplierProductLinkSummary, group);
          paidChunkCount++;
        } catch (chunkErr: unknown) {
          const msg = chunkErr instanceof Error ? chunkErr.message : String(chunkErr);
          console.error(`[importStock] paid chunk ${paidChunkCount + 1} failed:`, chunkErr);
          invoiceErrors.push(`Paid chunk ${paidChunkCount + 1}: ${msg}`);
        }
      }
    }
    let unpaidChunkCount = 0;
    for (const group of unpaidLineGroups) {
      for (let i = 0; i < group.lines.length; i += INVOICE_CHUNK) {
        const chunk = group.lines.slice(i, i + INVOICE_CHUNK);
        try {
          const invoice = await createPurchase({
            businessId, storeId: store.id, supplierId: group.supplierId,
            paymentStatus: 'UNPAID', dueDate: null, payments: [],
            lines: chunk, userId: user.id,
            stockMovementType: 'OPENING',
            acknowledgeHighCost: true,
          });
          mergeSupplierProductLinkSummary((invoice as any).supplierProductLinkSummary, group);
          unpaidChunkCount++;
        } catch (chunkErr: unknown) {
          const msg = chunkErr instanceof Error ? chunkErr.message : String(chunkErr);
          console.error(`[importStock] unpaid chunk ${unpaidChunkCount + 1} failed:`, chunkErr);
          invoiceErrors.push(`Unpaid chunk ${unpaidChunkCount + 1}: ${msg}`);
        }
      }
    }

    if (invoiceErrors.length > 0) {
      console.error('[importStock] invoice chunk errors (products ARE created):', invoiceErrors);
    }
    supplierLinkSummary.supplierSummaries = [...supplierSummaryMap.values()].sort((a, b) =>
      a.supplierName.localeCompare(b.supplierName),
    );
    console.log(`[importStock] ${paidChunkCount} paid chunk(s) + ${unpaidChunkCount} unpaid chunk(s) complete — paid lines: ${paidLinesAll.length}, unpaid lines: ${unpaidLinesAll.length}`);

    const paidValuePence   = paidLinesAll.reduce((sum, l) => sum + (l.unitCostPence ?? 0) * l.qtyInUnit, 0);
    const unpaidValuePence = unpaidLinesAll.reduce((sum, l) => sum + (l.unitCostPence ?? 0) * l.qtyInUnit, 0);
    const stockUpdatedValuePence =
      [...skippedWithStockItems, ...updateWithStockItems].reduce(
        (sum, { row }) => sum + rowToBaseCost(row),
        0
      );
    const openingStockUnits = paidLinesAll.reduce((s, l) => s + l.qtyInUnit, 0)
      + unpaidLinesAll.reduce((s, l) => s + l.qtyInUnit, 0);

    const summary = {
      created: createdItems.length,
      updated: updatedCount,
      skipped: skippedNames.length,
      stockUpdated: skippedWithStockItems.length + updateWithStockItems.length,
      paidCount: paidLinesAll.length,
      unpaidCount: unpaidLinesAll.length,
      suppliersMatched: supplierStats.matched,
      suppliersCreated: supplierStats.created,
      categoriesCreated,
      openingStockUnits,
    };

    const importRecord = await prisma.productImport.create({
      data: {
        businessId,
        uploadedByUserId: user.id,
        fileName: meta?.fileName ?? null,
        status: invoiceErrors.length > 0 ? 'PARTIAL' : 'COMPLETED',
        rowsParsed: meta?.rowsParsed ?? rows.length,
        rowsImported: createdItems.length,
        rowsUpdated: updatedCount,
        rowsSkipped: skippedNames.length,
        rowsErrors: meta?.rowsErrors ?? 0,
        rowsWarnings: meta?.rowsWarnings ?? 0,
        summaryJson: JSON.stringify(summary),
        errorReportJson: meta?.errorReportJson ?? null,
      },
      select: { id: true },
    });

    audit({
      businessId,
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      action: 'PRODUCT_IMPORT',
      entity: 'Product',
      entityId: businessId,
      details: { ...summary, importId: importRecord.id },
    }).catch((e) => console.error('[audit]', e));

    revalidateTag('pos-products');
    revalidateTag('reports');
    revalidateTag(`readiness-${businessId}`);
    revalidateTag('control-portfolio');
    revalidateTag('scale-cockpit');

    return ok<ImportStockResult>({
      importId: importRecord.id,
      created: createdItems.length,
      updated: updatedCount,
      skipped: skippedNames.length,
      skippedNames: skippedNames.slice(0, 200),
      barcodesCleared,
      paidCount: paidLinesAll.length,
      unpaidCount: unpaidLinesAll.length,
      paidValuePence,
      unpaidValuePence,
      stockUpdated: skippedWithStockItems.length + updateWithStockItems.length,
      stockUpdatedValuePence,
      openingStockUnits,
      suppliersMatched: supplierStats.matched,
      suppliersCreated: supplierStats.created,
      categoriesCreated,
      warningsAcknowledged: rows.filter((r) => r.confirmBelowCost).length,
      supplierLinkSummary,
    });
  });
}
