/** One serial timer; no requests while hidden/offline. Failures back off to maxMs. */
export function startActivePolling(task: () => void | Promise<void>, intervalMs: number, { immediate = true, maxMs = intervalMs * 8 }: { immediate?: boolean; maxMs?: number } = {}) {
  let disposed = false;
  let running = false;
  let delay = intervalMs;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastStarted = -Infinity;
  const active = () => document.visibilityState !== 'hidden' && navigator.onLine !== false;
  const clear = () => { clearTimeout(timer); timer = undefined; };
  const schedule = () => { clear(); if (!disposed && active()) timer = setTimeout(run, delay); };
  async function run() {
    if (disposed || running || !active()) return;
    running = true; lastStarted = Date.now();
    try { await task(); delay = intervalMs; }
    catch { delay = Math.min(maxMs, delay * 2); }
    finally { running = false; schedule(); }
  }
  const resume = () => {
    clear();
    if (!active()) return;
    // Deduplicate focus/visibility/online bursts; reconnect otherwise refreshes promptly.
    if (Date.now() - lastStarted >= 1000) void run(); else schedule();
  };
  window.addEventListener('focus', resume);
  window.addEventListener('online', resume);
  window.addEventListener('offline', resume);
  document.addEventListener('visibilitychange', resume);
  if (immediate) void run(); else schedule();
  return () => {
    disposed = true; clear();
    window.removeEventListener('focus', resume); window.removeEventListener('online', resume);
    window.removeEventListener('offline', resume); document.removeEventListener('visibilitychange', resume);
  };
}
