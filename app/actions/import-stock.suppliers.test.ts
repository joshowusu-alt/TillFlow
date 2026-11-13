import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PRODUCT_CREATE_CHUNK_SIZE } from '@/lib/import/import-write-budget';
import { clearImportSupplierClaimsForTests } from '@/lib/import/import-suppliers';
import type { ConfirmedImportRow } from './import-stock';

type StoredSupplier = { id: string; name: string; businessId: string; createdAt: Date };

const state = vi.hoisted(() => ({
  suppliers: [] as StoredSupplier[],
  products: [] as Array<Record<string, unknown>>,
  units: [] as Array<{ productId: string; unitId: string; isBaseUnit: boolean; conversionToBase: number }>,
}));

const mocks = vi.hoisted(() => ({
  purchase: vi.fn(),
  opening: vi.fn(),
  db: {
    product: { findMany: vi.fn(), findFirst: vi.fn(), createManyAndReturn: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    productUnit: { findMany: vi.fn(), findFirst: vi.fn(), createMany: vi.fn() },
    productBarcode: { findMany: vi.fn() },
    category: { findMany: vi.fn(), create: vi.fn() },
    supplier: { findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
    unit: { findMany: vi.fn(), create: vi.fn() },
    productImport: { create: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock('@/lib/prisma', () => ({ prisma: mocks.db }));
vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }));
vi.mock('@/lib/action-utils', () => ({
  requireSelectedStoreContext: vi.fn(async () => ({ businessId: 'biz', storeId: 'store', user: { id: 'owner', name: 'Owner', role: 'OWNER' } })),
  safeAction: async (fn: () => unknown) => { try { return await fn(); } catch (error) { return { success: false, error: (error as Error).message }; } },
  ok: (data: unknown) => ({ success: true, data }),
  err: (error: string) => ({ success: false, error }),
}));
vi.mock('@/lib/reliability/operational-store-cookie', () => ({ readOperationalStoreCookie: vi.fn() }));
vi.mock('@/lib/services/purchases', () => ({ createPurchase: mocks.purchase }));
vi.mock('@/lib/services/opening-inventory', () => ({ recordOpeningInventory: mocks.opening }));
vi.mock('@/lib/services/product-classification', () => ({ createClassificationNode: vi.fn() }));
vi.mock('@/lib/accounting', () => ({ ensureChartOfAccounts: vi.fn() }));
vi.mock('@/lib/audit', () => ({ audit: vi.fn(async () => {}) }));
vi.mock('@/lib/cache/pos-tags', () => ({ revalidatePosCatalog: vi.fn() }));
vi.mock('@/lib/improve-records-revalidate', () => ({ revalidateImproveRecordsHome: vi.fn() }));
vi.mock('@/lib/services/money-idempotency', () => ({
  findMoneyIdempotency: vi.fn(async () => null),
  insertMoneyIdempotency: vi.fn(async () => undefined),
  isPrismaUniqueConstraintOn: vi.fn(() => false),
  replayOrConflict: vi.fn(),
  parseIdempotencyResult: JSON.parse,
  hashCanonicalParts: (parts: unknown[]) => JSON.stringify(parts),
}));

import { importStockAction } from './import-stock';

const row = (patch: Partial<ConfirmedImportRow>): ConfirmedImportRow => ({
  name: 'Book',
  sku: '',
  barcode: '',
  category: '',
  sellingPricePence: 5000,
  costPricePence: 200,
  costPriceProvided: true,
  quantity: 1,
  baseUnitId: 'piece',
  packUnitId: null,
  packSize: 0,
  qtyInUnitId: 'piece',
  duplicateAction: 'create',
  ...patch,
});

function createdProducts() {
  return mocks.db.product.createManyAndReturn.mock.calls.flatMap(
    (call) => (call[0] as { data: Array<{ name: string; preferredSupplierId: string | null }> }).data,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  clearImportSupplierClaimsForTests();
  state.suppliers = [];
  state.products = [];
  state.units = [];
  mocks.db.product.findMany.mockImplementation(async () => state.products);
  mocks.db.product.findFirst.mockResolvedValue(null);
  mocks.db.product.createManyAndReturn.mockImplementation(async ({ data }: { data: Array<{ id?: string; name: string; barcode?: string | null; sku?: string | null }> }) => {
    const created = data.map((item) => ({ ...item, barcodes: [] as const }));
    state.products.push(...created);
    return created.map((item) => ({ id: item.id, name: item.name, barcode: item.barcode ?? null, sku: item.sku ?? null }));
  });
  mocks.db.product.update.mockResolvedValue({});
  mocks.db.product.updateMany.mockResolvedValue({ count: 1 });
  mocks.db.productUnit.findMany.mockImplementation(async ({ where }: { where: { productId: string } }) => (
    state.units.filter((unit) => unit.productId === where.productId)
  ));
  mocks.db.productUnit.findFirst.mockResolvedValue(null);
  mocks.db.productUnit.createMany.mockImplementation(async ({ data }: { data: typeof state.units }) => {
    state.units.push(...data);
    return { count: data.length };
  });
  mocks.db.productBarcode.findMany.mockResolvedValue([]);
  mocks.db.category.findMany.mockResolvedValue([]);
  mocks.db.supplier.findMany.mockImplementation(async ({ where }: { where?: { businessId?: string } } = {}) => {
    const rows = where?.businessId
      ? state.suppliers.filter((supplier) => supplier.businessId === where.businessId)
      : state.suppliers;
    return rows.map((supplier) => ({ id: supplier.id, name: supplier.name, createdAt: supplier.createdAt }));
  });
  mocks.db.supplier.create.mockImplementation(async ({ data }: { data: { businessId: string; name: string } }) => {
    await new Promise((resolve) => setTimeout(resolve, 15));
    const created: StoredSupplier = {
      id: `sup-${state.suppliers.length + 1}`,
      name: data.name,
      businessId: data.businessId,
      createdAt: new Date(),
    };
    state.suppliers.push(created);
    return { id: created.id };
  });
  mocks.db.supplier.update.mockRejectedValue(new Error('import must not rename suppliers'));
  mocks.db.unit.findMany.mockResolvedValue([]);
  mocks.db.productImport.create.mockResolvedValue({ id: 'import-1' });
  mocks.db.productImport.update.mockResolvedValue({});
  mocks.db.$transaction.mockImplementation(async (fn: (tx: typeof mocks.db) => Promise<unknown>) => fn(mocks.db));
  mocks.purchase.mockResolvedValue({});
  mocks.opening.mockResolvedValue({ valuedPence: 0, valuedUnits: 1, unvaluedUnits: 0, costReviewProductIds: [], journalPosted: false });
});

describe('import supplier dedupe', () => {
  it('creates one supplier for many rows, including across create chunks and name variants', async () => {
    const ministry = (index: number) => {
      const variant = index % 3;
      const supplierName = variant === 0
        ? '  MINISTRY   PASTORS CHRISTIAN BOOKSHOP '
        : variant === 1
          ? 'ministry pastors christian bookshop'
          : 'Ministry\tPastors\tChristian\tBookshop';
      return row({ name: `Ministry book ${index}`, supplierName });
    };
    const rows = [
      ...Array.from({ length: PRODUCT_CREATE_CHUNK_SIZE }, (_, index) => ministry(index)),
      row({ name: 'Catalogue only', supplierName: '   ' }),
      ministry(PRODUCT_CREATE_CHUNK_SIZE),
      ministry(PRODUCT_CREATE_CHUNK_SIZE + 1),
      row({ name: 'Steps book 1', supplierName: '  STEPS   TO CHRIST ENT. ' }),
      row({ name: 'Steps book 2', supplierName: 'steps to christ ent.' }),
      row({ name: 'Steps book 3', supplierName: 'STEPS\tTO\tCHRIST\tENT.' }),
    ];

    const result = await importStockAction(rows, { importMode: 'CATALOGUE', clientImportKey: 'run-suppliers', fileName: 'books.xlsx' });

    expect(result).toMatchObject({ success: true, data: { created: rows.length, suppliersCreated: 2 } });
    expect(mocks.db.supplier.create).toHaveBeenCalledTimes(2);
    expect(mocks.db.supplier.create.mock.calls.map((call) => call[0].data.name).sort()).toEqual([
      'MINISTRY PASTORS CHRISTIAN BOOKSHOP',
      'STEPS TO CHRIST ENT.',
    ]);
    expect(mocks.db.product.createManyAndReturn).toHaveBeenCalledTimes(2);
    const saved = createdProducts();
    expect(new Set(saved.filter((item) => item.name.startsWith('Ministry')).map((item) => item.preferredSupplierId))).toEqual(new Set(['sup-1']));
    expect(new Set(saved.filter((item) => item.name.startsWith('Steps')).map((item) => item.preferredSupplierId))).toEqual(new Set(['sup-2']));
    expect(saved.find((item) => item.name === 'Catalogue only')?.preferredSupplierId).toBeNull();
    expect(state.suppliers).toHaveLength(2);
  }, 20_000);

  it('reuses an existing supplier in this business when the sheet name only differs by case or spaces', async () => {
    state.suppliers.push(
      { id: 'newer', name: 'ministry pastors christian bookshop', businessId: 'biz', createdAt: new Date('2026-11-11') },
      { id: 'older', name: 'MINISTRY  PASTORS   CHRISTIAN BOOKSHOP', businessId: 'biz', createdAt: new Date('2024-01-01') },
      { id: 'foreign', name: 'MINISTRY PASTORS CHRISTIAN BOOKSHOP', businessId: 'other', createdAt: new Date('2020-01-01') },
    );
    const result = await importStockAction([
      row({ name: 'Book A', supplierName: '  ministry   pastors christian bookshop ' }),
      row({ name: 'Book B', supplierName: 'MINISTRY\tPASTORS\tCHRISTIAN\tBOOKSHOP' }),
    ], { importMode: 'CATALOGUE', clientImportKey: 'run-existing' });

    expect(result).toMatchObject({ success: true, data: { suppliersCreated: 0, suppliersMatched: 1 } });
    expect(mocks.db.supplier.create).not.toHaveBeenCalled();
    expect(mocks.db.supplier.update).not.toHaveBeenCalled();
    expect(createdProducts().map((item) => item.preferredSupplierId)).toEqual(['older', 'older']);
    expect(state.suppliers.map((supplier) => supplier.name)).toContain('MINISTRY  PASTORS   CHRISTIAN BOOKSHOP');
  });

  it('creates no further suppliers when the same names are imported again', async () => {
    const firstRows = [
      row({ name: 'Book A', supplierName: 'Steps To Christ Ent.' }),
      row({ name: 'Book B', supplierName: '  steps   to christ ent. ' }),
    ];
    const meta = { importMode: 'CATALOGUE' as const, clientImportKey: 'run-again' };
    const first = await importStockAction(firstRows, meta);
    expect(first).toMatchObject({ success: true, data: { suppliersCreated: 1 } });

    const second = await importStockAction([
      row({ name: 'Book C', supplierName: 'STEPS TO CHRIST ENT.' }),
      row({ name: 'Book D', supplierName: 'steps\tto\tchrist\tent.' }),
    ], { ...meta, clientImportKey: 'run-again-more' });
    expect(second).toMatchObject({ success: true, data: { created: 2, suppliersCreated: 0, suppliersMatched: 1 } });

    const replay = await importStockAction(firstRows, meta);
    expect(replay).toMatchObject({ success: true, data: { suppliersCreated: 0 } });
    expect(mocks.db.supplier.create).toHaveBeenCalledTimes(1);
    expect(mocks.db.product.createManyAndReturn).toHaveBeenCalledTimes(2);
    expect(state.suppliers).toHaveLength(1);
    expect(createdProducts().every((item) => item.preferredSupplierId === 'sup-1')).toBe(true);
  });

  it('posts opening-stock supplier credit against one supplier for every row', async () => {
    const rows = Array.from({ length: 8 }, (_, index) => row({
      name: `Credit book ${index}`,
      supplierName: index % 2 === 0 ? '  MINISTRY   PASTORS CHRISTIAN BOOKSHOP ' : 'ministry pastors christian bookshop',
      openingFunding: 'SUPPLIER_CREDIT',
      quantity: 2,
    }));
    const result = await importStockAction(rows, {
      importMode: 'OPENING_STOCK',
      clientImportKey: 'run-credit',
      fileName: 'opening.xlsx',
    });

    expect(result).toMatchObject({ success: true, data: { created: 8, suppliersCreated: 1 } });
    expect(state.suppliers).toHaveLength(1);
    expect(mocks.purchase).toHaveBeenCalledTimes(1);
    expect(mocks.purchase.mock.calls[0][0]).toMatchObject({
      supplierId: 'sup-1',
      paymentStatus: 'UNPAID',
      stockMovementType: 'OPENING',
    });
    expect(mocks.purchase.mock.calls[0][0].lines).toHaveLength(8);
    expect(new Set(createdProducts().map((item) => item.preferredSupplierId))).toEqual(new Set(['sup-1']));
  });
});
