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
    const hasScannedRef = useRef(false);

    const stopScanner = useCallback(async () => {
        try {
            if (html5QrCodeRef.current) {
                const state = html5QrCodeRef.current.getState?.();
                if (state === 2 /* SCANNING */) {
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
        let cancelled = false;

        const startScanner = async () => {
            try {
                const { Html5Qrcode, Html5QrcodeScanType } = await import('html5-qrcode');
                if (cancelled) return;

                const scannerId = 'camera-scanner-reader';
                const container = scannerRef.current;
                if (!container) return;

                // Remove any leftover elements
                container.innerHTML = '';
                const div = document.createElement('div');
                div.id = scannerId;
                container.appendChild(div);

                const scanner = new Html5Qrcode(scannerId);
                html5QrCodeRef.current = scanner;

                await scanner.start(
                    { facingMode: 'environment' },
                    {
                        fps: 10,
                        qrbox: { width: 280, height: 160 },
                        aspectRatio: 1.5,
                        // @ts-expect-error — supportedScanTypes exists at runtime but is absent from older type definitions
                        supportedScanTypes: [Html5QrcodeScanType.SCAN_TYPE_CAMERA],
                    },
                    (decodedText: string) => {
                        if (hasScannedRef.current) return;
                        hasScannedRef.current = true;
                        onScan(decodedText);
                        stopScanner();
                    },
                    () => { /* ignore scan errors */ }
                );

                if (cancelled) {
                    stopScanner();
                    return;
                }

                setScanning(true);
                setError(null);
            } catch (err: any) {
                if (!cancelled) {
                    const msg = err?.message || String(err);
                    if (msg.includes('Permission') || msg.includes('NotAllowed')) {
                        setError('Camera permission denied. Please allow camera access and try again.');
                    } else if (msg.includes('NotFound') || msg.includes('Requested device not found')) {
                        setError('No camera found on this device.');
                    } else {
                        setError('Could not start camera. Please try again.');
                    }
                }
            }
        };

        // Small delay to let the modal DOM render
        const timer = setTimeout(startScanner, 100);
        return () => {
            cancelled = true;
            clearTimeout(timer);
            stopScanner();
        };
    }, [open, onScan, stopScanner]);

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
                    <div ref={scannerRef} className="w-full" />
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
                                <button
                                    onClick={onClose}
                                    className="mt-3 rounded-lg bg-white/20 px-4 py-2 text-sm font-medium text-white hover:bg-white/30"
                                >
                                    Close
                                </button>
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
