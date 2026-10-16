import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  tx: { business: { create: vi.fn() }, store: { create: vi.fn() }, till: { createMany: vi.fn() }, user: { create: vi.fn() }, unit: { findMany: vi.fn(), createMany: vi.fn() }, account: { createMany: vi.fn() }, customer: { create: vi.fn() }, session: { create: vi.fn() } },
  transaction: vi.fn(), session: vi.fn(), existing: vi.fn(), cookie: vi.fn(), bootstrap: vi.fn(), reminder: vi.fn(),
}));
vi.mock('@/lib/prisma', () => ({ prisma: { $transaction: mocks.transaction, user: { findUnique: mocks.existing }, session: { create: mocks.session } } }));
vi.mock('next/headers', () => ({ headers: () => new Headers(), cookies: () => ({ set: mocks.cookie }) }));
vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); } }));
vi.mock('@/lib/security/register-throttle', () => ({ checkRegisterRateLimit: async () => ({ blocked: false }) }));
vi.mock('@/lib/control-plane-bootstrap', () => ({ ensureControlPlaneBusinessBootstrap: mocks.bootstrap }));
vi.mock('@/lib/subscription-reminders', () => ({ enqueueSubscriptionReminder: mocks.reminder }));
vi.mock('bcryptjs', () => ({ default: { hash: async () => 'test-hash' } }));
import { register } from './register';
import { CHART_OF_ACCOUNTS } from '@/lib/accounting';
function form(overrides: Record<string, string | undefined> = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries({ businessName: 'Fixture shop', ownerName: 'Owner', email: 'owner@example.com', password: 'abcdef', currency: 'GHS', ...overrides })) { if (value !== undefined) data.set(key, value); }
  return data;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.existing.mockResolvedValue(null);
  mocks.tx.business.create.mockResolvedValue({ id: 'business', name: 'Fixture shop', plan: 'STARTER' });
  mocks.tx.store.create.mockResolvedValue({ id: 'store' });
  mocks.tx.user.create.mockResolvedValue({ id: 'owner', email: 'owner@example.com' });
  mocks.tx.unit.findMany.mockResolvedValue([]);
  mocks.tx.account.createMany.mockResolvedValue({ count: CHART_OF_ACCOUNTS.length });
  mocks.transaction.mockImplementation(async (callback: any) => callback(mocks.tx));
  mocks.reminder.mockResolvedValue(undefined);
});
describe('new business registration', () => {
  it('creates both tills and the complete canonical chart inside the transaction before login', async () => {
    await expect(register(form())).rejects.toThrow('REDIRECT:/getting-started');
    expect(mocks.tx.till.createMany.mock.calls[0][0].data).toHaveLength(2);
    expect(mocks.tx.account.createMany.mock.calls[0][0].data).toEqual(CHART_OF_ACCOUNTS.map(account => ({ businessId: 'business', ...account })));
    expect(mocks.tx.customer.create).toHaveBeenCalled();
    expect(mocks.tx.session.create).toHaveBeenCalledOnce();
  });
  it('propagates essential setup failure and never creates a login session', async () => {
    mocks.tx.account.createMany.mockRejectedValueOnce(new Error('setup unavailable'));
    await expect(register(form())).rejects.toThrow('setup unavailable');
    expect(mocks.tx.session.create).not.toHaveBeenCalled();
    expect(mocks.bootstrap).not.toHaveBeenCalled();
  });
  it('handles a concurrent email uniqueness conflict without logging in', async () => {
    mocks.transaction.mockRejectedValueOnce({ code: 'P2002', meta: { target: ['email'] } });
    await expect(register(form())).rejects.toThrow('REDIRECT:/register?error=exists');
    expect(mocks.cookie).not.toHaveBeenCalled();
  });
  it.each([{ email: 'not-an-email' }, { currency: 'INVALID' }, { businessName: 'x'.repeat(121) }])('rejects invalid hidden fields before database writes: %j', async invalid => {
    await expect(register(form(invalid))).rejects.toThrow('REDIRECT:/register?error=invalid');
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
