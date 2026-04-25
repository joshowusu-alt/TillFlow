'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

const TRIGGER_DISTANCE = 92;
const MAX_PULL_DISTANCE = 124;

function shouldIgnoreTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest('input, textarea, select, button, [contenteditable="true"], [data-pull-refresh-ignore="true"]'));
}

export default function PullToRefresh() {
  const router = useRouter();
  const startYRef = useRef(0);
  const startXRef = useRef(0);
  const trackingRef = useRef(false);
  const refreshingRef = useRef(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const isCoarsePointer = window.matchMedia('(pointer: coarse)').matches;
    if (!isCoarsePointer) return;

    const reset = () => {
      trackingRef.current = false;
      setPullDistance(0);
    };

    const onTouchStart = (event: TouchEvent) => {
      if (refreshingRef.current || shouldIgnoreTarget(event.target)) return;
      if (window.scrollY > 2) return;
      const touch = event.touches[0];
      if (!touch) return;
      startYRef.current = touch.clientY;
      startXRef.current = touch.clientX;
      trackingRef.current = true;
    };

    const onTouchMove = (event: TouchEvent) => {
      if (!trackingRef.current || refreshingRef.current) return;
      const touch = event.touches[0];
      if (!touch) return;

      const deltaY = touch.clientY - startYRef.current;
      const deltaX = Math.abs(touch.clientX - startXRef.current);
      if (deltaX > Math.max(24, deltaY * 0.7)) {
        reset();
        return;
      }
      if (deltaY <= 0 || window.scrollY > 2) {
        reset();
        return;
      }

      event.preventDefault();
      setPullDistance(Math.min(MAX_PULL_DISTANCE, Math.round(deltaY * 0.55)));
    };

    const onTouchEnd = () => {
      if (!trackingRef.current) return;
      const shouldRefresh = pullDistance >= TRIGGER_DISTANCE;
      trackingRef.current = false;

      if (!shouldRefresh) {
        setPullDistance(0);
        return;
      }

      refreshingRef.current = true;
      setRefreshing(true);
      setPullDistance(TRIGGER_DISTANCE);
      router.refresh();

      window.setTimeout(() => {
        refreshingRef.current = false;
        setRefreshing(false);
        setPullDistance(0);
      }, 900);
    };

    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    window.addEventListener('touchcancel', reset, { passive: true });

    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('touchcancel', reset);
    };
  }, [pullDistance, router]);

  const visible = pullDistance > 0 || refreshing;
  const armed = pullDistance >= TRIGGER_DISTANCE;

  return (
    <div
      aria-live="polite"
      className={`pointer-events-none fixed left-1/2 top-[calc(env(safe-area-inset-top,0px)+0.75rem)] z-[80] -translate-x-1/2 transition-opacity duration-150 ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
      style={{ transform: `translate(-50%, ${Math.min(pullDistance * 0.28, 28)}px)` }}
    >
      <div className="flex items-center gap-2 rounded-full border border-black/10 bg-white/95 px-3 py-2 text-xs font-semibold text-ink shadow-lg backdrop-blur">
        <svg
          aria-hidden="true"
          className={`h-4 w-4 text-accent ${refreshing ? 'animate-spin' : ''}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ transform: refreshing ? undefined : `rotate(${Math.min(pullDistance * 2.2, 220)}deg)` }}
        >
          <path d="M21 12a9 9 0 0 1-15.3 6.4" />
          <path d="M3 12a9 9 0 0 1 15.3-6.4" />
          <path d="M18 2v4h-4" />
          <path d="M6 22v-4h4" />
        </svg>
        <span>{refreshing ? 'Refreshing...' : armed ? 'Release to refresh' : 'Pull to refresh'}</span>
      </div>
    </div>
  );
}
