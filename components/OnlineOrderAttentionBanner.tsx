'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

type Attention = {
  eligible?: boolean;
  count: number;
  newestAt?: string | null;
  orders: Array<{ id: string; orderNumber: string }>;
};
const REFRESH_MS = 15_000;
export const OUTAGE_THRESHOLD_MS = 25_000;

export default function OnlineOrderAttentionBanner({ scopeKey, eligible }: { scopeKey: string; eligible: boolean }) {
  return eligible ? <OnlineOrderAttention key={scopeKey} scopeKey={scopeKey} /> : null;
}

function OnlineOrderAttention({ scopeKey }: { scopeKey: string }) {
  const [data, setData] = useState<Attention | null>(null);
  const [paused, setPaused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [sound, setSound] = useState(false);
  const soundEnabled = useRef(false);
  const audioRef = useRef<AudioContext | null>(null);
  const newestSeenAt = useRef(0);
  const hasLoaded = useRef(false);
  const dismissalKey = `tillflow:order-alerts-dismissed:${scopeKey}`;

  useEffect(() => {
    try { setDismissed(sessionStorage.getItem(dismissalKey) === '1'); } catch { /* In-memory dismissal still works. */ }
  }, [dismissalKey]);

  useEffect(() => {
    let disposed = false;
    let noLongerEligible = false;
    let inFlight = false;
    let controller: AbortController | null = null;
    let failureSince: number | null = null;

    function recordFailure() {
      if (disposed || noLongerEligible || document.visibilityState !== 'visible') return;
      const now = Date.now();
      failureSince ??= now;
      // Require a fresh failed observation, not a timeout that fires on tab wake.
      if (now - failureSince >= OUTAGE_THRESHOLD_MS) setPaused(true);
    }

    async function refresh() {
      if (inFlight || disposed || noLongerEligible || document.visibilityState !== 'visible') return;
      if (navigator.onLine === false) { recordFailure(); return; }
      inFlight = true;
      const request = new AbortController();
      controller = request;
      const timeout = window.setTimeout(() => request.abort(), 10_000);
      try {
        const response = await fetch('/api/online-orders/attention', { cache: 'no-store', signal: request.signal });
        if (!response.ok || response.redirected) throw new Error('Unavailable');
        const result = await response.json() as Attention;
        if (disposed || document.visibilityState !== 'visible') return;
        if (result.eligible === false) {
          noLongerEligible = true;
          setData(null);
          setPaused(false);
          window.clearInterval(timer);
          return;
        }
        if (!Number.isFinite(result.count) || !Array.isArray(result.orders)) throw new Error('Unavailable');
        failureSince = null;
        setPaused(false);
        setData(result);
        const newestAt = result.newestAt ? new Date(result.newestAt).getTime() : 0;
        const shouldSound = soundEnabled.current && hasLoaded.current && newestAt > newestSeenAt.current;
        hasLoaded.current = true;
        newestSeenAt.current = Math.max(newestSeenAt.current, newestAt);
        if (shouldSound && audioRef.current) {
          try {
            const context = audioRef.current;
            await context.resume();
            if (disposed || !soundEnabled.current) return;
            const tone = context.createOscillator();
            const gain = context.createGain();
            tone.connect(gain); gain.connect(context.destination);
            tone.frequency.value = 660; gain.gain.value = 0.1;
            tone.start(); tone.stop(context.currentTime + 0.25);
          } catch { /* Visual alerts remain available when sound is blocked. */ }
        }
      } catch {
        recordFailure();
      } finally {
        window.clearTimeout(timeout);
        inFlight = false;
      }
    }

    function onVisibility() {
      if (document.visibilityState !== 'visible') {
        // Time spent in the background is not evidence of a continuous outage.
        failureSince = null;
        setPaused(false);
        return;
      }
      void refresh();
    }
    const onFocus = () => void refresh();
    const timer = window.setInterval(onFocus, REFRESH_MS);
    void refresh();
    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onFocus);
    window.addEventListener('offline', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      disposed = true;
      controller?.abort();
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onFocus);
      window.removeEventListener('offline', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  useEffect(() => () => { void audioRef.current?.close(); }, []);

  function dismiss() {
    setDismissed(true);
    try { sessionStorage.setItem(dismissalKey, '1'); } catch { /* Session storage can be unavailable. */ }
  }

  // Outstanding orders remain actionable after recovery, even if the outage
  // notice was dismissed. Never present an old count during a known outage.
  if (paused ? dismissed : !data?.count) return null;
  const label = paused ? 'Order alerts paused' : `${data!.count} online order${data!.count === 1 ? '' : 's'} outstanding`;
  const oldest = paused ? undefined : data?.orders[0];
  return (
    <section aria-label={paused ? 'Order alerts paused' : 'Online orders needing attention'}
      data-online-order-notice={paused ? 'paused' : 'outstanding'}
      className="border-b border-amber-200 bg-amber-50 px-3 text-amber-950 sm:px-5">
      <div className="mx-auto flex h-[39px] min-w-0 max-w-screen-2xl items-center gap-2 whitespace-nowrap text-xs font-semibold lg:gap-3 lg:text-sm">
        <Link href="/online-orders" aria-label={`${label} · Open orders`} className="flex h-full min-w-0 flex-1 items-center gap-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
          <span role="status" aria-live="polite" className="truncate">{label}</span>
          <span className="shrink-0">· <span className="text-accent underline underline-offset-2">Open orders</span></span>
        </Link>
        {oldest ? <Link href={`/online-orders?order=${encodeURIComponent(oldest.id)}#order-${oldest.id}`} className="hidden min-w-0 truncate text-accent underline underline-offset-2 lg:block">{oldest.orderNumber}</Link> : null}
        <button type="button" className="hidden h-full shrink-0 text-accent underline underline-offset-2 lg:inline-flex lg:items-center" aria-pressed={sound}
          onClick={async () => {
            try {
              if (!soundEnabled.current) { audioRef.current ??= new AudioContext(); await audioRef.current.resume(); }
              soundEnabled.current = !soundEnabled.current;
              setSound(soundEnabled.current);
            } catch { soundEnabled.current = false; setSound(false); }
          }}>{sound ? 'Sound on' : 'Enable sound'}</button>
        {paused ? <button type="button" aria-label="Dismiss order alerts for this session" onClick={dismiss} className="flex h-full w-10 shrink-0 items-center justify-center rounded text-amber-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"><span aria-hidden="true" className="text-lg">×</span></button> : null}
      </div>
    </section>
  );
}
