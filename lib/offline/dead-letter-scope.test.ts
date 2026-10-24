import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ active: null as string | null, removed: vi.fn(), row: { payload: { businessId: 'biz' }, failedAt: '2026-10-24', statusCode: 400, errorMessage: 'test' } }));
vi.mock('@/lib/business-scope', () => ({ getClientActiveBusinessId: () => state.active }));
vi.mock('idb', () => ({ openDB: vi.fn(async () => ({
  transaction: () => ({ objectStore: () => ({ openCursor: async () => ({ value: state.row, primaryKey: 1, continue: async () => null }) }), done: Promise.resolve() }),
  delete: state.removed,
})) }));
beforeEach(() => { vi.resetModules(); state.active = null; state.removed.mockClear(); });
describe('dead-letter business scope', () => {
  it('hides records while logged out and retains them for re-login', async () => {
    const store = await import('./dead-letter');
    expect(await store.getDeadLetterSales()).toEqual([]);
    await store.removeDeadLetterSale(1);
    expect(state.removed).not.toHaveBeenCalled();
    state.active = 'biz';
    expect(await store.getDeadLetterSales()).toHaveLength(1);
  });
  it('prevents removal and retry under another business', async () => {
    const store = await import('./dead-letter'); state.active = 'other';
    await store.removeDeadLetterSale(1);
    expect(state.removed).not.toHaveBeenCalled();
    expect(await store.retryDeadLetterSale({ key: 1, ...state.row } as any)).toMatchObject({ ok: false, statusCode: 403 });
  });
});
