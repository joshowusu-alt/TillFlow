import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ findFirst: vi.fn(), update: vi.fn(), invalidate: vi.fn(), revalidate: vi.fn(), context: vi.fn() }));
vi.mock('@/lib/prisma', () => ({ prisma: { user: { findFirst: mocks.findFirst, update: mocks.update } } }));
vi.mock('@/lib/action-utils', () => ({
  withBusinessContext: mocks.context,
  formAction: async (fn: () => Promise<unknown>) => fn(),
  err: (error: string) => ({ success: false, error }),
}));
vi.mock('@/lib/audit', () => ({ audit: () => Promise.resolve() }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }));
vi.mock('next/navigation', () => ({ redirect: () => { throw new Error('redirect'); } }));
vi.mock('@/lib/services/users', () => ({ invalidateUserSessions: mocks.invalidate }));
import { toggleUserActiveAction } from './users';
const form = (active = 'false') => { const f = new FormData(); f.set('userId', 'cashier'); f.set('active', active); return f; };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.context.mockResolvedValue({ user: { id: 'owner', role: 'OWNER' }, businessId: 'business' });
  mocks.findFirst.mockResolvedValue({ id: 'cashier', name: 'Fictional cashier', active: true });
  mocks.update.mockResolvedValue({}); mocks.invalidate.mockResolvedValue(undefined);
});
describe('explicit user activation state', () => {
  it('replayed deactivation remains inactive and invalidates sessions', async () => {
    await expect(toggleUserActiveAction(form())).rejects.toThrow('redirect');
    mocks.findFirst.mockResolvedValue({ id: 'cashier', name: 'Fictional cashier', active: false });
    await expect(toggleUserActiveAction(form())).rejects.toThrow('redirect');
    expect(mocks.update.mock.calls.map(([args]) => args.data.active)).toEqual([false, false]);
    expect(mocks.invalidate).toHaveBeenCalledTimes(2);
    expect(mocks.revalidate).toHaveBeenCalledWith('/users');
    expect(mocks.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'cashier', businessId: 'business' } }));
    expect(mocks.context).toHaveBeenCalledWith(['OWNER']);
  });
  it('explicit activation is also stable on replay', async () => {
    await expect(toggleUserActiveAction(form('true'))).rejects.toThrow('redirect');
    expect(mocks.update).toHaveBeenCalledWith({ where: { id: 'cashier' }, data: { active: true } });
    expect(mocks.invalidate).not.toHaveBeenCalled();
  });
  it('rejects missing or malformed desired state before writes', async () => {
    await toggleUserActiveAction(form(''));
    await toggleUserActiveAction(form('on'));
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it('does not modify another tenant or deactivate the owner', async () => {
    mocks.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'owner', active: true });
    await toggleUserActiveAction(form()); await toggleUserActiveAction(form());
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.invalidate).not.toHaveBeenCalled();
  });
});
