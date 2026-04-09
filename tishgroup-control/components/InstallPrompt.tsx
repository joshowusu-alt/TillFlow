'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function isIosSafari() {
  if (typeof navigator === 'undefined') return false;
  const userAgent = navigator.userAgent;
  const isAppleMobile = /iPad|iPhone|iPod/.test(userAgent);
  const isWebKit = /WebKit/.test(userAgent);
  const isOtherBrowser = /CriOS|FxiOS|EdgiOS/.test(userAgent);
  return isAppleMobile && isWebKit && !isOtherBrowser;
}

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const promptTimerRef = useRef<number | null>(null);

  const showIosInstructions = useMemo(() => isIosSafari(), []);

  useEffect(() => {
    if (window.matchMedia('(display-mode: standalone)').matches || (window.navigator as Navigator & { standalone?: boolean }).standalone) {
      setIsInstalled(true);
      return;
    }

    const dismissed = window.localStorage.getItem('tg-control-install-dismissed');
    if (dismissed) {
      const dismissedTime = parseInt(dismissed, 10);
      if (Number.isFinite(dismissedTime) && dismissedTime > Date.now() - 24 * 60 * 60 * 1000) {
        return;
      }
    }

    if (showIosInstructions) {
      promptTimerRef.current = window.setTimeout(() => setShowPrompt(true), 1500);
    }

    const handleBeforeInstall = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      if (promptTimerRef.current) {
        window.clearTimeout(promptTimerRef.current);
      }
      promptTimerRef.current = window.setTimeout(() => setShowPrompt(true), 1200);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setShowPrompt(false);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      if (promptTimerRef.current) {
        window.clearTimeout(promptTimerRef.current);
      }
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, [showIosInstructions]);

  async function handleInstall() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setShowPrompt(false);
    }
    setDeferredPrompt(null);
  }

  function handleDismiss() {
    setShowPrompt(false);
    window.localStorage.setItem('tg-control-install-dismissed', Date.now().toString());
  }

  if (isInstalled || !showPrompt || (!deferredPrompt && !showIosInstructions)) {
    return null;
  }

  return (
    <div className="fixed inset-x-4 bottom-[calc(var(--safe-bottom)+1rem)] z-50 mx-auto max-w-sm">
      <div className="overflow-hidden rounded-[28px] border border-black/10 bg-[rgba(255,255,255,0.97)] shadow-2xl backdrop-blur">
        <div className="bg-[#122126] px-4 py-4 text-white">
          <div className="flex items-center gap-3">
            <img src="/api/icon?size=128" alt="Tish Group Control" className="h-12 w-12 rounded-2xl" />
            <div>
              <div className="text-sm font-semibold uppercase tracking-[0.18em] text-white/65">Install app</div>
              <div className="mt-1 text-lg font-semibold">Tish Group Control</div>
            </div>
          </div>
        </div>

        <div className="space-y-4 p-4 text-sm text-black/68">
          <p>
            Add the control panel to your home screen for one-tap opening, standalone display, and faster repeat access from your phone.
          </p>

          {deferredPrompt ? (
            <div className="rounded-2xl border border-black/8 bg-[#f7f4ef] px-3 py-3 text-[13px] leading-6 text-black/70">
              This browser supports direct install. Use the button below and the app will open without the browser frame once installed.
            </div>
          ) : (
            <div className="rounded-2xl border border-black/8 bg-[#f7f4ef] px-3 py-3 text-[13px] leading-6 text-black/70">
              On iPhone, tap <strong>Share</strong> in Safari, then choose <strong>Add to Home Screen</strong>.
            </div>
          )}

          <div className="flex gap-2">
            {deferredPrompt ? (
              <button
                onClick={handleInstall}
                className="flex-1 rounded-2xl bg-[#122126] px-4 py-3 font-semibold text-white transition hover:bg-[#0d1a1e]"
              >
                Install now
              </button>
            ) : null}
            <button
              onClick={handleDismiss}
              className="rounded-2xl border border-black/10 px-4 py-3 font-semibold text-black/58 transition hover:bg-black/5"
            >
              Not now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}