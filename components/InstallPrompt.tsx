'use client';

import { useState, useEffect } from 'react';

interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function InstallPrompt() {
    const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
    const [showPrompt, setShowPrompt] = useState(false);
    const [isInstalled, setIsInstalled] = useState(false);

    useEffect(() => {
        // Check if already installed
        if (window.matchMedia('(display-mode: standalone)').matches) {
            setIsInstalled(true);
            return;
        }

        // Check if dismissed recently
        const dismissed = localStorage.getItem('pwa-install-dismissed');
        if (dismissed) {
            const dismissedTime = parseInt(dismissed, 10);
            const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
            if (dismissedTime > dayAgo) {
                return; // Don't show for 24 hours after dismissal
            }
        }

        const handleBeforeInstall = (e: Event) => {
            e.preventDefault();
            setDeferredPrompt(e as BeforeInstallPromptEvent);

            // Delay showing prompt
            setTimeout(() => setShowPrompt(true), 3000);
        };

        const handleAppInstalled = () => {
            setIsInstalled(true);
            setShowPrompt(false);
            setDeferredPrompt(null);
        };

        window.addEventListener('beforeinstallprompt', handleBeforeInstall);
        window.addEventListener('appinstalled', handleAppInstalled);

        return () => {
            window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
            window.removeEventListener('appinstalled', handleAppInstalled);
        };
    }, []);

    const handleInstall = async () => {
        if (!deferredPrompt) return;

        await deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;

        if (outcome === 'accepted') {
            setShowPrompt(false);
        }

        setDeferredPrompt(null);
    };

    const handleDismiss = () => {
        setShowPrompt(false);
        localStorage.setItem('pwa-install-dismissed', Date.now().toString());
    };

    if (isInstalled || !showPrompt || !deferredPrompt) {
        return null;
    }

    return (
        <div className="fixed bottom-20 left-4 right-4 z-50 mx-auto max-w-sm animate-fade-in md:left-auto md:right-4">
            <div className="overflow-hidden rounded-2xl bg-white shadow-2xl">
                {/* Header gradient */}
                <div className="bg-gradient-to-r from-accent to-accent/80 p-4">
                    <div className="flex items-center gap-3">
                        <img src="/icon.svg" alt="TillFlow" className="h-12 w-12 rounded-xl" />
                        <div className="text-white">
                            <div className="font-bold">Install TillFlow</div>
                            <div className="text-sm text-white/80">Sales made simple</div>
                        </div>
                    </div>
                </div>

                {/* Content */}
                <div className="p-4">
                    <p className="text-sm text-black/60">
                        Install the app for a faster, offline-ready experience with quick access from your home screen.
                    </p>

                    {/* Benefits */}
                    <ul className="mt-3 space-y-1.5">
                        <li className="flex items-center gap-2 text-sm">
                            <svg className="h-4 w-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            <span>Works offline</span>
                        </li>
                        <li className="flex items-center gap-2 text-sm">
                            <svg className="h-4 w-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            <span>Faster loading</span>
                        </li>
                        <li className="flex items-center gap-2 text-sm">
                            <svg className="h-4 w-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            <span>Full screen experience</span>
                        </li>
                    </ul>

                    {/* Actions */}
                    <div className="mt-4 flex gap-2">
                        <button
                            onClick={handleInstall}
                            className="flex-1 rounded-xl bg-accent px-4 py-2.5 font-semibold text-white transition hover:bg-accent/80"
                        >
                            Install
                        </button>
                        <button
                            onClick={handleDismiss}
                            className="rounded-xl px-4 py-2.5 text-black/50 transition hover:bg-black/5"
                        >
                            Not now
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
