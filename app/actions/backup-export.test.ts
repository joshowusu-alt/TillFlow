import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ transaction: vi.fn(), context: vi.fn(), audit: vi.fn(), postgres: vi.fn(), owner: vi.fn() }));
vi.mock('@/lib/prisma', () => ({ prisma: { $transaction: mocks.transaction, user: { findFirst: mocks.owner } } }));
vi.mock('next/headers', () => ({ cookies: async () => ({ getAll: () => [], delete: vi.fn() }) }));
vi.mock('@/lib/database-runtime', () => ({ isPostgresRuntimeEnv: mocks.postgres }));
vi.mock('@/lib/audit', () => ({ audit: mocks.audit }));
vi.mock('@/lib/action-utils', () => ({
  withBusinessContext: mocks.context,
  safeAction: (work: () => unknown) => work(),
  ok: (data: unknown) => ({ success: true, data }),
  err: (error: string) => ({ success: false, error }),
}));
import { exportDatabaseAction, importDatabaseAction } from './backup';
let tx: Record<string, Record<string, ReturnType<typeof vi.fn>>>;
beforeEach(() => {
  vi.clearAllMocks();
  tx = new Proxy({}, { get: (target: typeof tx, name: string) => target[name] ??= {
    findMany: vi.fn().mockResolvedValue([]), findUnique: vi.fn().mockResolvedValue({ id: 'business' }),
    count: vi.fn().mockResolvedValue(0), deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    updateMany: vi.fn().mockResolvedValue({ count: 0 }), update: vi.fn().mockResolvedValue({}), create: vi.fn().mockResolvedValue({}),
  } });
  mocks.context.mockResolvedValue({ businessId: 'business', user: { id: 'owner', name: 'Owner', role: 'OWNER', email: 'owner@test.com' } });
  mocks.owner.mockResolvedValue({ passwordHash: 'mock-hash' });
  mocks.postgres.mockReturnValue(true);
  mocks.audit.mockResolvedValue(undefined);
  mocks.transaction.mockImplementation(async work => work(tx));
});
it('exports every table through one repeatable-read transaction, including the business', async () => {
  const result = await exportDatabaseAction();
  expect(result.success).toBe(true);
  expect(mocks.context).toHaveBeenCalledWith(['OWNER'], { requireWrite: false });
  expect(mocks.transaction).toHaveBeenCalledTimes(1);
  expect(mocks.transaction.mock.calls[0][1]).toMatchObject({ isolationLevel: 'RepeatableRead' });
  expect(tx.business.findUnique).toHaveBeenCalledWith({ where: { id: 'business' } });
  expect(tx.salesInvoice.findMany).toHaveBeenCalled();
  expect(tx.stockMovement.findMany).toHaveBeenCalled();
  expect(tx.inventoryBalance.findMany).toHaveBeenCalled();
  expect(tx.purchaseReturnCredit.findMany).toHaveBeenCalledWith({ where: { businessId: 'business' } });
  expect(tx.supplierCreditSettlement.findMany).toHaveBeenCalledWith({ where: { businessId: 'business' } });
});
it('uses SQLite serializable snapshots for local exports', async () => {
  mocks.postgres.mockReturnValue(false);
  tx.product.findMany.mockResolvedValue([{ id: 'p', businessId: 'business', barcode: 'PRIMARY' }]);
  const result = await exportDatabaseAction();
  if (!result.success) throw new Error('Export failed');
  expect(result.data.productBarcodes).toEqual([{ businessId: 'business', productId: 'p', code: 'PRIMARY' }]);
  expect(mocks.transaction.mock.calls[0][1].isolationLevel).toBe('Serializable');
});
it('preserves the business shortage approval threshold in exports', async () => {
  tx.business.findUnique.mockResolvedValue({ id: 'business', shiftCloseApprovalThresholdPence: 7500 });
  const result = await exportDatabaseAction();
  if (!result.success) throw new Error('Export failed');
  expect(result.data.business.shiftCloseApprovalThresholdPence).toBe(7500);
});
it.each([[7500, 7500], [undefined, 5000]])('restores threshold %s or uses the default %i', async (saved, expected) => {
  tx.business.findUnique.mockResolvedValue({ id: 'business', shiftCloseApprovalThresholdPence: saved });
  tx.user.findMany.mockResolvedValue([{ id: 'owner', businessId: 'business', name: 'Owner', role: 'OWNER', email: 'owner@test.com', active: true }]);
  const result = await exportDatabaseAction();
  if (!result.success) throw new Error('Export failed');
  expect(await importDatabaseAction(result.data)).toMatchObject({ success: true });
  expect(tx.business.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ shiftCloseApprovalThresholdPence: expected }) }));
});
it('does not return a partial backup or report success when stock evidence cannot be read', async () => {
  tx.stockMovement.findMany.mockRejectedValueOnce(new Error('Evidence read failed'));
  await expect(exportDatabaseAction()).rejects.toThrow('Evidence read failed');
  expect(mocks.audit).not.toHaveBeenCalled();
});
