'use server';
import { createHash } from 'crypto';
import {decodePurchaseDocuments,validatePurchaseDocuments} from '@/lib/purchases/source-documents';

import { prisma } from '@/lib/prisma';
import { revalidateTag } from 'next/cache';
import { requireSelectedStoreContext, safeAction, ok, err, type ActionResult } from '@/lib/action-utils';
import { readOperationalStoreCookie } from '@/lib/reliability/operational-store-cookie';
import { createPurchase } from '@/lib/services/purchases';
import type { SupplierProductLinkSummary, SupplierProductLinkSkippedProduct } from '@/lib/services/purchases';
import { recordOpeningInventory, type RecordOpeningInventoryResult } from '@/lib/services/opening-inventory';
import { readBatchDates } from '@/lib/inventory/batch-dates';
import { buildImportChunkKey, buildImportChunkPayloadHash } from '@/lib/import/import-chunk-identity';
import { userFacingImportFailure } from '@/lib/import/import-failure';
import { createImportSupplierResolver } from '@/lib/import/import-suppliers';
import {
  IMPORT_INTERACTIVE_TX,
  OPENING_EQUITY_CHUNK_SIZE,
  PRODUCT_CREATE_CHUNK_SIZE,
  PRODUCT_UPDATE_CHUNK_SIZE,
} from '@/lib/import/import-write-budget';
import {
  findMoneyIdempotency,
  insertMoneyIdempotency,
  isPrismaUniqueConstraintOn,
  parseIdempotencyResult,
  replayOrConflict,
} from '@/lib/services/money-idempotency';
import { revalidatePosCatalog } from '@/lib/cache/pos-tags';
import { buildProductUnitCreates } from '@/lib/services/products';
import { ensureChartOfAccounts } from '@/lib/accounting';
import { audit } from '@/lib/audit';
import { createClassificationNode } from '@/lib/services/product-classification';
import { importClassificationErrors, importOptionalProductUpdates, matchImportProduct } from '@/lib/import/import-reliability';
import type { DuplicateAction } from '@/lib/import/import-validation';
import {
  isImportMode,
  type ImportMode,
  type OpeningStockFunding,
  type PurchasePaymentAccount,
} from '@/lib/import/import-mode';
import type { PaymentMethod } from '@/lib/services/shared/payment-utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ConfirmedImportRow = {
  division?: string;
  group?: string;
  name: string;
  sku: string;
  barcode: string;
  category: string;
  sellingPricePence: number;
  costPricePence: number;
  costPriceProvided?: boolean;
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
  /** Optional YYYY-MM-DD dates from production_date / expiry_date. */
  productionDate?: string;
  expiryDate?: string;
  /** Purchases PAID: which GL payment account to credit. */
  paymentAccount?: PurchasePaymentAccount;
};

export type ImportStockMeta = {
  purchaseDocumentsJson?: string;
  fileName?: string;
  rowsParsed?: number;
  rowsErrors?: number;
  rowsWarnings?: number;
  errorReportJson?: string;
  /** Required — never inferred from spreadsheet alone. */
  importMode: ImportMode;
  /** True when uploaded file still contains payment_status (legacy). */
  legacyPaymentStatusColumn?: boolean;
  /**
   * Stable client-generated key for this import submit.
   * When set, chunk idempotency uses it as importRunId so a retry of the same
   * submit (same businessId + clientImportKey) replays prior chunks instead of
   * posting again. A new key starts a new run. Clients should send the same
   * clientImportKey for retries of one user submit.
   */
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

async function runInChunks<T>(items: T[], size: number, worker: (item: T) => Promise<void>) {
  const width = Math.max(1, size);
  for (let index = 0; index < items.length; index += width) {
    await Promise.all(items.slice(index, index + width).map((item) => worker(item)));
  }
}

function paymentAccountToMethod(account: PurchasePaymentAccount | undefined): PaymentMethod {
  if (account === 'BANK') return 'TRANSFER';
  if (account === 'MOBILE_MONEY') return 'MOBILE_MONEY';
  return 'CASH';
}

/**
 * Opening equity + MoneyIdempotency must commit together so a crash after stock
 * cannot be retried as a second inventory apply, and a crash after money cannot
 * skip stock.
 */
async function recordOpeningInventoryOnce(input: {
  businessId: string;
  storeId: string;
  userId?: string | null;
  importRunId: string;
  importMode: ImportMode;
  chunkIndex: number;
  lines: Array<{ productId: string; unitId: string; qtyInUnit: number; unitCostBasePence?: number | null; productionDate?: Date | null; expiryDate?: Date | null }>;
  description?: string;
}): Promise<RecordOpeningInventoryResult> {
  const hashLines = input.lines.map((l) => ({
    productId: l.productId,
    unitId: l.unitId,
    qtyInUnit: l.qtyInUnit,
    unitCostPence: l.unitCostBasePence,
    productionDate: l.productionDate,
    expiryDate: l.expiryDate,
  }));
  const amountPence = hashLines.reduce((s, l) => s + (l.unitCostPence ?? 0) * l.qtyInUnit, 0);
  const idempotencyKey = buildImportChunkKey({
    businessId: input.businessId,
    importRunId: input.importRunId,
    mode: input.importMode,
    operation: 'opening-equity',
    supplierKey: 'equity',
    chunkIndex: input.chunkIndex,
  });
  const payloadHash = buildImportChunkPayloadHash({
    businessId: input.businessId,
    storeId: input.storeId,
    importRunId: input.importRunId,
    mode: input.importMode,
    operation: 'opening-equity',
    supplierKey: 'equity',
    chunkIndex: input.chunkIndex,
    lines: hashLines,
    amountPence,
    method: null,
  });

  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await findMoneyIdempotency(tx as any, input.businessId, idempotencyKey);
      if (existing) {
        replayOrConflict(existing, { payloadHash, commandKind: 'IMPORT_CHUNK' });
        return parseIdempotencyResult<RecordOpeningInventoryResult>(existing.resultJson);
      }

      const openingResult = await recordOpeningInventory(
        {
          businessId: input.businessId,
          storeId: input.storeId,
          userId: input.userId,
          referenceId: `${input.importRunId}-equity-${input.chunkIndex}`,
          description: input.description,
          batchSource: 'IMPORT',
          lines: input.lines,
        },
        tx,
      );

      await insertMoneyIdempotency(tx as any, {
        businessId: input.businessId,
        key: idempotencyKey,
        payloadHash,
        commandKind: 'IMPORT_CHUNK',
        resultJson: JSON.stringify(openingResult),
      });

      return openingResult;
    }, IMPORT_INTERACTIVE_TX);
  } catch (error) {
    if (isPrismaUniqueConstraintOn(error, ['businessId', 'key'])) {
      const winner = await findMoneyIdempotency(prisma as any, input.businessId, idempotencyKey);
      if (winner) {
        replayOrConflict(winner, { payloadHash, commandKind: 'IMPORT_CHUNK' });
        return parseIdempotencyResult<RecordOpeningInventoryResult>(winner.resultJson);
      }
    }
    throw error;
  }
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

async function _runImport(
  rows: ConfirmedImportRow[],
  meta: ImportStockMeta
): Promise<ActionResult<ImportStockResult>> {
  // Auth resolved OUTSIDE safeAction so a redirect() from requireSelectedStoreContext
  // is caught here and converted to a typed err() instead of escaping.
  let authContext: Awaited<ReturnType<typeof requireSelectedStoreContext>>;
  try {
    authContext = await requireSelectedStoreContext(
      ['MANAGER', 'OWNER'],
      readOperationalStoreCookie(),
    );
  } catch (_authErr) {
    // Any failure here (redirect, role error, store cookie, DB error) = session/store problem.
    console.error('[importStockAction] auth error:', _authErr);
    const message = _authErr instanceof Error ? _authErr.message : '';
    if (/branch|store|tab is out of date/i.test(message)) return err(message);
    return err('Your session has expired. Please refresh the page and sign in again.');
  }

  return safeAction(async () => {
    if (!rows.length) return err('No rows to import.');
    if (!meta?.importMode || !isImportMode(meta.importMode)) {
      return err('Choose an import purpose first: Product catalogue, Opening stock, or Purchases.');
    }
    const importMode = meta.importMode;
    const normalizedClientImportKey = meta.clientImportKey?.trim() || '';
    if ((importMode === 'PURCHASES' || importMode === 'OPENING_STOCK') && !normalizedClientImportKey) return err('This import form is out of date. Reload the file and try again so paid chunks can replay safely.');
    const importNameKey = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ');
    const sourceDocuments = importMode==='PURCHASES' ? decodePurchaseDocuments(meta.purchaseDocumentsJson??'') : [];
    if(importMode==='PURCHASES')validatePurchaseDocuments(sourceDocuments);

    // Legacy spreadsheets with payment_status must still pick a mode explicitly
    // (UI enforces this). Opening stock ignores PAID/UNPAID entirely.

    const { user, businessId, storeId } = authContext;
    const store = { id: storeId };

    // Catalogue mode never posts stock — strip quantities before processing.
    const incomingRows: ConfirmedImportRow[] =
      importMode === 'CATALOGUE'
        ? rows.map((r) => ({ ...r, quantity: 0, paymentStatus: undefined, openingFunding: undefined }))
        : rows;

    // Reject invalid submissions before making any changes.
    for (const row of incomingRows) {
      const errors = importClassificationErrors(row);
      if (errors.length) throw new Error(`${row.name}: ${errors.join(' ')}`);
      if (!row.name.trim() || !row.baseUnitId || !Number.isSafeInteger(row.sellingPricePence) || row.sellingPricePence <= 0 || !Number.isSafeInteger(row.costPricePence) || row.costPricePence < 0) throw new Error(`Invalid product name, unit or price for ${row.name}.`);
      if (!Number.isSafeInteger(row.quantity) || row.quantity < 0) throw new Error(`Quantity must be a non-negative whole number for ${row.name}.`);
      if (row.packUnitId && (!Number.isSafeInteger(row.packSize) || row.packSize < 2 || row.packUnitId === row.baseUnitId)) throw new Error(`Invalid pack configuration for ${row.name}.`);
      if (row.qtyInUnitId !== row.baseUnitId && row.qtyInUnitId !== row.packUnitId) throw new Error(`Stock count unit must match the base or pack unit for ${row.name}.`);
      if (row.reorderPointBase !== undefined && (!Number.isSafeInteger(row.reorderPointBase) || row.reorderPointBase < 0)) throw new Error(`Invalid reorder point for ${row.name}.`);
      if (importMode === 'PURCHASES' && !['PAID', 'UNPAID'].includes(row.paymentStatus ?? '')) throw new Error(`Choose Paid or Unpaid for ${row.name}.`);
      if (row.duplicateAction !== 'skip' && row.quantity > 0 && ((importMode === 'PURCHASES' && row.paymentStatus === 'UNPAID') || (importMode === 'OPENING_STOCK' && row.openingFunding === 'SUPPLIER_CREDIT')) && !row.supplierName?.trim()) throw new Error(`A named supplier is required for ${row.name}.`);
      const baseQuantity = row.packUnitId && row.qtyInUnitId === row.packUnitId ? row.quantity * row.packSize : row.quantity;
      if (!Number.isSafeInteger(baseQuantity) || baseQuantity > 2147483647 || row.sellingPricePence > 2147483647 || row.costPricePence > 2147483647 || row.reorderPointBase !== undefined && row.reorderPointBase > 2147483647) throw new Error(`Numeric value is too large for ${row.name}.`);
      if (row.duplicateAction && !['create', 'update', 'skip'].includes(row.duplicateAction)) throw new Error('Invalid duplicate action.');
    }
    const categoryForRow = (row: ConfirmedImportRow) => row.category.trim();
    const pathKey = (row: ConfirmedImportRow) => JSON.stringify([categoryForRow(row), row.division?.trim(), row.group?.trim()]).toLowerCase();

    // ── Resolve "new:UnitName" sentinels → create Unit records ──────────
    // The preview UI sets baseUnitId / packUnitId / qtyInUnitId to "new:Name"
    // when the owner chooses to create a previously unknown unit.
    const newUnitNames = new Set<string>();
    for (const row of incomingRows) {
      if (row.duplicateAction === 'skip') continue;
      [row.baseUnitId, row.packUnitId, row.qtyInUnitId].forEach((v) => {
        if (v && v.startsWith('new:')) newUnitNames.add(v.slice(4).trim());
      });
    }

    const availableUnits = newUnitNames.size ? await prisma.unit.findMany({ select: { id: true, name: true } }) : [];
    const createdUnitMap = new Map<string, string>(); // "new:Name" → real id
    for (const unitName of newUnitNames) {
      const existingUnit = availableUnits.find(unit => unit.name.trim().toLowerCase() === unitName.toLowerCase());
      const u = existingUnit ?? await prisma.unit.create({
        data: {
          name: unitName,
          pluralName: unitName + 's',
        },
        select: { id: true },
      });
      if (!existingUnit) availableUnits.push({ id: u.id, name: unitName });
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
    const existingProducts = await prisma.product.findMany({
      where: { businessId },
      select: { id: true, name: true, categoryId: true, divisionId: true, groupId: true, barcode: true, sku: true, barcodes: { select: { code: true } } },
    });
    const skippedNames: string[] = [];
    const rowsForCreate: ConfirmedImportRow[] = [];
    const rowsForUpdate: Array<{ row: ConfirmedImportRow; productId: string }> = [];
    const rowsForReplay: Array<{ row: ConfirmedImportRow; productId: string }> = [];
    const seenProducts = new Set<string>();
    const submittedBarcodes = new Set<string>();
    const submittedSkus = new Set<string>();
    const seenNewNames = new Set<string>();
    const seenNewIdentifiedNames = new Set<string>();
    const identitiesByName = new Map<string, Set<string>>();
    for (const row of resolvedRows) {
      if (row.duplicateAction === 'skip') continue;
      const key = importNameKey(row.name);
      const identities = identitiesByName.get(key) ?? new Set<string>();
      identities.add(`${row.barcode.trim()}\n${row.sku.trim().toLowerCase()}`);
      identitiesByName.set(key, identities);
    }
    const namesWithDistinctIdentifiers = new Set(
      [...identitiesByName.entries()].filter(([, identities]) => identities.size > 1).map(([key]) => key),
    );
    const productIdForRow = (row: ConfirmedImportRow) => {
      // Unique titles keep the name-only id so a retry of an earlier import still replays.
      const parts: string[] = [authContext.businessId, normalizedClientImportKey, row.name.trim().toLowerCase()];
      if (namesWithDistinctIdentifiers.has(importNameKey(row.name))) parts.push(row.barcode.trim(), row.sku.trim().toLowerCase());
      return 'imp_' + createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 40);
    };
    for (const row of resolvedRows) {
      if (row.duplicateAction === 'skip') { skippedNames.push(row.name); continue; }
      if (row.barcode && submittedBarcodes.has(row.barcode)) throw new Error(`Barcode is duplicated in this file: ${row.barcode}.`);
      if (row.sku && submittedSkus.has(row.sku.trim().toLowerCase())) throw new Error(`SKU is duplicated in this file: ${row.sku}.`);
      if (row.barcode) submittedBarcodes.add(row.barcode);
      if (row.sku) submittedSkus.add(row.sku.trim().toLowerCase());
      const existingId = matchImportProduct(row, existingProducts);
      if (existingId && normalizedClientImportKey && existingId === productIdForRow(row) && row.duplicateAction === 'create') {
        rowsForReplay.push({ row, productId: existingId });
        continue;
      }
      if (existingId) {
        const existing = existingProducts.find(product => product.id === existingId)!;
        if (row.category.trim() && !row.division?.trim() && (existing.groupId || existing.divisionId)) {
          const category = existingCategories.find(item => item.id === existing.categoryId);
          if (category?.name.toLowerCase() !== row.category.trim().toLowerCase()) throw new Error(`Classification differs for ${row.name}. Include its full classification path or leave classification blank to preserve it.`);
        }
        if (row.duplicateAction !== 'update') throw new Error(`${row.name} already exists. Choose Update existing or Skip.`);
        if (seenProducts.has(existingId)) throw new Error(`Multiple rows update the same product: ${row.name}. Combine them before importing.`);
        seenProducts.add(existingId);
        rowsForUpdate.push({ row, productId: existingId });
      } else {
        if (row.duplicateAction === 'update') throw new Error(`${row.name} no longer matches an existing product. Reload the file.`);
        const key = importNameKey(row.name);
        const identified = Boolean(row.barcode.trim() || row.sku.trim());
        if (identified) {
          if (seenNewNames.has(key)) throw new Error(`Multiple products share the name ${row.name}. Supply the exact barcode or SKU.`);
          seenNewIdentifiedNames.add(key);
        } else if (seenNewNames.has(key)) {
          throw new Error(`Duplicate new product name: ${row.name}.`);
        } else if (seenNewIdentifiedNames.has(key)) {
          throw new Error(`Multiple products share the name ${row.name}. Supply the exact barcode or SKU.`);
        } else {
          seenNewNames.add(key);
        }
        rowsForCreate.push(row);
      }
    }

    // Skip never changes product details or stock. Validate saved unit conversions.
    const existingProductBaseUnitMap = new Map<string, string>();
    for (const { row, productId } of [...rowsForUpdate, ...rowsForReplay]) {
      const units = await prisma.productUnit.findMany({ where: { productId }, select: { unitId: true, isBaseUnit: true, conversionToBase: true } });
      const base = units.find(unit => unit.isBaseUnit);
      if (!base || base.unitId !== row.baseUnitId) throw new Error(`Base unit differs for ${row.name}. Change units in the product editor before importing.`);
      if (row.packUnitId) {
        const pack = units.find(unit => unit.unitId === row.packUnitId);
        if (!pack || pack.conversionToBase !== row.packSize) throw new Error(`Pack configuration differs for ${row.name}. Change packaging in the product editor before importing.`);
      }
      existingProductBaseUnitMap.set(productId, base.unitId);
    }

    const rowsAfterNameFilter = rowsForCreate;

    const existingBarcodesRaw = await prisma.productBarcode.findMany({ where: { businessId }, select: { code: true } });
    const primaryCodes = await prisma.product.findMany({ where: { businessId, barcode: { not: null } }, select: { barcode: true } });
    const existingBarcodeSet = new Set([...existingBarcodesRaw.map(p => p.code), ...primaryCodes.map(p => p.barcode!)]);
    const seenBarcodesInBatch = new Set<string>();
    const barcodesCleared = 0;
    const rowsToCreate = rowsAfterNameFilter.map(r => {
      if (r.barcode && (existingBarcodeSet.has(r.barcode) || seenBarcodesInBatch.has(r.barcode))) throw new Error(`Barcode ${r.barcode} is duplicated in this business/import. Correct it before importing; no barcode was removed.`);
      if (r.barcode) seenBarcodesInBatch.add(r.barcode);
      return r;
    });

    // ── Step 1: Pre-create all missing categories outside any transaction ──
    // IDs are stable before product chunks start, so no repeated category
    // creates inside the tx loop.
    const supplierResolver = createImportSupplierResolver(
      businessId,
      await prisma.supplier.findMany({
        where: { businessId },
        select: { id: true, name: true, createdAt: true },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      }),
    );
    const resolveSupplierIdForRow = (row: ConfirmedImportRow) => supplierResolver.resolve(row.supplierName);
    let importRecord: { id: string } | null = null;
    let updatedCount = 0;
    let openingChunksPosted = 0;
    let importSettled = false;
    const allCreatedItems: { row: ConfirmedImportRow; productId: string }[] = [...rowsForReplay];
    const abandonImport = async (message: string, status: 'FAILED' | 'PARTIAL') => {
      if (importRecord) {
        await prisma.productImport.update({
          where: { id: importRecord.id },
          data: {
            status,
            rowsImported: allCreatedItems.length,
            rowsUpdated: updatedCount,
            rowsSkipped: skippedNames.length,
            rowsErrors: Math.max(1, meta?.rowsErrors ?? 0),
            rowsWarnings: meta?.rowsWarnings ?? 0,
            summaryJson: JSON.stringify({
              error: message,
              openingChunksPosted,
              created: allCreatedItems.length,
              updated: updatedCount,
            }),
            errorReportJson: JSON.stringify({
              failureMessage: message,
              previewErrors: meta?.errorReportJson ?? null,
            }),
          },
        }).catch((updateError) => console.error('[importStock] could not mark import', updateError));
      }
      return err(message);
    };

    try {
    // ProductImport is opened before product writes so a later failure can be
    // marked FAILED/PARTIAL instead of staying PROCESSING. importRunId stays
    // the client key when the form sent one, so a retry replays the same chunks.
    importRecord = await prisma.productImport.create({
      data: {
        businessId,
        uploadedByUserId: user.id,
        fileName: meta?.fileName ?? null,
        status: 'PROCESSING',
        rowsParsed: meta?.rowsParsed ?? incomingRows.length,
        rowsImported: 0,
        rowsUpdated: 0,
        rowsSkipped: 0,
        rowsErrors: 0,
        rowsWarnings: meta?.rowsWarnings ?? 0,
        summaryJson: null,
        errorReportJson: meta?.errorReportJson ?? null,
      },
      select: { id: true },
    });
    const importRunId = normalizedClientImportKey || importRecord.id;

    let categoriesCreated = 0;

    const allCategoryNames = [
      ...new Set(
        [...rowsToCreate, ...rowsForUpdate.map((u) => u.row)]
          .filter((r) => r.category)
          .map(categoryForRow)
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

    const groupIds = new Map<string, string>();
    const divisionIds = new Map<string, string>();
    for (const row of [...rowsToCreate, ...rowsForUpdate.map(item => item.row)]) {
      if (!row.division?.trim() || divisionIds.has(pathKey(row))) continue;
      const division = await createClassificationNode(businessId, 'division', categoryMap.get(categoryForRow(row).toLowerCase())!, row.division!);
      divisionIds.set(pathKey(row), division.id);
      if (row.group?.trim()) {
        const group = await createClassificationNode(businessId, 'group', division.id, row.group);
        groupIds.set(pathKey(row), group.id);
      }
    }
    await runInChunks(rowsForUpdate, PRODUCT_UPDATE_CHUNK_SIZE, async ({ row, productId }) => {
      const categoryName = row.category
        ? categoryForRow(row)
        : '';
      const categoryId = categoryName
        ? categoryMap.get(categoryName.toLowerCase()) ?? null
        : null;
      const barcode = row.barcode || null;
      if (barcode) {
        const conflict = await prisma.product.findFirst({
          where: { businessId, OR: [{ barcode }, { barcodes: { some: { code: barcode } } }], id: { not: productId } },
          select: { id: true },
        });
        if (conflict) throw new Error(`Barcode ${barcode} belongs to another product. No barcode was removed.`);
      }

      await prisma.product.update({
        where: { id: productId },
        data: {
          ...(row.division?.trim() ? { categoryId, divisionId: divisionIds.get(pathKey(row))!, groupId: row.group?.trim() ? groupIds.get(pathKey(row))! : null } : {}),
          sellingPriceBasePence: row.sellingPricePence,
          ...importOptionalProductUpdates(row),
          ...(row.sku ? { sku: row.sku } : {}),
          ...(barcode ? { barcode } : {}),

          ...(row.imageUrl ? { imageUrl: row.imageUrl } : {}),
        },
      });
      // A category-only CSV must not detach an existing group's umbrella.
      // Group assignments are managed explicitly in the product editor.
      if (categoryId && !row.group?.trim()) await prisma.product.updateMany({
        where: { id: productId, businessId, groupId: null, divisionId: null }, data: { categoryId },
      });
      updatedCount++;
    });

    // Helper shared by Step 2 and the result summary
    const rowToBaseCost = (row: ConfirmedImportRow): number => {
      const isQtyInPackUnit = row.packUnitId !== null && row.qtyInUnitId === row.packUnitId;
      const qtyBase = isQtyInPackUnit ? row.quantity * (row.packSize > 1 ? row.packSize : 1) : row.quantity;
      return Math.round(row.costPricePence * qtyBase);
    };

    const toPurchaseLine = (row: ConfirmedImportRow, productId: string) => {
      const isQtyInPackUnit = row.packUnitId !== null && row.qtyInUnitId === row.packUnitId;
      const qtyBase = isQtyInPackUnit ? row.quantity * (row.packSize > 1 ? row.packSize : 1) : row.quantity;
      const dates = readBatchDates(row.productionDate, row.expiryDate);
      if (!dates.ok) throw new Error(dates.message);
      return {
        productId,
        unitId: row.baseUnitId,
        qtyInUnit: qtyBase,
        unitCostPence: row.costPricePence,
        ...(dates.dates.productionDate ? { productionDate: dates.dates.productionDate } : {}),
        ...(dates.dates.expiryDate ? { expiryDate: dates.dates.expiryDate } : {}),
      };
    };


    // Products and their units are created a few hundred rows at a time, each in its
    // own transaction, so a large file is not one 5-second interactive transaction.
    if (rowsToCreate.length > 0) {
      for (let offset = 0; offset < rowsToCreate.length; offset += PRODUCT_CREATE_CHUNK_SIZE) {
      const slice = rowsToCreate.slice(offset, offset + PRODUCT_CREATE_CHUNK_SIZE);
      const productData = await Promise.all(
        slice.map(async (row) => {
          const categoryName = row.category
            ? categoryForRow(row)
            : '';
          const supplierId = await resolveSupplierIdForRow(row);
          return {
            ...(normalizedClientImportKey ? { id: productIdForRow(row) } : {}),
            businessId,
            name: row.name,
            sku: row.sku || null,
            barcode: row.barcode || null,
            groupId: row.group?.trim() ? groupIds.get(pathKey(row))! : null,
            divisionId: row.division?.trim() ? divisionIds.get(pathKey(row))! : null,
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

      await prisma.$transaction(async tx => {
        const createdProducts = await tx.product.createManyAndReturn({ data: productData, select: { id: true, name: true, barcode: true, sku: true } });

        const createdById = new Map(createdProducts.map((p) => [p.id, p.id]));
        const createdByIdentity = new Map(createdProducts.map((p) => [
          `${importNameKey(p.name)}\n${p.barcode ?? ''}\n${(p.sku ?? '').trim().toLowerCase()}`,
          p.id,
        ]));

        // Build all productUnit records — 1 createMany INSERT for the entire set
        const productUnitData: {
          productId: string; unitId: string; isBaseUnit: boolean; conversionToBase: number;
        }[] = [];

        for (const row of slice) {
          const explicitId = normalizedClientImportKey ? productIdForRow(row) : null;
          const productId = (explicitId ? createdById.get(explicitId) : undefined)
            ?? createdByIdentity.get(`${importNameKey(row.name)}\n${row.barcode.trim()}\n${row.sku.trim().toLowerCase()}`);
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
          await tx.productUnit.createMany({ data: productUnitData });
        }
      }, IMPORT_INTERACTIVE_TX);
      }
    }

    const createdItems = allCreatedItems;

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

    const allItems = [...createdItems, ...updateWithStockItems];
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

    if (importMode === 'OPENING_STOCK' && stockItems.length > 0) {
      for (const item of stockItems.filter((i) => i.row.openingFunding === 'SUPPLIER_CREDIT')) {
        if (!(item.row.supplierName ?? '').trim()) {
          return abandonImport(`Opening stock on supplier credit requires a named supplier (${item.row.name}).`, 'FAILED');
        }
      }
    }
    if (importMode === 'PURCHASES' && stockItems.length > 0) {
      for (const item of stockItems.filter((c) => (c.row.paymentStatus ?? 'UNPAID') !== 'PAID')) {
        if (!(item.row.supplierName ?? '').trim()) {
          return abandonImport(`Unpaid purchases require a named supplier (${item.row.name}).`, 'FAILED');
        }
      }
    }

    if (importMode === 'CATALOGUE') {
      accountingEffectSummary.push('Catalogue only — no stock movements, journals, cash or supplier payables.');
    }

    if (importMode === 'OPENING_STOCK' && stockItems.length > 0) {
      const equityItems = stockItems.filter((i) => (i.row.openingFunding ?? 'EQUITY') !== 'SUPPLIER_CREDIT');
      const creditItems = stockItems.filter((i) => i.row.openingFunding === 'SUPPLIER_CREDIT');

      if (equityItems.length > 0) {
        const equityLines = equityItems.map(({ row, productId }) => {
          const isPack =
            !!row.packUnitId &&
            row.qtyInUnitId === row.packUnitId &&
            row.packSize > 1;
          const dates = readBatchDates(row.productionDate, row.expiryDate);
          if (!dates.ok) throw new Error(`${dates.message} (${row.name})`);
          return {
            productId,
            unitId: row.baseUnitId,
            qtyInUnit: isPack ? row.quantity * row.packSize : row.quantity,
            unitCostBasePence: row.costPricePence > 0 ? row.costPricePence : 0,
            ...(dates.dates.productionDate ? { productionDate: dates.dates.productionDate } : {}),
            ...(dates.dates.expiryDate ? { expiryDate: dates.dates.expiryDate } : {}),
          };
        });
        let unvaluedUnits = 0;
        for (let chunkIndex = 0; chunkIndex * OPENING_EQUITY_CHUNK_SIZE < equityLines.length; chunkIndex++) {
          const lines = equityLines.slice(
            chunkIndex * OPENING_EQUITY_CHUNK_SIZE,
            (chunkIndex + 1) * OPENING_EQUITY_CHUNK_SIZE,
          );
          const openingResult = await recordOpeningInventoryOnce({
            businessId,
            storeId: store.id,
            userId: user.id,
            importRunId,
            importMode,
            chunkIndex,
            description: 'Opening stock import — Opening Balance Equity',
            lines,
          });
          openingChunksPosted += 1;
          openingEquityValuePence += openingResult.valuedPence;
          openingStockUnits += openingResult.valuedUnits + openingResult.unvaluedUnits;
          unvaluedUnits += openingResult.unvaluedUnits;
          missingCostCount += openingResult.costReviewProductIds.length;
          costReviewProductIds.push(...openingResult.costReviewProductIds);
          if (openingResult.journalPosted) journalsPosted += 1;
        }
        accountingEffectSummary.push(
          `Opening stock (owner-funded / equity): Dr Inventory / Cr Opening Balance Equity ${openingEquityValuePence}p.`
        );
        if (unvaluedUnits > 0) {
          accountingEffectSummary.push(
            `${unvaluedUnits} unit(s) recorded without cost — stock value and profit remain incomplete.`
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
            return abandonImport('Opening stock on supplier credit requires a named supplier.', journalsPosted > 0 ? 'PARTIAL' : 'FAILED');
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
                batchSource: 'IMPORT',
                acknowledgeHighCost: true,
                idempotencyKey: buildImportChunkKey({
                  businessId,
                  importRunId,
                  mode: importMode,
                  operation: 'opening-credit',
                  supplierKey: group.supplierId,
                  chunkIndex: Math.floor(i / INVOICE_CHUNK),
                }),
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
              sourceDocuments,
              stockMovementType: 'PURCHASE',
              batchSource: 'IMPORT',
              acknowledgeHighCost: true,
              skipCashDrawerRequirement: true,
              idempotencyKey: buildImportChunkKey({
                businessId,
                importRunId,
                mode: importMode,
                operation: 'purchase-paid',
                supplierKey: group.supplierId ?? '__NO_SUPPLIER__',
                chunkIndex: Math.floor(i / INVOICE_CHUNK),
              }),
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
          return abandonImport('Unpaid purchases require a named supplier.', journalsPosted > 0 ? 'PARTIAL' : 'FAILED');
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
              sourceDocuments,
              stockMovementType: 'PURCHASE',
              batchSource: 'IMPORT',
              acknowledgeHighCost: true,
              idempotencyKey: buildImportChunkKey({
                businessId,
                importRunId,
                mode: importMode,
                operation: 'purchase-unpaid',
                supplierKey: group.supplierId,
                chunkIndex: Math.floor(i / INVOICE_CHUNK),
              }),
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

    const chunkFailure = invoiceErrors.length > 0
      ? userFacingImportFailure(new Error(invoiceErrors.join('\n')))
      : null;
    if (chunkFailure) {
      console.error('[importStock] invoice chunk errors (products ARE created):', invoiceErrors);
    }
    supplierLinkSummary.supplierSummaries = [...supplierSummaryMap.values()].sort((a, b) =>
      a.supplierName.localeCompare(b.supplierName),
    );

    const stockUpdatedValuePence =
      importMode === 'CATALOGUE'
        ? 0
        : updateWithStockItems.reduce(
            (sum, { row }) => sum + rowToBaseCost(row),
            0
          );

    const summary = {
      importMode,
      created: createdItems.length,
      updated: updatedCount,
      skipped: skippedNames.length,
      stockUpdated: importMode === 'CATALOGUE' ? 0 : updateWithStockItems.length,
      paidCount,
      unpaidCount,
      openingEquityValuePence,
      openingSupplierCreditValuePence,
      missingCostCount,
      journalsPosted,
      suppliersMatched: supplierResolver.stats.matched,
      suppliersCreated: supplierResolver.stats.created,
      categoriesCreated,
      openingStockUnits,
      accountingEffectSummary,
    };

    if (!importRecord) throw new Error('Import record was not opened.');
    await prisma.productImport.update({
      where: { id: importRecord.id },
      data: {
        status: chunkFailure ? 'PARTIAL' : 'COMPLETED',
        rowsImported: createdItems.length,
        rowsUpdated: updatedCount,
        rowsSkipped: skippedNames.length,
        rowsErrors: chunkFailure ? Math.max(1, meta?.rowsErrors ?? 0) : (meta?.rowsErrors ?? 0),
        rowsWarnings: meta?.rowsWarnings ?? 0,
        summaryJson: JSON.stringify(chunkFailure ? { ...summary, error: chunkFailure } : summary),
        errorReportJson: chunkFailure
          ? JSON.stringify({ failureMessage: chunkFailure, previewErrors: meta?.errorReportJson ?? null })
          : (meta?.errorReportJson ?? null),
      },
    });
    importSettled = true;

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

    revalidatePosCatalog(businessId, store.id);
    revalidateTag('reports');
    revalidateTag(`readiness-${businessId}`);
    revalidateTag('control-portfolio');
    revalidateTag('scale-cockpit');
    const { revalidateImproveRecordsHome } = await import('@/lib/improve-records-revalidate');
    revalidateImproveRecordsHome();

    if (chunkFailure) return err(chunkFailure);

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
      stockUpdated: importMode === 'CATALOGUE' ? 0 : updateWithStockItems.length,
      stockUpdatedValuePence,
      openingStockUnits,
      openingEquityValuePence,
      openingSupplierCreditValuePence,
      missingCostCount,
      costReviewProductIds: [...new Set(costReviewProductIds)],
      journalsPosted,
      suppliersMatched: supplierResolver.stats.matched,
      suppliersCreated: supplierResolver.stats.created,
      categoriesCreated,
      warningsAcknowledged: incomingRows.filter((r) => r.confirmBelowCost).length,
      accountingEffectSummary,
      supplierLinkSummary,
    });
    } catch (error) {
      console.error('[importStock] failed:', error);
      if (importSettled) throw error;
      return abandonImport(
        userFacingImportFailure(error),
        openingChunksPosted > 0 ? 'PARTIAL' : 'FAILED',
      );
    }
  });
}
