export type PrintTelemetryEvent = {
  kind: 'receipt' | 'label';
  mode: string;
  success: boolean;
  error?: string;
  printerName?: string | null;
  durationMs?: number;
};

/**
 * Fire-and-forget telemetry ping after a print attempt.
 *
 * Uses navigator.sendBeacon when available (survives page unload) and falls
 * back to a no-keepalive fetch. Errors are swallowed — telemetry never blocks
 * the user.
 */
export function reportPrintEvent(event: PrintTelemetryEvent) {
  if (typeof window === 'undefined') return;

  const body = JSON.stringify({
    ...event,
    error: event.error ? event.error.slice(0, 300) : undefined,
  });

  try {
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([body], { type: 'application/json' });
      const ok = navigator.sendBeacon('/api/telemetry/print', blob);
      if (ok) return;
    }

    void fetch('/api/telemetry/print', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {
      // swallow — telemetry is best-effort
    });
  } catch {
    // swallow — telemetry is best-effort
  }
}
