import { renderHook, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useRouterRefreshOnVisibility } from './useRouterRefreshOnVisibility';

describe('useRouterRefreshOnVisibility', () => {
  const refresh = vi.fn();
  const router = { refresh };

  beforeEach(() => {
    refresh.mockClear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('refreshes when the document becomes visible', () => {
    renderHook(() => useRouterRefreshOnVisibility(router));

    act(() => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'visible',
      });
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('refreshes when the window gains focus', () => {
    renderHook(() => useRouterRefreshOnVisibility(router));

    act(() => {
      window.dispatchEvent(new FocusEvent('focus'));
    });

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('forces refresh on persisted pageshow recovery', () => {
    renderHook(() => useRouterRefreshOnVisibility(router, { throttleMs: 8_000 }));

    act(() => {
      window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    });

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('throttles repeated refresh triggers', () => {
    renderHook(() => useRouterRefreshOnVisibility(router, { throttleMs: 8_000 }));

    act(() => {
      window.dispatchEvent(new FocusEvent('focus'));
      window.dispatchEvent(new FocusEvent('focus'));
    });

    expect(refresh).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(8_000);
      window.dispatchEvent(new FocusEvent('focus'));
    });

    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('does not attach listeners when disabled', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');

    renderHook(() => useRouterRefreshOnVisibility(router, { enabled: false }));

    expect(addSpy).not.toHaveBeenCalledWith('focus', expect.any(Function));
    addSpy.mockRestore();
  });
});
