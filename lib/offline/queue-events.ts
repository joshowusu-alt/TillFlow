/** Local-only notification: keep offline counters current without background polling. */
export const OFFLINE_QUEUE_CHANGED = 'tillflow:offline-queue-changed';
export function notifyOfflineQueueChanged() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(OFFLINE_QUEUE_CHANGED));
}
