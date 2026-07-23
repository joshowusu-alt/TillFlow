import { renderHook, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  HOME_RESUME_STALE_MS,
  useRouterRefreshOnVisibility,
} from './useRouterRefreshOnVisibility';

describe('HOME_RESUME_STALE_MS exact refresh counts', () => {
  const refresh = vi.fn();
  const router = { refresh };

  beforeEach(() => {
    refresh.mockClear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-23T08:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function mountHome() {
    return renderHook(() =>
      useRouterRefreshOnVisibility(router, {
        staleThresholdMs: HOME_RESUME_STALE_MS,
        refreshOnMount: false,
        throttleMs: 1_000,
      }),
    );
  }

  it('A: return after 5 seconds → 0 refreshes', () => {
    mountHome();
    act(() => {
      vi.advanceTimersByTime(5_000);
      window.dispatchEvent(new FocusEvent('focus'));
    });
    expect(refresh).toHaveBeenCalledTimes(0);
  });

  it('B: return after 19 seconds → 0 refreshes', () => {
    mountHome();
    act(() => {
      vi.advanceTimersByTime(19_000);
      window.dispatchEvent(new FocusEvent('focus'));
    });
    expect(refresh).toHaveBeenCalledTimes(0);
  });

  it('C: return after 21 seconds → exactly 1 refresh', () => {
    mountHome();
    act(() => {
      vi.advanceTimersByTime(21_000);
      window.dispatchEvent(new FocusEvent('focus'));
    });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('D: pageshow + visibilitychange same burst → exactly 1 refresh after stale window', () => {
    mountHome();
    act(() => {
      vi.advanceTimersByTime(21_000);
      window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: false }));
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'visible',
      });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('E: bfcache pageshow forces exactly 1 refresh even inside stale window', () => {
    mountHome();
    act(() => {
      vi.advanceTimersByTime(5_000);
      window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    });
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
