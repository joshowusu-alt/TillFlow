import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { startActivePolling } from './active-polling';
let visible = true;
let online = true;
let stop: (() => void) | undefined;
beforeEach(() => {
  vi.useFakeTimers(); visible = true; online = true;
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visible ? 'visible' : 'hidden');
  Object.defineProperty(navigator, 'onLine', { value: true });
});
afterEach(() => { stop?.(); vi.useRealTimers(); vi.restoreAllMocks(); });
it('polls every 15 seconds, pauses hidden/offline, resumes once on focus bursts', async () => {
  const task = vi.fn().mockResolvedValue(undefined);
  stop = startActivePolling(task, 15000);
  await vi.advanceTimersByTimeAsync(15000); expect(task).toHaveBeenCalledTimes(2);
  visible = false; document.dispatchEvent(new Event('visibilitychange'));
  await vi.advanceTimersByTimeAsync(60000); expect(task).toHaveBeenCalledTimes(2);
  visible = true; document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('focus'));
  await vi.advanceTimersByTimeAsync(0); expect(task).toHaveBeenCalledTimes(3);
  online = false; Object.defineProperty(navigator, 'onLine', { value: false }); window.dispatchEvent(new Event('offline'));
  await vi.advanceTimersByTimeAsync(60000); expect(task).toHaveBeenCalledTimes(3);
  online = true; Object.defineProperty(navigator, 'onLine', { value: true }); window.dispatchEvent(new Event('online'));
  await vi.advanceTimersByTimeAsync(0); expect(task).toHaveBeenCalledTimes(4);
  stop(); await vi.advanceTimersByTimeAsync(60000); expect(task).toHaveBeenCalledTimes(4);
});
it('backs off failures to a cap, then restores the prompt cadence on success', async () => {
  const task = vi.fn().mockRejectedValue(new Error('down'));
  stop = startActivePolling(task, 15000, { maxMs: 60000 });
  await vi.advanceTimersByTimeAsync(0); expect(task).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(30000); expect(task).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(60000); expect(task).toHaveBeenCalledTimes(3);
  task.mockResolvedValue(undefined);
  await vi.advanceTimersByTimeAsync(60000); expect(task).toHaveBeenCalledTimes(4);
  await vi.advanceTimersByTimeAsync(15000); expect(task).toHaveBeenCalledTimes(5);
});
it('never overlaps slow requests and starts no request when initially inactive', async () => {
  visible = false;
  let finish!: () => void;
  const task = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
  stop = startActivePolling(task, 15000);
  await vi.advanceTimersByTimeAsync(60000); expect(task).not.toHaveBeenCalled();
  visible = true; window.dispatchEvent(new Event('focus'));
  await vi.advanceTimersByTimeAsync(60000); expect(task).toHaveBeenCalledTimes(1);
  finish(); await vi.advanceTimersByTimeAsync(15000); expect(task).toHaveBeenCalledTimes(2);
});
