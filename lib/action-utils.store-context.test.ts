import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ stores: ['branch-a'], cookie: null as string | null, count: null as number | null }));
const db = vi.hoisted(() => ({ business: { findUnique: vi.fn() }, store: { findMany: vi.fn(), findFirst: vi.fn(), count: vi.fn() } }));
vi.mock('@/lib/prisma', () => ({ prisma: db }));
vi.mock('@/lib/auth', () => ({ requireRole: vi.fn().mockResolvedValue({ id: 'owner', businessId: 'business-a', role: 'OWNER' }), requireUser: vi.fn() }));
vi.mock('next/headers', () => ({ cookies: () => ({ get: () => state.cookie ? { value: state.cookie } : undefined }) }));
vi.mock('next/navigation', () => ({ redirect: (path: string) => { throw new Error(`Redirect ${path}`); } }));
import { requireSelectedStoreContext } from './action-utils';

describe('mutation branch selection', () => {
  beforeEach(() => {
    vi.clearAllMocks(); state.stores = ['branch-a']; state.cookie = null; state.count = null;
    db.business.findUnique.mockResolvedValue({ id: 'business-a' });
    db.store.findMany.mockImplementation(async ({ where, take }) => where.businessId === 'business-a' ? state.stores.slice(0, take).map(id => ({ id })) : []);
    db.store.findFirst.mockImplementation(async ({ where }) => where.businessId === 'business-a' && state.stores.includes(where.id) ? { id: where.id } : null);
    db.store.count.mockImplementation(async () => state.count ?? state.stores.length);
  });
  const resolve = (id?: string | null) => requireSelectedStoreContext(['OWNER'], id, { requireWrite: false });
  it('accepts a proven sole branch without a selection cookie', async () => {
    expect((await resolve()).storeId).toBe('branch-a');
    expect(db.store.findMany).toHaveBeenCalledWith({ where: { businessId: 'business-a' }, select: { id: true }, take: 2 });
  });
  it('requires a choice when multiple branches exist', async () => {
    state.stores = ['branch-a', 'branch-b'];
    await expect(resolve()).rejects.toThrow('Select a store');
  });
  it('rejects a business with no authorised branch', async () => {
    state.stores = [];
    await expect(resolve()).rejects.toThrow('Select a store');
  });
  it('uses the explicitly selected second branch', async () => {
    state.stores = ['branch-a', 'branch-b']; state.cookie = 'branch-b';
    expect((await resolve('branch-b')).storeId).toBe('branch-b');
    expect(db.store.findMany).not.toHaveBeenCalled();
  });
  it('rejects a foreign branch instead of choosing the sole local branch', async () => {
    await expect(resolve('foreign-branch')).rejects.toThrow('not available');
  });
  it('rejects ALL as a mutation branch', async () => {
    await expect(resolve('ALL')).rejects.toThrow('not available');
  });
  it('rejects a stale cookie when it differs from the submitted branch', async () => {
    state.stores = ['branch-a', 'branch-b']; state.cookie = 'branch-a';
    await expect(resolve('branch-b')).rejects.toThrow('changed');
  });
  it('fails closed if another branch appears after the sole-branch lookup', async () => {
    state.count = 2;
    await expect(resolve()).rejects.toThrow('Select a branch');
  });
});
