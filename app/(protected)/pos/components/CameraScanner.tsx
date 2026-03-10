'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

interface CameraScannerProps {
    open: boolean;
    onScan: (code: string) => void;
    onClose: () => void;
}

/**
 * Camera-based barcode scanner overlay.
 * Uses html5-qrcode for real-time barcode/QR scanning from mobile camera.
 * Supports EAN-13, UPC-A, Code-128, QR, and more.
 */
export default function CameraScanner({ open, onScan, onClose }: CameraScannerProps) {
    const scannerRef = useRef<HTMLDivElement>(null);
    const html5QrCodeRef = useRef<any>(null);
    const [error, setError] = useState<string | null>(null);
    const [scanning, setScanning] = useState(false);
    const [retryKey, setRetryKey] = useState(0);
    const hasScannedRef = useRef(false);
    // Store callbacks in refs so the scanner effect never needs them as deps.
    const onScanRef = useRef(onScan);
    const onCloseRef = useRef(onClose);
    useEffect(() => { onScanRef.current = onScan; }, [onScan]);
    useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

    const stopScanner = useCallback(async () => {
        try {
            if (html5QrCodeRef.current) {
                const state = html5QrCodeRef.current.getState?.();
                // Stop when SCANNING (2) or PAUSED (3)
                if (state === 2 || state === 3) {
                    await html5QrCodeRef.current.stop();
                }
                html5QrCodeRef.current.clear();
                html5QrCodeRef.current = null;
            }
        } catch (err) {
            console.warn('Scanner cleanup:', err);
        }
        setScanning(false);
    }, []);

    useEffect(() => {
        if (!open) {
            stopScanner();
            return;
        }

        hasScannedRef.current = false;
        setError(null);
        setScanning(false);
        let cancelled = false;

        const startScanner = async () => {
            try {
                // Dynamic import keeps html5-qrcode out of the SSR bundle
                const { Html5Qrcode } = await import('html5-qrcode');
                if (cancelled) return;

                // Use a unique ID each time to avoid any residual DOM state
                const scannerId = `camera-scanner-${Date.now()}`;
                const container = scannerRef.current;
                if (!container) return;

                container.innerHTML = '';
                const div = document.createElement('div');
                div.id = scannerId;
                container.appendChild(div);

                const scanner = new Html5Qrcode(scannerId, { verbose: false } as any);
                html5QrCodeRef.current = scanner;

                const config = {
                    fps: 15,
                    qrbox: { width: 250, height: 150 },
                };

                const onSuccess = (decodedText: string) => {
                    if (hasScannedRef.current) return;
                    hasScannedRef.current = true;
                    onScanRef.current(decodedText);
                    stopScanner();
                };

                const onFrameError = () => { /* ignore per-frame decode misses */ };

                let started = false;

                // 1st attempt: back (environment) camera — best for scanning barcodes
                try {
                    await scanner.start({ facingMode: 'environment' }, config, onSuccess, onFrameError);
                    started = true;
                } catch {
                    // 2nd attempt: fall back to any available camera
                    try {
                        const devices = await Html5Qrcode.getCameras();
                        if (devices && devices.length > 0) {
                            // Prefer any camera labelled "back" / "rear", else first available
                            const preferred =
                                devices.find((d: any) => /back|rear|environment/i.test(d.label)) ??
                                devices[devices.length - 1];
                            await scanner.start(preferred.id, config, onSuccess, onFrameError);
                            started = true;
                        }
                    } catch {
                        // All attempts failed — fall through to error handler below
                    }
                }

                if (!started) {
                    throw new Error('Unable to start any camera on this device.');
                }

                if (cancelled) {
                    stopScanner();
                    return;
                }

                setScanning(true);
                setError(null);
            } catch (err: any) {
                if (!cancelled) {
                    const msg = (err?.message ?? String(err)).toLowerCase();
                    if (msg.includes('permission') || msg.includes('notallowed') || msg.includes('not allow')) {
                        setError('Camera access denied. Open your browser settings, allow camera access for this site, then tap Retry.');
                    } else if (msg.includes('notfound') || msg.includes('not found') || msg.includes('no cameras')) {
                        setError('No camera found on this device.');
                    } else {
                        // Show the raw error so it can be diagnosed
                        setError(`Could not start camera: ${err?.message ?? String(err)}`);
                    }
                }
            }
        };

        // Small delay so the modal DOM is fully painted before we try to mount the video
        const timer = setTimeout(startScanner, 150);
        return () => {
            cancelled = true;
            clearTimeout(timer);
            stopScanner();
        };
        // onScan / onClose intentionally omitted — stored in refs above
        // retryKey is included so tapping Retry re-runs the full start sequence
    }, [open, stopScanner, retryKey]);

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm">
            <div className="relative mx-4 w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl">
                {/* Header */}
                <div className="flex items-center justify-between border-b px-4 py-3">
                    <div className="flex items-center gap-2">
                        <svg className="h-5 w-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        <span className="text-sm font-semibold">Scan Barcode</span>
                    </div>
                    <button
                        onClick={onClose}
                        className="rounded-lg bg-black/5 p-1.5 transition hover:bg-black/10"
                        aria-label="Close scanner"
                    >
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Scanner viewport */}
                <div className="relative bg-black" style={{ minHeight: '280px' }}>
                    <div ref={scannerRef} className="w-full" style={{ minHeight: '280px' }} />
                    {!scanning && !error && (
                        <div className="absolute inset-0 flex items-center justify-center">
                            <div className="flex flex-col items-center gap-2 text-white/70">
                                <svg className="h-8 w-8 animate-spin" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                </svg>
                                <span className="text-sm">Starting camera…</span>
                            </div>
                        </div>
                    )}
                    {error && (
                        <div className="absolute inset-0 flex items-center justify-center p-6">
                            <div className="text-center">
                                <svg className="mx-auto h-10 w-10 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                                </svg>
                                <p className="mt-2 text-sm text-white/80">{error}</p>
                                <div className="mt-3 flex justify-center gap-2">
                                    <button
                                        onClick={() => { setError(null); setScanning(false); setRetryKey(k => k + 1); }}
                                        className="rounded-lg bg-white/20 px-4 py-2 text-sm font-medium text-white hover:bg-white/30"
                                    >
                                        Retry
                                    </button>
                                    <button
                                        onClick={onClose}
                                        className="rounded-lg bg-white/10 px-4 py-2 text-sm font-medium text-white hover:bg-white/20"
                                    >
                                        Close
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer hint */}
                <div className="border-t px-4 py-3 text-center text-xs text-black/50">
                    Point camera at a barcode. It will scan automatically.
                </div>
            </div>
        </div>
    );
}
