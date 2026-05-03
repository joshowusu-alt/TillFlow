'use client';

import { useEffect, useState, useCallback } from 'react';

type BackgroundSyncRegistration = ServiceWorkerRegistration & {
  sync?: {
    register: (tag: string) => Promise<void>;
  };
};

function isExpectedBackgroundSyncError(error: unknown) {
  if (!(error instanceof Error)) return false;
  const message = `${error.name} ${error.message}`.toLowerCase();
  return message.includes('invalidstate') || message.includes('background sync is disabled');
}

function logServiceWorkerEvent(message: string, payload?: unknown) {
  if (process.env.NODE_ENV !== 'development') return;
  if (payload === undefined) {
    console.info(message);
    return;
  }
  console.info(message, payload);
}

export default function ServiceWorkerRegistration() {
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);

  const applyWorkerUpdate = useCallback((worker: ServiceWorker | null) => {
    if (!worker) return;
    worker.postMessage('skipWaiting');
    setWaitingWorker(null);
  }, []);

  const applyUpdate = useCallback(() => {
    applyWorkerUpdate(waitingWorker);
  }, [applyWorkerUpdate, waitingWorker]);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    let updateTimer: ReturnType<typeof setInterval> | null = null;
    let refreshing = false;

    const handleControllerChange = () => {
      if (!refreshing) {
        refreshing = true;
        window.location.reload();
      }
    };

    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);

    navigator.serviceWorker
      .register('/sw.js')
      .then(async (registration) => {
        logServiceWorkerEvent('SW registered:', registration.scope);

        // Register Background Sync for offline sales
        const readyRegistration = await navigator.serviceWorker.ready.catch(() => registration);
        const syncRegistration = readyRegistration as BackgroundSyncRegistration;
        if (syncRegistration.active && syncRegistration.sync) {
          syncRegistration.sync.register('sync-offline-sales').catch((error: unknown) => {
            if (!isExpectedBackgroundSyncError(error)) {
              console.warn('Background Sync registration failed:', error);
            } else {
              logServiceWorkerEvent('Background Sync unavailable for this browser context.');
            }
          });
        }

        // If there's already a waiting worker on load, activate it immediately.
        // iOS PWAs are prone to holding old authenticated shells after deploys;
        // waiting for a manual prompt can leave staff stuck on a stale 500 page.
        if (registration.waiting) {
          applyWorkerUpdate(registration.waiting);
        }

        // Listen for new installing workers
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (!newWorker) return;

          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              applyWorkerUpdate(newWorker);
            }
          });
        });

        // Check once on startup, then periodically while the app stays open.
        registration.update().catch(() => null);
        updateTimer = setInterval(() => {
          registration.update();
        }, 60 * 60 * 1000); // Every hour
      })
      .catch((error) => {
        console.warn('SW registration failed:', error);
      });

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
      if (updateTimer) {
        clearInterval(updateTimer);
      }
    };
  }, [applyWorkerUpdate]);

  if (!waitingWorker) return null;

  return (
    <div className="safe-floating-bottom fixed left-1/2 z-50 -translate-x-1/2 animate-in fade-in slide-in-from-bottom-4">
      <div className="flex items-center gap-3 rounded-2xl border border-black/10 bg-white px-4 py-3 shadow-lg">
        <span className="text-sm font-medium text-black/70">A new version is available</span>
        <button
          onClick={applyUpdate}
          className="rounded-xl bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent/80 transition"
        >
          Update now
        </button>
      </div>
    </div>
  );
}
