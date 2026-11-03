import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ stores: new Map<string, Map<string, any>>(), keys: new Map<string, string | string[]>(), active: null as string | null, oldVersion: 3 }));
vi.mock('@/lib/business-scope', () => ({ getClientActiveBusinessId: () => state.active, getOfflineActiveBusinessMetaKey: () => 'active-business', getOfflineActiveStoreMetaKey: () => 'active-store' }));
vi.mock('idb', () => ({ openDB: vi.fn(async (_name, _version, options) => {
  const store = (name: string) => ({
    getAll: async () => [...state.stores.get(name)!.values()],
    put: async (row: any) => { const path = state.keys.get(name)!; const key = Array.isArray(path) ? path.map((p) => row[p]) : row[path]; state.stores.get(name)!.set(JSON.stringify(key), row); },
    delete: async (key: any) => { state.stores.get(name)!.delete(JSON.stringify(key)); },
  });
  const db: any = {
    objectStoreNames: { contains: (name: string) => state.stores.has(name) },
    createObjectStore: (name: string, options: any) => { state.stores.set(name, new Map()); state.keys.set(name, options.keyPath); return store(name); },
    deleteObjectStore: (name: string) => { state.stores.delete(name); },
    transaction: (name: string) => ({ store: store(name), objectStore: store, done: Promise.resolve() }),
    put: (name: string, row: any) => store(name).put(row),
    getAll: (name: string) => store(name).getAll(),
    get: async (name: string, key: any) => state.stores.get(name)!.get(JSON.stringify(key)),
    delete: (name: string, key: any) => store(name).delete(key),
  };
  await options.upgrade(db, state.oldVersion, 4, { objectStore: store });
  return db;
}) }));
const product = { businessId: 'biz', storeId: 'a', id: 'p', name: 'Rice', onHandBase: 10 };
const sale = { id: 'sale', businessId: 'biz', shiftId: 'shift', synced: false, status: 'pending' };
beforeEach(() => {
  vi.resetModules(); state.active = 'biz'; state.stores.clear(); state.keys.clear();
  for (const name of ['products', 'business', 'store', 'customers', 'tills', 'salesQueue', 'syncMeta']) { state.stores.set(name, new Map()); state.keys.set(name, name === 'syncMeta' ? 'key' : 'id'); }
  state.stores.get('products')!.set(JSON.stringify('p'), product);
  state.stores.get('salesQueue')!.set(JSON.stringify('sale'), sale);
});
describe('offline scope and v3 migration', () => {
  it('preserves v3 product snapshots and queued money records during upgrade', async () => {
    const storage = await import('./storage');
    expect(await storage.getCachedProducts('biz', 'a')).toEqual([product]);
    expect((await storage.getPendingSales('biz'))[0].id).toBe('sale');
    expect(state.keys.get('products')).toEqual(['businessId', 'storeId', 'id']);
  });
  it('retains independent stock for the same product in two stores', async () => {
    const storage = await import('./storage');
    await storage.cacheProducts({ businessId: 'biz', storeId: 'b' }, [{ ...product, storeId: 'b', onHandBase: 90 }] as any);
    expect((await storage.getCachedProducts('biz', 'a'))[0]?.onHandBase).toBe(10);
    expect((await storage.getCachedProducts('biz', 'b'))[0]?.onHandBase).toBe(90);
    await storage.cacheProducts({ businessId: 'biz', storeId: 'b' }, []);
    expect((await storage.getCachedProducts('biz', 'a'))[0]?.onHandBase).toBe(10);
  });
  it('fails closed without active scope and retains queue for re-login', async () => {
    const storage = await import('./storage'); state.active = null;
    expect(await storage.getPendingSales()).toEqual([]);
    expect(await storage.getCachedProducts()).toEqual([]);
    expect(await storage.getCachedCustomers()).toEqual([]);
    expect(await storage.getCachedBusiness()).toBeUndefined();
    expect(await storage.getOfflineSale('sale')).toBeUndefined();
    await storage.clearOfflineData();
    await storage.updateOfflineSale({ ...sale, status: 'rejected' } as any);
    state.active = 'biz';
    expect((await storage.getPendingSales())[0].id).toBe('sale');
  });
  it('does not expose another business queue', async () => {
    const storage = await import('./storage'); state.active = 'other';
    expect(await storage.getPendingSales()).toEqual([]);
    expect(await storage.getCachedProducts()).toEqual([]);
  });
});
