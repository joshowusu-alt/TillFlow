/**
 * DevTools-only performance marks for launch handoff timing.
 * No console output — inspect via Performance panel → User Timing.
 */
export function markTillflowPerformance(name: string) {
  if (typeof performance === 'undefined' || typeof performance.mark !== 'function') return;
  try {
    performance.mark(name);
  } catch {
    // Private mode or unsupported environments — ignore.
  }
}
