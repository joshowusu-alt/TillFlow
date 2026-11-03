/**
 * Share only an overlapping read, never a completed value. This prevents a cold
 * cache/revalidation burst in one worker from issuing the same database work
 * repeatedly, without adding stale-result or invalidation semantics.
 */
const reads = new Map<string, Promise<unknown>>();

export function coalesceInFlightRead<T>(key: string, read: () => Promise<T>): Promise<T> {
  const existing = reads.get(key);
  if (existing) return existing as Promise<T>;
  const pending = Promise.resolve().then(read);
  reads.set(key, pending);
  const cleanup = () => { if (reads.get(key) === pending) reads.delete(key); };
  // A rejected read must be retried by the next request, not retained or hidden.
  void pending.then(cleanup, cleanup);
  return pending;
}
