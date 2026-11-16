import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createQuickPurchaseProduct, saveQuickPurchase, setFoodPurchasePhotoRequired } from './quick-purchases';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), storeAuth: vi.fn(), save: vi.fn(), update: vi.fn(), audit: vi.fn(), tills: vi.fn(),
}));
vi.mock('@/lib/action-utils', async () => ({
  ...await vi.importActual<typeof import('@/lib/action-utils')>('@/lib/action-utils'),
  withBusinessContext: mocks.auth,
  requireSelectedStoreContext: mocks.storeAuth,
}));
vi.mock('@/lib/prisma', () => ({
  prisma: { business: { findUniqueOrThrow: vi.fn().mockResolvedValue({ timezone: 'Africa/Accra', businessCategory: 'FOOD_DISHES' }), update: mocks.update }, till: { findMany: mocks.tills }, product: { findFirst: vi.fn().mockResolvedValue({ name: 'Tea bread' }) } },
}));
vi.mock('@/lib/services/purchases', () => ({ createPurchase: mocks.save }));
vi.mock('@/lib/audit', () => ({ audit: mocks.audit }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));

const input = {
  storeId: 'store', payment: 'Pay later' as const, supplierId: '', dueDate: '',
  cashSource: '' as const, supplierInvoiceNumber: '', discount: '', additionalCost: '', document: '',
  tillId: '', key: 'quick-purchase-1',
  rows: [{ productId: 'bread', unitId: 'piece', quantity: '3', cost: '5', expiry: '' }],
};
describe('quick purchase action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ businessId: 'business' });
    mocks.storeAuth.mockResolvedValue({ businessId: 'business', storeId: 'store', user: { id: 'owner', role: 'OWNER' } });
    mocks.audit.mockResolvedValue(undefined);
    mocks.tills.mockResolvedValue([]);
  });

  it('requires an owner or manager to change the setting', async () => {
    mocks.auth.mockRejectedValue(new Error('Access denied'));
    expect(await setFoodPurchasePhotoRequired(true)).toMatchObject({ success: false });
    expect(mocks.auth).toHaveBeenCalledWith(['OWNER', 'MANAGER']);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('persists the requirement on the authenticated business', async () => {
    expect(await setFoodPurchasePhotoRequired(true)).toMatchObject({ success: true });
    expect(mocks.update).toHaveBeenCalledWith({ where: { id: 'business' }, data: { requirePurchasePhoto: true } });
  });

  it('rejects Pay later without a supplier before calling the posting service', async () => {
    expect(await saveQuickPurchase(input)).toEqual({ success: false, error: "Choose who you're paying later" });
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it('refuses a cashier at both purchase action entry points', async () => {
    mocks.storeAuth.mockImplementation(async (roles: string[]) => {
      if (!roles.includes('CASHIER')) throw new Error('Access denied');
      return { businessId: 'business', storeId: 'store', user: { id: 'cashier', role: 'CASHIER' } };
    });
    expect(await saveQuickPurchase(input)).toMatchObject({ success: false, error: 'Access denied' });
    expect(await createQuickPurchaseProduct({ name: 'Flour', unitId: 'piece', ingredient: true, sellingPrice: '' }, 'store'))
      .toMatchObject({ success: false, error: 'Access denied' });
    expect(mocks.storeAuth).toHaveBeenNthCalledWith(1, ['OWNER', 'MANAGER'], 'store');
    expect(mocks.storeAuth).toHaveBeenNthCalledWith(2, ['OWNER', 'MANAGER'], 'store');
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it('names the item when rejecting zero cost', async () => {
    expect(await saveQuickPurchase({ ...input, payment: 'Cash', rows: [{ ...input.rows[0], cost: '0.00' }] }))
      .toEqual({ success: false, error: 'Add a cost for Tea bread' });
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it('requires a cash source if the branch has no open till', async () => {
    expect(await saveQuickPurchase({ ...input, payment: 'Cash' }))
      .toEqual({ success: false, error: 'Choose where the cash came from' });
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it('ignores outside cash and uses the open till if one is available', async () => {
    mocks.tills.mockResolvedValue([{ id: 'open-till' }]);
    mocks.save.mockResolvedValue({ id: 'purchase', totalPence: 1500 });
    await saveQuickPurchase({ ...input, payment: 'Cash', cashSource: 'OWNER_CAPITAL' });
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ tillId: 'open-till', cashSource: undefined }));
  });

  it.each(['OWNER_CAPITAL', 'BUSINESS_CASH'] as const)('passes authenticated funding details for %s', async cashSource => {
    mocks.save.mockResolvedValue({ id: 'purchase', totalPence: 1500 });
    const result = await saveQuickPurchase({ ...input, payment: 'Cash', cashSource });
    expect(result).toMatchObject({ success: true, data: { cashSource } });
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({
      tillId: undefined, cashSource,
      fundingOwnerId: cashSource === 'OWNER_CAPITAL' ? 'owner' : undefined,
      cashHolderId: cashSource === 'BUSINESS_CASH' ? 'owner' : undefined,
    }));
  });

  it('uses the existing paid transfer path for MoMo', async () => {
    mocks.save.mockResolvedValue({ id: 'purchase', totalPence: 1500 });
    expect(await saveQuickPurchase({ ...input, payment: 'MoMo' })).toMatchObject({ success: true });
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({
      quickPurchase: expect.objectContaining({ paidWith: 'TRANSFER' }),
      paymentStatus: 'PAID', supplierId: undefined,
      lines: [expect.objectContaining({ productId: 'bread', qtyInUnit: 3, unitCostPence: 500 })],
    }));
  });
});
