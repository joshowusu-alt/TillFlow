import { beforeEach, expect, it, vi } from 'vitest';
const db = vi.hoisted(() => ({
  business: { findUnique: vi.fn() }, product: { findMany: vi.fn(), updateMany: vi.fn() },
  category: { findFirst: vi.fn() }, productDivision: { findFirst: vi.fn() }, productGroup: { findFirst: vi.fn() },
  productUnit: { updateMany: vi.fn() }, auditLog: { createMany: vi.fn() }, $transaction: vi.fn(),
}));
vi.mock('@/lib/prisma', () => ({ prisma: db }));
import { applyBulkPricing, previewBulkPricing } from './bulk-pricing';
import type { BulkPricingInput } from '@/lib/products/bulk-pricing';
const input: BulkPricingInput = { categoryId: '', divisionId: '', groupId: '', search: '', basis: 'SELLING_PRICE', operation: 'INCREASE', method: 'PERCENT', value: '20', decimals: 2, units: 'BASE_ONLY' };
const actor = { businessId: 'business', id: 'owner', name: 'Owner', role: 'OWNER' };
const unit = (id: string, conversionToBase: number, price: number | null = null, cost: number | null = null) => ({ id, conversionToBase, isBaseUnit: conversionToBase === 1, sellingPricePence: price, defaultCostPence: cost, unit: { name: id } });
const product = (patch = {}) => ({ id: 'p1', name: 'Book', publisher: '', edition: '', updatedAt: new Date('2026-10-20'), version: 1, sellingPriceBasePence: 1000, defaultCostBasePence: 600,
  productUnits: [unit('copy', 1, 1000), unit('pack', 3, 2700), unit('inherited', 2)], ...patch });
beforeEach(() => {
  vi.resetAllMocks();
  db.business.findUnique.mockResolvedValue({ plan: 'GROWTH', mode: 'ADVANCED', storeMode: 'SINGLE_STORE' });
  db.product.findMany.mockResolvedValue([product()]);
  for (const m of [db.category, db.productDivision, db.productGroup]) m.findFirst.mockResolvedValue({ id: 'ok' });
  db.product.updateMany.mockResolvedValue({ count: 1 }); db.productUnit.updateMany.mockResolvedValue({ count: 1 }); db.auditLog.createMany.mockResolvedValue({ count: 1 });
  db.$transaction.mockImplementation(async fn => fn(db));
});
async function request(patch = {}) {
  const preview = await previewBulkPricing(actor.businessId, input);
  return { input, fingerprint: preview.fingerprint, selectedIds: ['p1'], acknowledgeWarnings: false, reason: 'Supplier price increase', ...patch };
}
it('preserves explicit pack prices and previews inherited pack changes in base-only mode', async () => {
  const p = await previewBulkPricing(actor.businessId, input);
  expect(p.rows[0]).toMatchObject({ baseBefore: 1000, baseAfter: 1200 });
  expect(p.rows[0].prices.map(p => [p.id, p.before, p.after, p.afterOverride])).toEqual([['copy', 1000, 1200, 1200], ['pack', 2700, 2700, 2700], ['inherited', 2000, 2400, null]]);
  expect(db.product.findMany.mock.calls[0][0]).toMatchObject({ where: { businessId: 'business', active: true }, take: 201 });
});
it('uses a SQLite-compatible text search without widening the product or barcode scope', async () => {
  await previewBulkPricing('business', { ...input, search: 'Book' });
  expect(db.product.findMany.mock.calls[0][0].where).toMatchObject({ businessId: 'business', active: true, OR: [
    { name: { contains: 'Book' } }, { publisher: { contains: 'Book' } }, { edition: { contains: 'Book' } }, { barcode: 'Book' }, { barcodes: { some: { code: 'Book' } } },
  ] });
  expect(db.product.findMany.mock.calls[0][0].where.OR[0].name).not.toHaveProperty('mode');
});
it('uses each unit cost for cost-plus pricing and exposes markup rather than margin', async () => {
  db.product.findMany.mockResolvedValue([product({ productUnits: [unit('copy', 1), unit('pack', 3, 2700, 1500)] })]);
  const p = await previewBulkPricing(actor.businessId, { ...input, basis: 'CATALOGUE_COST', units: 'ALL_UNITS' });
  expect(p.rows[0].baseAfter).toBe(720);
  expect(p.rows[0].prices[1]).toMatchObject({ before: 2700, after: 1800, afterOverride: 1800 });
});
it('rounds each unit independently and makes an inherited pack explicit when necessary', async () => {
  db.product.findMany.mockResolvedValue([product({ sellingPriceBasePence: 149, productUnits: [unit('pack', 3)] })]);
  const p = await previewBulkPricing(actor.businessId, { ...input, value: '1', decimals: 0, units: 'ALL_UNITS' });
  expect(p.rows[0].baseAfter).toBe(200);
  expect(p.rows[0].prices[0]).toMatchObject({ before: 447, after: 500, afterOverride: 500 });
});
it('blocks cost-based missing-cost and invalid-price products; warns when selling-price mode lacks cost', async () => {
  db.product.findMany.mockResolvedValue([product({ defaultCostBasePence: 0 })]);
  expect((await previewBulkPricing(actor.businessId, { ...input, basis: 'CATALOGUE_COST' })).rows[0].error).toMatch(/cost is missing/);
  expect((await previewBulkPricing(actor.businessId, input)).rows[0].warnings.join()).toMatch(/cost not recorded/);
  expect((await previewBulkPricing(actor.businessId, { ...input, method: 'AMOUNT', value: '100', operation: 'DECREASE' })).rows[0].error).toMatch(/zero or negative/);
});
it('refuses foreign and mismatched filters, downgraded plans and overlarge batches', async () => {
  db.category.findFirst.mockResolvedValue(null);
  await expect(previewBulkPricing('business', { ...input, categoryId: 'foreign' })).rejects.toThrow(/category/);
  expect(db.product.findMany).not.toHaveBeenCalled();
  db.category.findFirst.mockResolvedValue({ id: 'category' }); db.productGroup.findFirst.mockResolvedValue(null);
  await expect(previewBulkPricing('business', { ...input, categoryId: 'cat', divisionId: 'division', groupId: 'foreign' })).rejects.toThrow(/group/);
  expect(db.productGroup.findFirst.mock.calls[0][0].where).toMatchObject({ businessId: 'business', divisionId: 'division', division: { businessId: 'business', categoryId: 'cat' } });
  db.business.findUnique.mockResolvedValue({ plan: 'STARTER' });
  await expect(previewBulkPricing('business', input)).rejects.toThrow(/Growth and Pro/);
  db.business.findUnique.mockResolvedValue({ plan: 'GROWTH' }); db.product.findMany.mockResolvedValue(Array.from({ length: 201 }, () => product()));
  await expect(previewBulkPricing('business', input)).rejects.toThrow(/More than 200/);
});
it('rejects a stale or modified preview before writing any prices', async () => {
  const r = await request();
  db.product.findMany.mockResolvedValue([product({ defaultCostBasePence: 700 })]);
  await expect(applyBulkPricing(actor, r)).rejects.toThrow(/changed since/);
  expect(db.product.updateMany).not.toHaveBeenCalled();
  db.product.findMany.mockResolvedValue([product()]);
  await expect(applyBulkPricing(actor, { ...r, input: { ...input, value: '50' } })).rejects.toThrow(/changed since/);
});
it('validates selected IDs, warning acknowledgement, reason and role on the server', async () => {
  const r = await request();
  for (const selectedIds of [['foreign'], ['p1', 'p1'], []]) await expect(applyBulkPricing(actor, { ...r, selectedIds })).rejects.toThrow();
  await expect(applyBulkPricing({ ...actor, role: 'CASHIER' }, r)).rejects.toThrow(/access/);
  await expect(applyBulkPricing(actor, { ...r, reason: ' ' })).rejects.toThrow(/reason/);
  db.product.findMany.mockResolvedValue([product({ defaultCostBasePence: 2000 })]);
  const warnings = await request();
  await expect(applyBulkPricing(actor, warnings)).rejects.toThrow(/acknowledge/);
  expect(db.product.updateMany).not.toHaveBeenCalled();
  await applyBulkPricing(actor, { ...warnings, acknowledgeWarnings: true });
  expect(db.product.updateMany).toHaveBeenCalledOnce();
});
it('updates only selected prices and commits before/after audit records in the serializable transaction', async () => {
  db.product.findMany.mockResolvedValue([product(), product({ id: 'p2' })]);
  await applyBulkPricing(actor, await request());
  expect(db.$transaction.mock.calls[0][1]).toEqual({ isolationLevel: 'Serializable', timeout: 20000 });
  expect(db.product.updateMany).toHaveBeenCalledOnce();
  expect(db.product.updateMany.mock.calls[0][0]).toMatchObject({ where: { id: 'p1', businessId: 'business', active: true, version: 1, sellingPriceBasePence: 1000, defaultCostBasePence: 600 }, data: { sellingPriceBasePence: 1200, version: { increment: 1 } } });
  expect(db.productUnit.updateMany).toHaveBeenCalledOnce();
  const audit = db.auditLog.createMany.mock.calls[0][0].data[0];
  expect(audit).toMatchObject({ businessId: 'business', entityId: 'p1', userId: 'owner', action: 'PRICE_CHANGE', reason: 'Supplier price increase' });
  expect(JSON.parse(audit.beforeState).sellingPriceBasePence).toBe(1000);
  expect(JSON.parse(audit.afterState).sellingPriceBasePence).toBe(1200);
  expect(JSON.parse(audit.details).catalogueBaseCostPence).toBe(600);
});
it('aborts when optimistic product or unit guards fail; audit failures propagate for transaction rollback', async () => {
  const r = await request();
  db.product.updateMany.mockResolvedValueOnce({ count: 0 });
  await expect(applyBulkPricing(actor, r)).rejects.toThrow(/changed during/);
  expect(db.auditLog.createMany).not.toHaveBeenCalled();
  db.productUnit.updateMany.mockResolvedValueOnce({ count: 0 });
  await expect(applyBulkPricing(actor, r)).rejects.toThrow(/selling unit changed/);
  db.auditLog.createMany.mockRejectedValueOnce(new Error('audit unavailable'));
  await expect(applyBulkPricing(actor, r)).rejects.toThrow('audit unavailable');
});
it('rejects repeating a successful batch against the changed product version', async () => {
  const r = await request(); await applyBulkPricing(actor, r);
  db.product.findMany.mockResolvedValue([product({ sellingPriceBasePence: 1200, version: 2 })]);
  await expect(applyBulkPricing(actor, r)).rejects.toThrow(/changed since/);
  expect(db.product.updateMany).toHaveBeenCalledOnce();
});
