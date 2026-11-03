import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  products: [] as any[], units: [] as any[],
  opening: vi.fn(), purchase: vi.fn(), classification: vi.fn(),
  db: {
    product: { findMany: vi.fn(), findFirst: vi.fn(), createManyAndReturn: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    productUnit: { findMany: vi.fn(), findFirst: vi.fn(), createMany: vi.fn() },
    productBarcode: { findMany: vi.fn() },
    category: { findMany: vi.fn(), create: vi.fn() },
    supplier: { findMany: vi.fn(), create: vi.fn() },
    unit: { findMany: vi.fn(), create: vi.fn() },
    productImport: { create: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock('@/lib/prisma', () => ({ prisma: mocks.db }));
vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }));
vi.mock('@/lib/action-utils', () => ({
  requireSelectedStoreContext: vi.fn(async () => ({ businessId: 'biz', storeId: 'store', user: { id: 'owner', name: 'Owner', role: 'OWNER' } })),
  safeAction: async (fn: () => unknown) => { try { return await fn(); } catch (e) { return { success: false, error: (e as Error).message }; } },
  ok: (data: unknown) => ({ success: true, data }), err: (error: string) => ({ success: false, error }),
}));
vi.mock('@/lib/reliability/operational-store-cookie', () => ({ readOperationalStoreCookie: vi.fn() }));
vi.mock('@/lib/services/purchases', () => ({ createPurchase: mocks.purchase }));
vi.mock('@/lib/services/opening-inventory', () => ({ recordOpeningInventory: mocks.opening }));
vi.mock('@/lib/services/product-classification', () => ({ createClassificationNode: mocks.classification }));
vi.mock('@/lib/services/products', () => ({ buildProductUnitCreates: (base: string, pack: string, size: number) => [
  { unitId: base, isBaseUnit: true, conversionToBase: 1 }, ...(pack ? [{ unitId: pack, isBaseUnit: false, conversionToBase: size }] : []),
] }));
vi.mock('@/lib/accounting', () => ({ ensureChartOfAccounts: vi.fn() }));
vi.mock('@/lib/audit', () => ({ audit: vi.fn(async () => {}) }));
vi.mock('@/lib/cache/pos-tags', () => ({ revalidatePosCatalog: vi.fn() }));
vi.mock('@/lib/improve-records-revalidate', () => ({ revalidateImproveRecordsHome: vi.fn() }));
vi.mock('@/lib/services/money-idempotency', () => ({
  findMoneyIdempotency: vi.fn(async () => null), insertMoneyIdempotency: vi.fn(), isPrismaUniqueConstraintOn: vi.fn(() => false),
  replayOrConflict: vi.fn(), parseIdempotencyResult: JSON.parse,
  hashCanonicalParts: (parts: unknown[]) => JSON.stringify(parts),
}));

import { importStockAction, type ConfirmedImportRow } from './import-stock';

const row = (patch: Partial<ConfirmedImportRow> = {}): ConfirmedImportRow => ({
  name: 'Book', sku: '', barcode: '', category: '', sellingPricePence: 5000, costPricePence: 0,
  costPriceProvided: false, quantity: 3, baseUnitId: 'piece', packUnitId: null, packSize: 0,
  qtyInUnitId: 'piece', duplicateAction: 'update', ...patch,
});
const meta = { importMode: 'CATALOGUE' as const, clientImportKey: 'run-1' };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.products = [{ id: 'book', name: 'Book', sku: '', barcode: null, barcodes: [] }];
  mocks.units = [{ productId: 'book', unitId: 'piece', isBaseUnit: true, conversionToBase: 1 }];
  mocks.db.product.findMany.mockImplementation(async () => mocks.products);
  mocks.db.product.findFirst.mockResolvedValue(null);
  mocks.db.product.createManyAndReturn.mockImplementation(async ({ data }) => { mocks.products.push(...data); return data; });
  mocks.db.product.update.mockResolvedValue({}); mocks.db.product.updateMany.mockResolvedValue({ count: 1 });
  mocks.db.productUnit.findMany.mockImplementation(async ({ where }) => mocks.units.filter(u => u.productId === where.productId));
  mocks.db.productUnit.createMany.mockImplementation(async ({ data }) => { mocks.units.push(...data); return { count: data.length }; });
  mocks.db.category.findMany.mockResolvedValue([{ id: 'cat', name: 'Books' }]);
  mocks.db.supplier.findMany.mockResolvedValue([]); mocks.db.unit.findMany.mockResolvedValue([]);
  mocks.db.productBarcode.findMany.mockResolvedValue([]);
  mocks.db.productImport.create.mockResolvedValue({ id: 'import' });
  mocks.db.productImport.update.mockResolvedValue({});
  mocks.db.$transaction.mockImplementation(async fn => fn(mocks.db));
  mocks.classification.mockImplementation(async (_biz, kind) => ({ id: kind, name: kind }));
  mocks.opening.mockResolvedValue({ valuedPence: 0, valuedUnits: 0, unvaluedUnits: 3, costReviewProductIds: ['book'], journalPosted: false });
});

describe('import server reliability', () => {
  it('Skip never updates details, units, classification or stock', async () => {
    const result = await importStockAction([row({ duplicateAction: 'skip', category: 'Books', division: 'Bibles', group: 'Study' })], { ...meta, importMode: 'OPENING_STOCK' });
    expect(result).toMatchObject({ success: true, data: { skipped: 1, updated: 0, stockUpdated: 0, openingStockUnits: 0 } });
    expect(mocks.db.product.update).not.toHaveBeenCalled();
    expect(mocks.db.productUnit.createMany).not.toHaveBeenCalled();
    expect(mocks.classification).not.toHaveBeenCalled();
    expect(mocks.opening).not.toHaveBeenCalled(); expect(mocks.purchase).not.toHaveBeenCalled();
  });

  it('preserves blank optional fields and does not silently change classifications', async () => {
    expect(await importStockAction([row()], meta)).toMatchObject({ success: true });
    expect(mocks.db.product.update.mock.calls[0][0].data).toEqual({ sellingPriceBasePence: 5000 });
    expect(mocks.db.product.updateMany).not.toHaveBeenCalled();
    mocks.db.product.update.mockClear();
    await importStockAction([row({ costPriceProvided: true, storefrontPublished: false, reorderPointBase: 0 })], meta);
    expect(mocks.db.product.update.mock.calls[0][0].data).toMatchObject({ defaultCostBasePence: 0, storefrontPublished: false, reorderPointBase: 0 });
  });

  it('saves a division without requiring a group', async () => {
    const result = await importStockAction([row({ category: 'Books', division: 'Bibles' })], meta);
    expect(result).toMatchObject({ success: true });
    expect(mocks.classification).toHaveBeenCalledExactlyOnceWith('biz', 'division', 'cat', 'Bibles');
    expect(mocks.db.product.update.mock.calls[0][0].data).toMatchObject({ categoryId: 'cat', divisionId: 'division', groupId: null });
  });

  it('uses barcode identity when names are shared', async () => {
    mocks.products.push({ id: 'book2', name: 'Book', sku: 'B', barcode: '002', barcodes: [] });
    mocks.units.push({ productId: 'book2', unitId: 'piece', isBaseUnit: true, conversionToBase: 1 });
    expect(await importStockAction([row({ barcode: '002' })], meta)).toMatchObject({ success: true });
    expect(mocks.db.product.update.mock.calls[0][0].where).toEqual({ id: 'book2' });
  });

  it('blocks incompatible saved pack conversions before updating products', async () => {
    const result = await importStockAction([row({ packUnitId: 'carton', packSize: 12, qtyInUnitId: 'carton' })], meta);
    expect(result).toMatchObject({ success: false, error: expect.stringContaining('Pack configuration differs') });
    expect(mocks.db.product.update).not.toHaveBeenCalled();
    expect(mocks.db.category.create).not.toHaveBeenCalled();
  });

  it('converts cartons to base units using the verified saved pack size', async () => {
    mocks.units.push({ productId: 'book', unitId: 'carton', isBaseUnit: false, conversionToBase: 12 });
    const result = await importStockAction([row({ packUnitId: 'carton', packSize: 12, qtyInUnitId: 'carton', costPricePence: 200, costPriceProvided: true })], { ...meta, importMode: 'OPENING_STOCK' });
    expect(result).toMatchObject({ success: true });
    expect(mocks.opening.mock.calls[0][0].lines).toEqual([{ productId: 'book', unitId: 'piece', qtyInUnit: 36, unitCostBasePence: 200 }]);
  });

  it('creates products with stable IDs and resumes the same submission', async () => {
    mocks.products = []; mocks.units = [];
    const input = row({ duplicateAction: 'create' });
    const first = await importStockAction([input], meta);
    const second = await importStockAction([input], meta);
    expect(first).toMatchObject({ success: true, data: { created: 1 } });
    expect(second).toMatchObject({ success: true, data: { created: 1 } });
    expect(mocks.db.product.createManyAndReturn).toHaveBeenCalledTimes(1);
    expect(mocks.db.productUnit.createMany).toHaveBeenCalledTimes(1);
  });
});
