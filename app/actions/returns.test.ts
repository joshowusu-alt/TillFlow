import { beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteFoodSaleAction } from './returns';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), selectedBusiness: vi.fn(), invoice: vi.fn(), reversal: vi.fn(), alert: vi.fn(), audit: vi.fn(),
}));
vi.mock('@/lib/action-utils', async () => ({
  ...await vi.importActual<typeof import('@/lib/action-utils')>('@/lib/action-utils'),
  withBusinessContext: mocks.auth,
  requireSelectedStoreContext: mocks.selectedBusiness,
}));
vi.mock('@/lib/prisma', () => ({ prisma: { salesInvoice: { findFirst: mocks.invoice } } }));
vi.mock('@/lib/services/returns', () => ({ createSalesReturn: mocks.reversal }));
vi.mock('@/app/actions/stock-alerts', () => ({ sendVoidReturnAlert: mocks.alert }));
vi.mock('@/lib/audit', () => ({ audit: mocks.audit }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));

const foodSale = {
  storeId: 'branch',
  business: { businessCategory: 'FOOD_DISHES' },
  payments: [{ method: 'CASH', amountPence: 2000, status: 'CONFIRMED' }],
};

describe('deleteFoodSaleAction', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: 'owner', role: 'OWNER' }, businessId: 'business' });
    mocks.invoice.mockResolvedValue(foodSale);
    mocks.reversal.mockResolvedValue({ id: 'reversal' });
    mocks.alert.mockResolvedValue(undefined);
  });

  it.each(['MANAGER', 'CASHIER'])('refuses %s before looking up the sale', async role => {
    mocks.auth.mockImplementation(async (allowed: string[]) => {
      if (!allowed.includes(role)) throw new Error('Access denied');
      return { user: { id: 'staff', role }, businessId: 'business' };
    });
    expect(await deleteFoodSaleAction('sale', 'MISTAKE', '')).toEqual({ success: false, error: 'Access denied' });
    expect(mocks.invoice).not.toHaveBeenCalled();
    expect(mocks.reversal).not.toHaveBeenCalled();
  });

  it('rejects mixed confirmed payments before starting a reversal', async () => {
    mocks.invoice.mockResolvedValue({
      ...foodSale, payments: [...foodSale.payments, { method: 'MOBILE_MONEY', amountPence: 400, status: 'CONFIRMED' }],
    });
    expect(await deleteFoodSaleAction('sale', 'MISTAKE', '')).toEqual({
      success: false, error: 'This sale was paid more than one way. Use Return instead.',
    });
    expect(mocks.reversal).not.toHaveBeenCalled();
  });

  it.each([['TEST_SALE', 0], ['MISTAKE', 1]] as const)('audits %s and sends the expected alert', async (reason, alerts) => {
    expect(await deleteFoodSaleAction('sale', reason, '')).toMatchObject({ success: true });
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'SALE_VOID', details: expect.objectContaining({ reasonCode: reason }),
    }));
    expect(mocks.alert).toHaveBeenCalledTimes(alerts);
  });
});
