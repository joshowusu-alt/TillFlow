import { beforeEach, describe, expect, it, vi } from 'vitest';
import { saveQuickPurchase, setFoodPurchasePhotoRequired } from './quick-purchases';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), storeAuth: vi.fn(), save: vi.fn(), update: vi.fn(), audit: vi.fn(),
}));
vi.mock('@/lib/action-utils', async () => ({
  ...await vi.importActual<typeof import('@/lib/action-utils')>('@/lib/action-utils'),
  withBusinessContext: mocks.auth,
  requireSelectedStoreContext: mocks.storeAuth,
}));
vi.mock('@/lib/prisma', () => ({
  prisma: { business: { findUniqueOrThrow: vi.fn().mockResolvedValue({ timezone: 'Africa/Accra', businessCategory: 'FOOD_DISHES' }), update: mocks.update } },
}));
vi.mock('@/lib/services/purchases', () => ({ createPurchase: mocks.save }));
vi.mock('@/lib/audit', () => ({ audit: mocks.audit }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));

const input = {
  storeId: 'store', payment: 'Pay later' as const, supplierId: '', dueDate: '',
  purchaseDate: '', supplierInvoiceNumber: '', discount: '', additionalCost: '', document: '',
  tillId: '', key: 'quick-purchase-1',
  rows: [{ productId: 'bread', unitId: 'piece', quantity: '3', cost: '5', expiry: '' }],
};
describe('quick purchase action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ businessId: 'business' });
    mocks.storeAuth.mockResolvedValue({ businessId: 'business', storeId: 'store', user: { id: 'owner', role: 'OWNER' } });
    mocks.audit.mockResolvedValue(undefined);
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
