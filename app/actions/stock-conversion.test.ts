import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ context: vi.fn(), products: vi.fn(), convert: vi.fn(), inventory: vi.fn() }));
vi.mock('@/lib/prisma', () => ({ prisma: { product: { findMany: mocks.products } } }));
vi.mock('@/lib/action-utils', () => ({
  UserError: class UserError extends Error {},
  requireSelectedStoreContext: mocks.context,
  ok: (data: unknown) => ({ success: true, data }),
  safeAction: async (fn: () => Promise<unknown>) => { try { return await fn(); } catch (error) { return { success: false, error: (error as Error).message }; } },
}));
vi.mock('@/lib/services/stock-conversion', () => ({ createStockConversion: mocks.convert }));
vi.mock('@/lib/cache/pos-tags', () => ({ revalidatePosInventory: mocks.inventory }));
vi.mock('@/lib/reports/cache-revalidation', () => ({ revalidateOwnerDashboardCache: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
import { createStockConversionAction, searchStockConversionProducts } from './stock-conversion';

beforeEach(() => { vi.clearAllMocks(); mocks.context.mockResolvedValue({ user: { id: 'actor' }, businessId: 'tenant', storeId: 'branch' }); mocks.convert.mockResolvedValue({ id: 'receipt', costPence: 50000 }); mocks.products.mockResolvedValue([]); });
describe('conversion action boundaries', () => {
  it('searches only authorised tenant and branch with bounded results', async () => {
    await searchStockConversionProducts('  sugar  ', 'branch');
    expect(mocks.context).toHaveBeenCalledWith(['OWNER','MANAGER'], 'branch');
    expect(mocks.products.mock.calls[0][0]).toMatchObject({ where: { businessId: 'tenant', active: true }, take: 20, select: { inventoryBalances: { where: { storeId: 'branch' } } } });
    await searchStockConversionProducts('a', 'branch');
    expect(mocks.products).toHaveBeenCalledTimes(1);
  });
  it('never writes before server authorisation and confirmation', async () => {
    const form = new FormData(); form.set('storeId','branch');
    expect(await createStockConversionAction(form)).toMatchObject({ success: false });
    expect(mocks.convert).not.toHaveBeenCalled();
    form.set('confirmed','yes'); mocks.context.mockRejectedValue(new Error('Unauthorised'));
    expect(await createStockConversionAction(form)).toMatchObject({ success: false, error: 'Unauthorised' });
    expect(mocks.convert).not.toHaveBeenCalled();
  });
  it('takes tenant/actor from the session and invalidates only its POS inventory', async () => {
    const form = new FormData();
    for (const [k,v] of Object.entries({ confirmed:'yes', storeId:'branch', businessId:'forged', userId:'forged', sourceProductId:'bag',sourceUnitId:'bag-unit',sourceQty:'1.5',destinationProductId:'cups',destinationUnitId:'cup-unit',destinationQty:'95',expectedCostPence:'50000',note:'Counted',idempotencyKey:'once' })) form.set(k,v);
    await createStockConversionAction(form);
    expect(mocks.convert).toHaveBeenCalledWith(expect.objectContaining({ businessId:'tenant', userId:'actor', storeId:'branch', sourceQty:1.5 }));
    expect(mocks.inventory).toHaveBeenCalledWith('tenant','branch');
  });
});
