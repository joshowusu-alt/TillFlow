'use server';

import { prisma } from '@/lib/prisma';
import { revalidateTag } from 'next/cache';
import { withBusinessContext, safeAction, ok, err, type ActionResult } from '@/lib/action-utils';
import { createPurchase } from '@/lib/services/purchases';
import type { SupplierProductLinkSummary, SupplierProductLinkSkippedProduct } from '@/lib/services/purchases';
import { recordOpeningInventory } from '@/lib/services/opening-inventory';
import { buildProductUnitCreates } from '@/lib/services/products';
import { ensureChartOfAccounts } from '@/lib/accounting';
import { audit } from '@/lib/audit';
import { suggestImportCategoryName } from '@/lib/import/category-import';
import type { DuplicateAction } from '@/lib/import/import-validation';
import {
  isImportMode,
  type ImportMode,
  type OpeningStockFunding,
  type PurchasePaymentAccount,
} from '@/lib/import/import-mode';
import { isPostgresDatabaseUrl } from '@/lib/database-runtime';
import type { PaymentMethod } from '@/lib/services/shared/payment-utils';

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
  /** Purchases mode only. Ignored for catalogue / opening stock. */
  paymentStatus?: 'PAID' | 'UNPAID';
  duplicateAction?: DuplicateAction;
  supplierName?: string;
  reorderPointBase?: number;
  storefrontPublished?: boolean;
  imageUrl?: string;
  notes?: string;
  confirmBelowCost?: boolean;
  /** Opening stock: EQUITY (default) or SUPPLIER_CREDIT (named supplier required). */
  openingFunding?: OpeningStockFunding;
  /** Purchases PAID: which GL payment account to credit. */
  paymentAccount?: PurchasePaymentAccount;
};

export type ImportStockMeta = {
  fileName?: string;
  rowsParsed?: number;
  rowsErrors?: number;
  rowsWarnings?: number;
  errorReportJson?: string;
  /** Required — never inferred from spreadsheet alone. */
  importMode: ImportMode;
  /** True when uploaded file still contains payment_status (legacy). */
  legacyPaymentStatusColumn?: boolean;
  clientImportKey?: string;
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
  importMode: ImportMode;
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
  openingEquityValuePence: number;
  openingSupplierCreditValuePence: number;
  missingCostCount: number;
  costReviewProductIds: string[];
  journalsPosted: number;
  suppliersMatched: number;
  suppliersCreated: number;
  categoriesCreated: number;
  warningsAcknowledged: number;
  accountingEffectSummary: string[];
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

function paymentAccountToMethod(account: PurchasePaymentAccount | undefined): PaymentMethod {
  if (account === 'BANK') return 'TRANSFER';
  if (account === 'MOBILE_MONEY') return 'MOBILE_MONEY';
  return 'CASH';
}

// ---------------------------------------------------------------------------
// Action
// ---------------------------------------------------------------------------

export async function importStockAction(
  rows: ConfirmedImportRow[],
  meta: ImportStockMeta
): Promise<ActionResult<ImportStockResult>> {
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
  meta: ImportStockMeta
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
    if (!meta?.importMode || !isImportMode(meta.importMode)) {
      return err('Choose an import purpose first: Product catalogue, Opening stock, or Purchases.');
    }
    const importMode = meta.importMode;

    // Legacy spreadsheets with payment_status must still pick a mode explicitly
    // (UI enforces this). Opening stock ignores PAID/UNPAID entirely.

    const { user, businessId } = authContext;

    // Catalogue mode never posts stock — strip quantities before processing.
    const incomingRows: ConfirmedImportRow[] =
      importMode === 'CATALOGUE'
        ? rows.map((r) => ({ ...r, quantity: 0, paymentStatus: undefined, openingFunding: undefined }))
        : rows;

    const store = await prisma.store.findFirst({
      where: { businessId },
      select: { id: true },
    });
    if (!store) return err('No store found. Complete business setup first.');

    // ── Resolve "new:UnitName" sentinels → create Unit records ──────────
    // The preview UI sets baseUnitId / packUnitId / qtyInUnitId to "new:Name"
    // when the owner chooses to create a previously unknown unit.
    const newUnitNames = new Set<string>();
    for (const row of incomingRows) {
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
    const resolvedRows: ConfirmedImportRow[] = incomingRows.map((row) => ({
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
      // skipDuplicates is Postgres-only. Local SQLite often still has POSTGRES_*
      // env vars for deploy tooling, so gate on the active DATABASE_URL only.
      const supportsSkipDuplicates = isPostgresDatabaseUrl(process.env.DATABASE_URL);

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

    // -- Step 4: Mode-specific stock / purchase posting --------------------
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
    const stockItems = allItems.filter((c) => c.row.quantity > 0);

    const groupLinesBySupplier = async (
      items: Array<{ row: ConfirmedImportRow; productId: string }>
    ) => {
      const groups = new Map<
        string,
        {
          supplierId: string | null;
          supplierName: string | null;
          lines: ReturnType<typeof toPurchaseLine>[];
          rows: ConfirmedImportRow[];
        }
      >();
      for (const item of items) {
        if (item.row.quantity <= 0) continue;
        const supplierId = await resolveSupplierIdForRow(item.row);
        const key = supplierId ?? '__NO_SUPPLIER__';
        const supplierName = supplierId ? (item.row.supplierName ?? '').trim() || null : null;
        const group = groups.get(key) ?? { supplierId, supplierName, lines: [], rows: [] };
        group.lines.push(toPurchaseLine(item.row, item.productId));
        group.rows.push(item.row);
        groups.set(key, group);
      }
      return [...groups.values()];
    };

    await ensureChartOfAccounts(businessId);

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

    let paidCount = 0;
    let unpaidCount = 0;
    let paidValuePence = 0;
    let unpaidValuePence = 0;
    let openingStockUnits = 0;
    let openingEquityValuePence = 0;
    let openingSupplierCreditValuePence = 0;
    let missingCostCount = 0;
    let journalsPosted = 0;
    const costReviewProductIds: string[] = [];
    const accountingEffectSummary: string[] = [];
    const clientImportKey = meta.clientImportKey?.trim() || `import-${Date.now()}`;

    if (importMode === 'CATALOGUE') {
      accountingEffectSummary.push('Catalogue only — no stock movements, journals, cash or supplier payables.');
    }

    if (importMode === 'OPENING_STOCK' && stockItems.length > 0) {
      const equityItems = stockItems.filter((i) => (i.row.openingFunding ?? 'EQUITY') !== 'SUPPLIER_CREDIT');
      const creditItems = stockItems.filter((i) => i.row.openingFunding === 'SUPPLIER_CREDIT');

      for (const item of creditItems) {
        if (!(item.row.supplierName ?? '').trim()) {
          return err(`Opening stock on supplier credit requires a named supplier (${item.row.name}).`);
        }
      }

      if (equityItems.length > 0) {
        const openingResult = await recordOpeningInventory({
          businessId,
          storeId: store.id,
          userId: user.id,
          referenceId: `${clientImportKey}-equity`,
          description: 'Opening stock import — Opening Balance Equity',
          lines: equityItems.map(({ row, productId }) => {
            const isPack =
              !!row.packUnitId &&
              row.qtyInUnitId === row.packUnitId &&
              row.packSize > 1;
            return {
              productId,
              unitId: row.baseUnitId,
              qtyInUnit: isPack ? row.quantity * row.packSize : row.quantity,
              unitCostBasePence: row.costPricePence > 0 ? row.costPricePence : 0,
            };
          }),
        });
        openingEquityValuePence += openingResult.valuedPence;
        openingStockUnits += openingResult.valuedUnits + openingResult.unvaluedUnits;
        missingCostCount += openingResult.costReviewProductIds.length;
        costReviewProductIds.push(...openingResult.costReviewProductIds);
        if (openingResult.journalPosted) journalsPosted += 1;
        accountingEffectSummary.push(
          `Opening stock (owner-funded / equity): Dr Inventory / Cr Opening Balance Equity ${openingResult.valuedPence}p.`
        );
        if (openingResult.unvaluedUnits > 0) {
          accountingEffectSummary.push(
            `${openingResult.unvaluedUnits} unit(s) recorded without cost — stock value and profit remain incomplete.`
          );
        }
        if (meta.legacyPaymentStatusColumn) {
          accountingEffectSummary.push(
            'Legacy payment_status column ignored for opening stock — cash was not reduced.'
          );
        }
      }

      if (creditItems.length > 0) {
        const creditGroups = await groupLinesBySupplier(creditItems);
        for (const group of creditGroups) {
          if (!group.supplierId) {
            return err('Opening stock on supplier credit requires a named supplier.');
          }
          for (let i = 0; i < group.lines.length; i += INVOICE_CHUNK) {
            const chunk = group.lines.slice(i, i + INVOICE_CHUNK);
            try {
              const invoice = await createPurchase({
                businessId,
                storeId: store.id,
                supplierId: group.supplierId,
                paymentStatus: 'UNPAID',
                dueDate: null,
                payments: [],
                lines: chunk,
                userId: user.id,
                stockMovementType: 'OPENING',
                acknowledgeHighCost: true,
              });
              mergeSupplierProductLinkSummary((invoice as any).supplierProductLinkSummary, group);
              const chunkValue = chunk.reduce((s, l) => s + (l.unitCostPence ?? 0) * l.qtyInUnit, 0);
              openingSupplierCreditValuePence += chunkValue;
              unpaidValuePence += chunkValue;
              unpaidCount += chunk.length;
              openingStockUnits += chunk.reduce((s, l) => s + l.qtyInUnit, 0);
              journalsPosted += 1;
            } catch (chunkErr: unknown) {
              const msg = chunkErr instanceof Error ? chunkErr.message : String(chunkErr);
              invoiceErrors.push(`Opening supplier-credit chunk: ${msg}`);
            }
          }
        }
        accountingEffectSummary.push(
          `Opening stock (supplier credit): Dr Inventory / Cr Accounts Payable ${openingSupplierCreditValuePence}p.`
        );
      }
    }

    if (importMode === 'PURCHASES' && stockItems.length > 0) {
      const paidItemsAll = stockItems.filter((c) => (c.row.paymentStatus ?? 'UNPAID') === 'PAID');
      const unpaidItemsAll = stockItems.filter((c) => (c.row.paymentStatus ?? 'UNPAID') !== 'PAID');

      for (const item of unpaidItemsAll) {
        if (!(item.row.supplierName ?? '').trim()) {
          return err(`Unpaid purchases require a named supplier (${item.row.name}).`);
        }
      }

      const paidLineGroups = await groupLinesBySupplier(paidItemsAll);
      const unpaidLineGroups = await groupLinesBySupplier(unpaidItemsAll);

      for (const group of paidLineGroups) {
        for (let i = 0; i < group.lines.length; i += INVOICE_CHUNK) {
          const chunk = group.lines.slice(i, i + INVOICE_CHUNK);
          const chunkTotal = chunk.reduce((s, l) => s + (l.unitCostPence ?? 0) * l.qtyInUnit, 0);
          const method = paymentAccountToMethod(group.rows[0]?.paymentAccount);
          try {
            const invoice = await createPurchase({
              businessId,
              storeId: store.id,
              supplierId: group.supplierId,
              paymentStatus: 'PAID',
              dueDate: null,
              payments: chunkTotal > 0 ? [{ method, amountPence: chunkTotal }] : [],
              lines: chunk,
              userId: user.id,
              stockMovementType: 'PURCHASE',
              acknowledgeHighCost: true,
              skipCashDrawerRequirement: true,
            });
            mergeSupplierProductLinkSummary((invoice as any).supplierProductLinkSummary, group);
            paidValuePence += chunkTotal;
            paidCount += chunk.length;
            openingStockUnits += chunk.reduce((s, l) => s + l.qtyInUnit, 0);
            journalsPosted += 1;
          } catch (chunkErr: unknown) {
            const msg = chunkErr instanceof Error ? chunkErr.message : String(chunkErr);
            invoiceErrors.push(`Paid purchase chunk: ${msg}`);
          }
        }
      }

      for (const group of unpaidLineGroups) {
        if (!group.supplierId) {
          return err('Unpaid purchases require a named supplier.');
        }
        for (let i = 0; i < group.lines.length; i += INVOICE_CHUNK) {
          const chunk = group.lines.slice(i, i + INVOICE_CHUNK);
          try {
            const invoice = await createPurchase({
              businessId,
              storeId: store.id,
              supplierId: group.supplierId,
              paymentStatus: 'UNPAID',
              dueDate: null,
              payments: [],
              lines: chunk,
              userId: user.id,
              stockMovementType: 'PURCHASE',
              acknowledgeHighCost: true,
            });
            mergeSupplierProductLinkSummary((invoice as any).supplierProductLinkSummary, group);
            const chunkValue = chunk.reduce((s, l) => s + (l.unitCostPence ?? 0) * l.qtyInUnit, 0);
            unpaidValuePence += chunkValue;
            unpaidCount += chunk.length;
            openingStockUnits += chunk.reduce((s, l) => s + l.qtyInUnit, 0);
            journalsPosted += 1;
          } catch (chunkErr: unknown) {
            const msg = chunkErr instanceof Error ? chunkErr.message : String(chunkErr);
            invoiceErrors.push(`Unpaid purchase chunk: ${msg}`);
          }
        }
      }

      if (paidValuePence > 0) {
        accountingEffectSummary.push(`Paid purchases: Dr Inventory / Cr selected payment account ${paidValuePence}p.`);
      }
      if (unpaidValuePence > 0) {
        accountingEffectSummary.push(`Unpaid purchases: Dr Inventory / Cr Accounts Payable ${unpaidValuePence}p.`);
      }
    }

    if (invoiceErrors.length > 0) {
      console.error('[importStock] invoice chunk errors (products ARE created):', invoiceErrors);
    }
    supplierLinkSummary.supplierSummaries = [...supplierSummaryMap.values()].sort((a, b) =>
      a.supplierName.localeCompare(b.supplierName),
    );

    const stockUpdatedValuePence =
      importMode === 'CATALOGUE'
        ? 0
        : [...skippedWithStockItems, ...updateWithStockItems].reduce(
            (sum, { row }) => sum + rowToBaseCost(row),
            0
          );

    const summary = {
      importMode,
      created: createdItems.length,
      updated: updatedCount,
      skipped: skippedNames.length,
      stockUpdated: importMode === 'CATALOGUE' ? 0 : skippedWithStockItems.length + updateWithStockItems.length,
      paidCount,
      unpaidCount,
      openingEquityValuePence,
      openingSupplierCreditValuePence,
      missingCostCount,
      journalsPosted,
      suppliersMatched: supplierStats.matched,
      suppliersCreated: supplierStats.created,
      categoriesCreated,
      openingStockUnits,
      accountingEffectSummary,
    };

    const importRecord = await prisma.productImport.create({
      data: {
        businessId,
        uploadedByUserId: user.id,
        fileName: meta?.fileName ?? null,
        status: invoiceErrors.length > 0 ? 'PARTIAL' : 'COMPLETED',
        rowsParsed: meta?.rowsParsed ?? incomingRows.length,
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
    const { revalidateImproveRecordsHome } = await import('@/lib/improve-records-revalidate');
    revalidateImproveRecordsHome();

    return ok<ImportStockResult>({
      importId: importRecord.id,
      importMode,
      created: createdItems.length,
      updated: updatedCount,
      skipped: skippedNames.length,
      skippedNames: skippedNames.slice(0, 200),
      barcodesCleared,
      paidCount,
      unpaidCount,
      paidValuePence,
      unpaidValuePence,
      stockUpdated: importMode === 'CATALOGUE' ? 0 : skippedWithStockItems.length + updateWithStockItems.length,
      stockUpdatedValuePence,
      openingStockUnits,
      openingEquityValuePence,
      openingSupplierCreditValuePence,
      missingCostCount,
      costReviewProductIds: [...new Set(costReviewProductIds)],
      journalsPosted,
      suppliersMatched: supplierStats.matched,
      suppliersCreated: supplierStats.created,
      categoriesCreated,
      warningsAcknowledged: incomingRows.filter((r) => r.confirmBelowCost).length,
      accountingEffectSummary,
      supplierLinkSummary,
    });
  });
}
