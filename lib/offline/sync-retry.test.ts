import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const mocks = vi.hoisted(() => ({ pending: vi.fn(), mark: vi.fn(), remove: vi.fn() }));
vi.mock('./storage', () => ({
  getPendingSales: mocks.pending,
  markSaleQueueStatus: mocks.mark,
  markSaleSynced: mocks.mark,
  removeSyncedSales: mocks.remove,
  getSyncMeta: vi.fn(),
}));
vi.mock('./capture', () => ({ hydrateOfflineCaptureContext: vi.fn() }));
vi.mock('@/lib/business-scope', () => ({ getClientActiveBusinessId: () => 'biz', getOfflineActiveStoreMetaKey: () => 'store', getOfflineCacheUrl: () => '/cache' }));
import { setupAutoSync } from './sync';

describe('offline transient retry', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks(); Object.defineProperty(navigator, 'onLine', { value: true }); });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
  it('retries a network failure without requiring another online event', async () => {
    mocks.pending.mockResolvedValue([{ id: 'sale' }]);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network unavailable')));
    const cleanup = setupAutoSync(vi.fn(), vi.fn(), vi.fn());
    try {
      await vi.advanceTimersByTimeAsync(1000);
      const first = vi.mocked(fetch).mock.calls.length;
      await vi.advanceTimersByTimeAsync(2000);
      expect(vi.mocked(fetch).mock.calls.length).toBeGreaterThan(first);
    } finally { cleanup(); }
  });
  it('stops automatic retries after five backoff attempts', async () => {
    mocks.pending.mockResolvedValue([{ id: 'sale' }]);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network unavailable')));
    const error = vi.fn();
    const cleanup = setupAutoSync(vi.fn(), vi.fn(), error);
    try {
      await vi.advanceTimersByTimeAsync(100000);
      expect(error).toHaveBeenCalledTimes(1);
      const calls = vi.mocked(fetch).mock.calls.length;
      await vi.advanceTimersByTimeAsync(100000);
      expect(vi.mocked(fetch).mock.calls.length).toBe(calls);
    } finally { cleanup(); }
  });
  it('does not retry sales moved to manual review', async () => {
    mocks.pending.mockResolvedValueOnce([{ id: 'sale' }]).mockResolvedValue([]);
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url) => url === '/cache'
      ? { ok: false, status: 503, headers: { get: () => '' }, text: async () => '' }
      : { ok: true, json: async () => ({ synced: [], failed: [{ id: 'sale', error: 'shift_not_found', status: 'needs_review' }], results: [{ id: 'sale', status: 'needs_review' }] }) }));
    const complete = vi.fn();
    const cleanup = setupAutoSync(vi.fn(), complete, vi.fn());
    try {
      await vi.advanceTimersByTimeAsync(100000);
      expect(complete).toHaveBeenCalledTimes(1);
      expect(mocks.mark).toHaveBeenCalledWith('sale', 'needs_review', undefined, 'biz');
    } finally { cleanup(); }
  });
  it('cancels the initial sync when unmounted', async () => {
    mocks.pending.mockResolvedValue([]);
    const start = vi.fn();
    const cleanup = setupAutoSync(start, vi.fn(), vi.fn());
    cleanup();
    await vi.advanceTimersByTimeAsync(1000);
    expect(start).not.toHaveBeenCalled();
  });
});

describe('service worker background retry', () => {
  const source = readFileSync('public/sw.js', 'utf8');
  const functionSource = source.slice(source.indexOf('async function syncSalesDirectly()'), source.indexOf('// Background sync for offline sales'));
  const run = (fetcher: unknown, move: unknown = vi.fn()) => {
    const execute = new Function('openOfflineDB', 'getPendingSalesFromDB', 'fetch', 'moveToDead', 'markSaleSyncedInDB', `${functionSource}; return syncSalesDirectly();`);
    return execute(async () => ({ close() {} }), async () => [{ id: 'sale' }], fetcher, move, vi.fn()) as Promise<void>;
  };
  it('rejects the background event on HTTP 503 so browser retries', async () => {
    await expect(run(async () => ({ status: 503, ok: false }))).rejects.toThrow();
  });
  it('keeps HTTP 429 queued for retry rather than dead-lettering', async () => {
    const move = vi.fn();
    await expect(run(async () => ({ status: 429, ok: false, json: async () => ({}) }), move)).rejects.toThrow();
    expect(move).not.toHaveBeenCalled();
  });
  it('resolves a successful background sync', async () => {
    await expect(run(async () => ({ status: 200, ok: true }))).resolves.toBeUndefined();
  });
});
