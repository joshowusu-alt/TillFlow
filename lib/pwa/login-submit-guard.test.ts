import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  deferServiceWorkerReload,
  flushPendingServiceWorkerReload,
  isLoginSubmitting,
  LOGIN_SW_RELOAD_MAX_DEFER_MS,
  notifyLoginSubmitting,
  resetLoginSubmitGuardForTests,
} from './login-submit-guard';

describe('login submit guard for service worker reload', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetLoginSubmitGuardForTests();
  });

  afterEach(() => {
    resetLoginSubmitGuardForTests();
    vi.useRealTimers();
  });

  it('defers reload while login is submitting', () => {
    notifyLoginSubmitting(true);
    const reload = vi.fn();
    deferServiceWorkerReload(reload);

    vi.advanceTimersByTime(1_000);
    expect(reload).not.toHaveBeenCalled();

    notifyLoginSubmitting(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('reloads after the bounded timeout even if login stays pending', () => {
    notifyLoginSubmitting(true);
    const reload = vi.fn();
    deferServiceWorkerReload(reload);

    vi.advanceTimersByTime(LOGIN_SW_RELOAD_MAX_DEFER_MS);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('does not leave the submitting flag stuck after login settles', () => {
    notifyLoginSubmitting(true);
    expect(isLoginSubmitting()).toBe(true);
    notifyLoginSubmitting(false);
    expect(isLoginSubmitting()).toBe(false);
  });

  it('flushPendingServiceWorkerReload is a no-op without a pending reload', () => {
    expect(() => flushPendingServiceWorkerReload()).not.toThrow();
  });
});
