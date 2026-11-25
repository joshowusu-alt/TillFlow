import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ update: vi.fn(), context: vi.fn(), snapshot: vi.fn(), audit: vi.fn() }));
vi.mock('@/lib/action-utils', () => ({ formAction: (fn: () => unknown) => fn(), withBusinessContext: mocks.context }));
vi.mock('@/lib/prisma', () => ({ prisma: { business: { update: mocks.update } } }));
vi.mock('@/lib/billing-db-compat', () => ({ findBusinessCommercialSnapshot: mocks.snapshot }));
vi.mock('@/lib/audit', () => ({ audit: mocks.audit }));
vi.mock('@/lib/accounting', () => ({ ensureChartOfAccounts: vi.fn() }));
vi.mock('@/lib/services/online-orders', () => ({ invalidateStorefrontBusinessCache: vi.fn() }));
vi.mock('@/lib/cache/pos-tags', () => ({ checkoutContextTag: vi.fn(), revalidatePosTillShiftTags: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
import { updateBusinessAction } from './settings';
beforeEach(() => {
  vi.clearAllMocks();
  mocks.context.mockResolvedValue({ businessId: 'biz', user: { id: 'owner', name: 'Owner', role: 'OWNER' } });
  mocks.snapshot.mockResolvedValue({ business: { mode: 'SIMPLE', storeMode: 'SINGLE_STORE' } });
  mocks.audit.mockResolvedValue(undefined);
});
it.each([['75.25', 7525], ['0', 0]])('saves threshold %s as %i pence', async (value, expected) => {
  const form = new FormData(); form.set('name', 'Shop'); form.set('shiftCloseApprovalThresholdAmount', value);
  await updateBusinessAction(form);
  expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ shiftCloseApprovalThresholdPence: expected }) }));
});
it('does not reset the threshold if an older form omits it', async () => {
  const form = new FormData(); form.set('name', 'Shop');
  await updateBusinessAction(form);
  expect(mocks.update.mock.calls[0][0].data).not.toHaveProperty('shiftCloseApprovalThresholdPence');
});
it.each(['-10', 'NaN', 'Infinity', ''])('rejects invalid threshold %s', async (value) => {
  const form = new FormData(); form.set('shiftCloseApprovalThresholdAmount', value);
  await expect(updateBusinessAction(form)).rejects.toThrow('valid manager PIN shortage threshold');
  expect(mocks.update).not.toHaveBeenCalled();
});
