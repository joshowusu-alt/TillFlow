'use client';

import { useEffect, useState } from 'react';

export default function ServiceWorkerRegistration() {
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    let updateTimer: number | null = null;
    let refreshing = false;

    const handleControllerChange = () => {
      if (!refreshing) {
        refreshing = true;
        window.location.reload();
      }
    };

    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);

    navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).then((registration) => {
      if (registration.waiting) {
        setWaitingWorker(registration.waiting);
      }

      registration.update().catch(() => {
        // Ignore transient update failures and keep the existing worker active.
      });

      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (!newWorker) return;

        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            setWaitingWorker(newWorker);
          }
        });
      });

      updateTimer = window.setInterval(() => {
        registration.update();
      }, 60 * 60 * 1000);
    }).catch((error) => {
      console.warn('Tish Group Control service worker registration failed:', error);
    });

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
      if (updateTimer) {
        window.clearInterval(updateTimer);
      }
    };
  }, []);

  if (!waitingWorker) {
    return null;
  }

  return (
    <div className="fixed inset-x-4 bottom-[calc(var(--safe-bottom)+1rem)] z-50 mx-auto max-w-sm sm:left-auto sm:right-4 sm:mx-0">
      <div className="flex items-center gap-3 rounded-[24px] border border-black/10 bg-white px-4 py-3 shadow-xl">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-control-ink">New version available</div>
          <div className="text-xs text-black/56">Refresh the installed app to pick up the latest control-panel build.</div>
        </div>
        <button
          onClick={() => waitingWorker.postMessage('skipWaiting')}
          className="rounded-2xl bg-[#122126] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#0d1a1e]"
        >
          Update
        </button>
      </div>
    </div>
  );
}