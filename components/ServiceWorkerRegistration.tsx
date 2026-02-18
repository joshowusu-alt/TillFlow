'use client';

import { useEffect, useState, useCallback } from 'react';

export default function ServiceWorkerRegistration() {
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);

  const applyUpdate = useCallback(() => {
    if (waitingWorker) {
      waitingWorker.postMessage('skipWaiting');
      setWaitingWorker(null);
      window.location.reload();
    }
  }, [waitingWorker]);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        console.log('SW registered:', registration.scope);

        // If there's already a waiting worker on load
        if (registration.waiting) {
          setWaitingWorker(registration.waiting);
        }

        // Listen for new installing workers
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (!newWorker) return;

          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // A new version is ready — prompt user
              setWaitingWorker(newWorker);
            }
          });
        });

        // Check for updates periodically
        setInterval(() => {
          registration.update();
        }, 60 * 60 * 1000); // Every hour
      })
      .catch((error) => {
        console.log('SW registration failed:', error);
      });

    // When the new SW takes over, reload
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!refreshing) {
        refreshing = true;
        window.location.reload();
      }
    });
  }, []);

  if (!waitingWorker) return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 animate-in fade-in slide-in-from-bottom-4">
      <div className="flex items-center gap-3 rounded-2xl border border-black/10 bg-white px-4 py-3 shadow-lg">
        <span className="text-sm font-medium text-black/70">A new version is available</span>
        <button
          onClick={applyUpdate}
          className="rounded-xl bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-900 transition"
        >
          Update now
        </button>
      </div>
    </div>
  );
}
