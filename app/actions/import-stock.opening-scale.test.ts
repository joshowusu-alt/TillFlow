/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildImportChunkKey } from '@/lib/import/import-chunk-identity';
import { IMPORT_STOCK_TIMEOUT_MESSAGE } from '@/lib/import/import-failure';
import { IMPORT_INTERACTIVE_TX, OPENING_EQUITY_CHUNK_SIZE } from '@/lib/import/import-write-budget';
import type { ConfirmedImportRow } from './import-stock';

const ROW_COUNT = 2500;
const BUSINESS_ID = 'biz';
const STORE_ID = 'store';
const RUN_KEY = 'wnp-opening-run';

type State = {
  products: any[];
  units: any[];
  movements: any[];
  balances: any[];
  journals: any[];
  accounts: any[];
  idempotency: any[];
  imports: any[];
};

function emptyState(): State {
  return {
    products: [],
    units: [],
    movements: [],
    balances: [],
    journals: [],
    accounts: [],
    idempotency: [],
    imports: [],
  };
}

function matchesIn(value: unknown, filter: unknown) {
  if (filter && typeof filter === 'object' && filter !== null && 'in' in filter) {
    return (filter as { in: unknown[] }).in.includes(value);
  }
  return value === filter;
}

const harness = vi.hoisted(() => {
  const stateHolder: { current: State } = {
    current: {
      products: [],
      units: [],
      movements: [],
      balances: [],
      journals: [],
      accounts: [],
      idempotency: [],
      imports: [],
    },
  };
  const txOptions: unknown[] = [];
  const fail = { referenceId: null as string | null };
  const state = () => stateHolder.current;
  const db = () => ({
    $transaction: async (work: (tx: unknown) => Promise<unknown>, options?: unknown) => {
      txOptions.push(options);
      const snapshot = structuredClone(state());
      try {
        return await work(db());
      } catch (error) {
        stateHolder.current = snapshot;
        throw error;
      }
    },
    store: {
      findFirst: async ({ where }: { where: { id: string; businessId: string } }) => (
        where.id === STORE_ID && where.businessId === BUSINESS_ID ? { id: STORE_ID } : null
      ),
    },
    unit: { findMany: async () => [], create: async ({ data }: { data: any }) => ({ id: 'unit', ...data }) },
    category: { findMany: async () => [], create: async ({ data }: { data: any }) => ({ id: 'cat', ...data }) },
    supplier: { findMany: async () => [], create: async ({ data }: { data: any }) => ({ id: 'sup', ...data }) },
    productBarcode: { findMany: async () => [] },
    product: {
      findMany: async ({ where }: { where?: { businessId?: string; barcode?: { not: null } } }) => state().products.filter((product) => {
        if (where?.businessId && product.businessId !== where.businessId) return false;
        if (where?.barcode && 'not' in where.barcode && product.barcode == null) return false;
        return true;
      }),
      findFirst: async () => null,
      update: async () => ({}),
      updateMany: async () => ({ count: 1 }),
      createManyAndReturn: async ({ data }: { data: any[] }) => {
        const created = data.map((row) => ({ ...row, barcodes: [] }));
        state().products.push(...created);
        return created.map((product) => ({
          id: product.id,
          name: product.name,
          barcode: product.barcode,
          sku: product.sku,
        }));
      },
    },
    productUnit: {
      findMany: async ({ where }: { where: { productId: any; unitId?: any } }) => {
        const units = state().units.filter((unit) => matchesIn(unit.productId, where.productId) && (where.unitId == null || matchesIn(unit.unitId, where.unitId)));
        return units.map((unit) => ({
          ...unit,
          product: state().products.find((product) => product.id === unit.productId) ?? { id: unit.productId, businessId: BUSINESS_ID, defaultCostBasePence: 0 },
        }));
      },
      findFirst: async ({ where }: { where: { productId: string; conversionToBase?: number } }) => (
        state().units.find((unit) => unit.productId === where.productId && (where.conversionToBase == null || unit.conversionToBase === where.conversionToBase)) ?? null
      ),
      createMany: async ({ data }: { data: any[] }) => {
        state().units.push(...data);
        return { count: data.length };
      },
    },
    productImport: {
      create: async ({ data }: { data: any }) => {
        const row = { id: `import-${state().imports.length + 1}`, ...data };
        state().imports.push(row);
        return { id: row.id };
      },
      update: async ({ where, data }: { where: { id: string }; data: any }) => {
        const row = state().imports.find((item) => item.id === where.id);
        if (!row) throw new Error(`missing import ${where.id}`);
        Object.assign(row, data);
        return row;
      },
    },
    account: {
      findMany: async ({ where }: { where: { businessId: string; code?: { in: string[] } } }) => state().accounts.filter((account) => (
        account.businessId === where.businessId && (!where.code || where.code.in.includes(account.code))
      )),
      upsert: async ({ where, create }: { where: { businessId_code: { businessId: string; code: string } }; create: any }) => {
        const existing = state().accounts.find((account) => account.businessId === where.businessId_code.businessId && account.code === where.businessId_code.code);
        if (existing) return existing;
        const created = { id: `acct_${create.code}`, ...create };
        state().accounts.push(created);
        return created;
      },
    },
    inventoryBalance: {
      findMany: async ({ where }: { where: { storeId: string; productId: { in: string[] } } }) => state().balances.filter((balance) => (
        balance.storeId === where.storeId && where.productId.in.includes(balance.productId)
      )),
      upsert: async ({ where, update, create }: { where: { storeId_productId: { storeId: string; productId: string } }; update: any; create: any }) => {
        const key = where.storeId_productId;
        const existing = state().balances.find((balance) => balance.storeId === key.storeId && balance.productId === key.productId);
        if (existing) {
          Object.assign(existing, update);
          return existing;
        }
        const created = { ...create };
        state().balances.push(created);
        return created;
      },
    },
    stockBatch: { createMany: async () => ({ count: 0 }) },
    stockMovement: {
      findFirst: async ({ where }: { where: { storeId: string; referenceType: string; referenceId: string } }) => state().movements.find((movement) => (
        movement.storeId === where.storeId && movement.referenceType === where.referenceType && movement.referenceId === where.referenceId
      )) ?? null,
      createMany: async ({ data }: { data: any[] }) => {
        const referenceId = data[0]?.referenceId;
        if (fail.referenceId && referenceId === fail.referenceId) {
          throw new Error('Invalid `prisma.$transaction()` invocation: Transaction already closed. The timeout for this transaction was 5000 ms, however 5400 ms passed since the start of the transaction.');
        }
        state().movements.push(...data);
        return { count: data.length };
      },
    },
    journalEntry: {
      create: async ({ data }: { data: any }) => {
        const journal = {
          id: `je-${state().journals.length + 1}`,
          businessId: data.businessId,
          description: data.description,
          referenceType: data.referenceType,
          referenceId: data.referenceId,
          lines: data.lines.createMany.data,
        };
        state().journals.push(journal);
        return journal;
      },
    },
    moneyIdempotency: {
      findUnique: async ({ where }: { where: { businessId_key: { businessId: string; key: string } } }) => state().idempotency.find((row) => (
        row.businessId === where.businessId_key.businessId && row.key === where.businessId_key.key
      )) ?? null,
      create: async ({ data }: { data: any }) => {
        state().idempotency.push(data);
        return data;
      },
    },
  });
  return { stateHolder, txOptions, fail, db };
});

vi.mock('@/lib/prisma', () => ({ prisma: harness.db() }));
vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }));
vi.mock('@/lib/action-utils', () => ({
  requireSelectedStoreContext: vi.fn(async () => ({
    businessId: BUSINESS_ID,
    storeId: STORE_ID,
    user: { id: 'owner', name: 'Owner', role: 'OWNER', email: 'owner@example.invalid', businessId: BUSINESS_ID },
  })),
  safeAction: async (fn: () => Promise<unknown>) => {
    try {
      return await fn();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('prisma') || /\bP\d{4}\b/.test(message)) {
        return { success: false, error: 'Something went wrong saving your data. Please try again or contact support.' };
      }
      return { success: false, error: message };
    }
  },
  ok: (data: unknown) => ({ success: true, data }),
  err: (error: string) => ({ success: false, error }),
  UserError: class UserError extends Error {},
}));
vi.mock('@/lib/reliability/operational-store-cookie', () => ({ readOperationalStoreCookie: () => STORE_ID }));
vi.mock('@/lib/services/purchases', () => ({ createPurchase: vi.fn() }));
vi.mock('@/lib/services/product-classification', () => ({ createClassificationNode: vi.fn(async () => ({ id: 'node' })) }));
vi.mock('@/lib/audit', () => ({ audit: vi.fn(async () => undefined) }));
vi.mock('@/lib/cache/pos-tags', () => ({ revalidatePosCatalog: vi.fn() }));
vi.mock('@/lib/improve-records-revalidate', () => ({ revalidateImproveRecordsHome: vi.fn() }));

import { importStockAction } from './import-stock';

function openingRow(index: number): ConfirmedImportRow {
  return {
    name: `Opening item ${index}`,
    sku: `SKU-${index}`,
    barcode: String(1_000_000_000_000 + index),
    category: '',
    sellingPricePence: 500,
    costPricePence: 100 + (index % 7),
    costPriceProvided: true,
    quantity: 1 + (index % 5),
    baseUnitId: 'piece',
    packUnitId: null,
    packSize: 0,
    qtyInUnitId: 'piece',
    duplicateAction: 'create',
    openingFunding: 'EQUITY',
  };
}

const rows = Array.from({ length: ROW_COUNT }, (_, index) => openingRow(index));
const meta = { importMode: 'OPENING_STOCK' as const, clientImportKey: RUN_KEY, fileName: 'wnp.xlsx' };
const expectedValue = rows.reduce((sum, row) => sum + row.costPricePence * row.quantity, 0);
const expectedQty = rows.reduce((sum, row) => sum + row.quantity, 0);
const chunkCount = Math.ceil(ROW_COUNT / OPENING_EQUITY_CHUNK_SIZE);

const ledger = () => harness.stateHolder.current;

function accountCode(accountId: string) {
  return ledger().accounts.find((account) => account.id === accountId)?.code;
}

function expectBalancedOpeningJournals() {
  expect(ledger().journals.length).toBeGreaterThanOrEqual(1);
  expect(ledger().journals).toHaveLength(chunkCount);
  let debit = 0;
  let credit = 0;
  for (const journal of ledger().journals) {
    const journalDebit = journal.lines.reduce((sum: number, line: { debitPence: number }) => sum + line.debitPence, 0);
    const journalCredit = journal.lines.reduce((sum: number, line: { creditPence: number }) => sum + line.creditPence, 0);
    expect(journalDebit).toBe(journalCredit);
    expect(journalDebit).toBeGreaterThan(0);
    expect(journal.lines.map((line: { accountId: string }) => accountCode(line.accountId)).sort()).toEqual(['1200', '3200']);
    expect(journal.referenceType).toBe('OPENING_BALANCE_INVENTORY');
    debit += journalDebit;
    credit += journalCredit;
  }
  expect(debit).toBe(expectedValue);
  expect(credit).toBe(expectedValue);
}

beforeEach(() => {
  harness.stateHolder.current = emptyState();
  harness.txOptions.length = 0;
  harness.fail.referenceId = null;
});

describe('opening stock import at catalogue scale', () => {
  it('posts every unit and one balanced journal per chunk for 2,500 opening rows', async () => {
    const result = await importStockAction(rows, meta);
    expect(result).toMatchObject({
      success: true,
      data: {
        created: ROW_COUNT,
        openingStockUnits: expectedQty,
        openingEquityValuePence: expectedValue,
        journalsPosted: chunkCount,
      },
    });
    expect(ledger().products).toHaveLength(ROW_COUNT);
    expect(ledger().movements).toHaveLength(ROW_COUNT);
    expect(ledger().movements.reduce((sum, movement) => sum + movement.qtyBase, 0)).toBe(expectedQty);
    expect(ledger().balances.reduce((sum, balance) => sum + balance.qtyOnHandBase, 0)).toBe(expectedQty);
    expectBalancedOpeningJournals();
    expect(ledger().imports[0]).toMatchObject({ status: 'COMPLETED', rowsImported: ROW_COUNT });
    expect(harness.txOptions.filter(Boolean)).toEqual(
      expect.arrayContaining([IMPORT_INTERACTIVE_TX]),
    );
    expect(harness.txOptions.every((options) => options && (options as { timeout: number }).timeout === IMPORT_INTERACTIVE_TX.timeout)).toBe(true);
    const references = [...new Set(ledger().movements.map((movement) => movement.referenceId))].sort();
    expect(references).toEqual(
      Array.from({ length: chunkCount }, (_, index) => `${RUN_KEY}-equity-${index}`).sort(),
    );
  }, 60_000);

  it('finishes a retry after a mid-run timeout without double-posting', async () => {
    harness.fail.referenceId = `${RUN_KEY}-equity-2`;
    const failed = await importStockAction(rows, meta);
    expect(failed).toMatchObject({ success: false, error: IMPORT_STOCK_TIMEOUT_MESSAGE });
    expect(String((failed as { error?: string }).error)).not.toMatch(/prisma|P\d{4}|5000 ms/);
    expect(ledger().imports[0]).toMatchObject({ status: 'PARTIAL', rowsImported: ROW_COUNT });
    expect(JSON.parse(ledger().imports[0].errorReportJson).failureMessage).toBe(IMPORT_STOCK_TIMEOUT_MESSAGE);
    expect(ledger().movements).toHaveLength(OPENING_EQUITY_CHUNK_SIZE * 2);
    expect(ledger().journals).toHaveLength(2);
    expect(ledger().idempotency).toHaveLength(2);
    const postedBeforeRetry = ledger().movements.map((movement) => `${movement.referenceId}:${movement.productId}`);

    harness.fail.referenceId = null;
    const retried = await importStockAction(rows, meta);
    expect(retried).toMatchObject({
      success: true,
      data: {
        openingStockUnits: expectedQty,
        openingEquityValuePence: expectedValue,
        journalsPosted: chunkCount,
      },
    });
    expect(ledger().products).toHaveLength(ROW_COUNT);
    expect(ledger().movements).toHaveLength(ROW_COUNT);
    expect(ledger().balances.reduce((sum, balance) => sum + balance.qtyOnHandBase, 0)).toBe(expectedQty);
    expectBalancedOpeningJournals();
    expect(ledger().idempotency).toHaveLength(chunkCount);
    for (const chunkIndex of [0, 1]) {
      const key = buildImportChunkKey({
        businessId: BUSINESS_ID,
        importRunId: RUN_KEY,
        mode: 'OPENING_STOCK',
        operation: 'opening-equity',
        supplierKey: 'equity',
        chunkIndex,
      });
      expect(ledger().idempotency.filter((row) => row.key === key)).toHaveLength(1);
      expect(ledger().movements.filter((movement) => movement.referenceId === `${RUN_KEY}-equity-${chunkIndex}`)).toHaveLength(OPENING_EQUITY_CHUNK_SIZE);
    }
    for (const marker of postedBeforeRetry) {
      expect(ledger().movements.filter((movement) => `${movement.referenceId}:${movement.productId}` === marker)).toHaveLength(1);
    }
    expect(ledger().imports.map((row) => row.status)).toEqual(['PARTIAL', 'COMPLETED']);
  }, 60_000);
});
