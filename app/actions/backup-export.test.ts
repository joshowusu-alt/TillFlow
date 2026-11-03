import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ transaction: vi.fn(), context: vi.fn(), audit: vi.fn(), postgres: vi.fn() }));
vi.mock('@/lib/prisma', () => ({ prisma: { $transaction: mocks.transaction } }));
vi.mock('@/lib/database-runtime', () => ({ isPostgresRuntimeEnv: mocks.postgres }));
vi.mock('@/lib/audit', () => ({ audit: mocks.audit }));
vi.mock('@/lib/action-utils', () => ({
  withBusinessContext: mocks.context,
  safeAction: (work: () => unknown) => work(),
  ok: (data: unknown) => ({ success: true, data }),
  err: (error: string) => ({ success: false, error }),
}));
import { exportDatabaseAction } from './backup';
let tx: Record<string, { findMany: ReturnType<typeof vi.fn>; findUnique: ReturnType<typeof vi.fn> }>;
beforeEach(() => {
  vi.clearAllMocks();
  tx = new Proxy({}, { get: (target: typeof tx, name: string) => target[name] ??= {
    findMany: vi.fn().mockResolvedValue([]), findUnique: vi.fn().mockResolvedValue({ id: 'business' }),
  } });
  mocks.context.mockResolvedValue({ businessId: 'business', user: { id: 'owner', name: 'Owner', role: 'OWNER' } });
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
it('does not return a partial backup or report success when stock evidence cannot be read', async () => {
  tx.stockMovement.findMany.mockRejectedValueOnce(new Error('Evidence read failed'));
  await expect(exportDatabaseAction()).rejects.toThrow('Evidence read failed');
  expect(mocks.audit).not.toHaveBeenCalled();
});
