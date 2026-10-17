import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ context: vi.fn(), business: vi.fn(), update: vi.fn(), audit: vi.fn() }));
vi.mock('@/lib/action-utils', () => ({ formAction: (fn: () => unknown) => fn(), withBusinessContext: mocks.context, UserError: class UserError extends Error {} }));
vi.mock('@/lib/prisma', () => ({ prisma: { business: { findUnique: mocks.business, update: mocks.update } } }));
vi.mock('@/lib/audit', () => ({ audit: mocks.audit }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
import { updateStorefrontSettingsAction } from './online-storefront';
beforeEach(() => {
  vi.clearAllMocks();
  mocks.context.mockResolvedValue({ user: { id: 'test-owner', name: 'Test Owner', role: 'OWNER' }, businessId: 'test-shop' });
  mocks.business.mockResolvedValue({ id: 'test-shop', name: 'Test Shop', plan: 'PRO', storeMode: 'SINGLE_STORE', smsNotificationsEnabled: true, smsSenderId: 'SHOP' });
  mocks.update.mockResolvedValue({});
  mocks.audit.mockResolvedValue(undefined);
});
it('omits SMS changes when an older collapsed form sends no SMS controls', async () => {
  await updateStorefrontSettingsAction(new FormData());
  const data = mocks.update.mock.calls[0][0].data;
  expect(data).not.toHaveProperty('smsNotificationsEnabled');
  expect(data).not.toHaveProperty('smsSenderId');
});
it('supports an explicit Off choice and records the submitted preference', async () => {
  const data = new FormData(); data.set('smsSettingsIncluded', '1'); data.set('smsSenderId', '');
  await updateStorefrontSettingsAction(data);
  expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ smsNotificationsEnabled: false, smsSenderId: null }) }));
  expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ details: expect.objectContaining({ smsSettingsSubmitted: true, smsNotificationsEnabled: false }) }));
});
it('supports an explicit On choice including an older checked checkbox', async () => {
  const data = new FormData(); data.set('smsNotificationsEnabled', 'on'); data.set('smsSenderId', ' NEW SHOP ');
  await updateStorefrontSettingsAction(data);
  expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ smsNotificationsEnabled: true, smsSenderId: 'NEW SHOP' }) }));
});
