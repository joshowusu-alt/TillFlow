'use client';

import Link from 'next/link';
import { startActivePolling } from '@/lib/active-polling';
import { useEffect, useRef, useState } from 'react';
import { formatMoney } from '@/lib/format';

type Attention = {
  count: number;
  newestId?: string | null;
  newestAt?: string | null;
  orders: Array<{ id: string; orderNumber: string; status: string; paymentStatus: string;
    refundStatus: string | null; salesInvoiceId: string | null; totalPence: number; currency: string;
    createdAt: string; store: { name: string } | null }>;
};

export default function OnlineOrderAttentionBanner({ scopeKey }: { scopeKey: string }) {
  const [data, setData] = useState<Attention | null>(null);
  const [stale, setStale] = useState(false);
  const [sound, setSound] = useState(false);
  const audioRef = useRef<AudioContext | null>(null);
  const newestSeenAt = useRef(0);
  const hasLoaded = useRef(false);

  useEffect(() => {
    let disposed = false;
    let inFlight = false;
    let controller: AbortController | null = null;
    async function refresh() {
      if (inFlight) return;
      inFlight = true;
      controller = new AbortController();
      const timeout = window.setTimeout(() => controller?.abort(), 10000);
      try {
        const response = await fetch('/api/online-orders/attention', { cache: 'no-store', signal: controller.signal });
        if (!response.ok || response.redirected) throw new Error('Unavailable');
        const result = await response.json() as Attention;
        if (disposed) return;
        const newestAt = result.newestAt ? new Date(result.newestAt).getTime() : 0;
        if (sound && hasLoaded.current && newestAt > newestSeenAt.current) {
          const context = audioRef.current;
          if (context) {
            try {
              await context.resume();
              const tone = context.createOscillator();
              const gain = context.createGain();
              tone.connect(gain); gain.connect(context.destination);
              tone.frequency.value = 660; gain.gain.value = 0.1;
              tone.start(); tone.stop(context.currentTime + 0.25);
            } catch { /* Visual alerts remain available when sound is blocked. */ }
          }
        }
        hasLoaded.current = true;
        newestSeenAt.current = Math.max(newestSeenAt.current, newestAt);
        setData(result); setStale(false);
      } catch {
        if (!disposed) setStale(true);
        throw new Error('Attention unavailable');
      } finally { window.clearTimeout(timeout); inFlight = false; }
    }
    const stop = startActivePolling(refresh, 15000, { maxMs: 120000 });
    return () => { disposed = true; stop(); controller?.abort(); };
  }, [scopeKey, sound]);

  useEffect(() => () => { void audioRef.current?.close(); }, []);

  if (!data?.count && !stale) return null;
  return (
    <section aria-label="Online orders needing attention" className="sticky top-[var(--app-header-offset,0px)] z-30 border-b border-amber-300 bg-amber-50 px-4 py-3 text-amber-950 shadow-sm sm:px-6">
      <div className="mx-auto flex max-w-screen-2xl flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1" role="status" aria-live="polite">
          <p className="font-bold">{data?.count ? `${data.count} online order${data.count === 1 ? '' : 's'} outstanding` : 'Online order alerts unavailable'}</p>
          {stale ? <p className="text-sm">Connection interrupted. Open orders to check the latest status.</p> : (
            <p className="text-xs">Oldest waiting {Math.max(0, Math.floor((Date.now() - new Date(data!.orders[0]?.createdAt ?? Date.now()).getTime()) / 60000))} min · Stays here until collected, cancelled or any refund is resolved.</p>
          )}
        </div>
        <button type="button" className="rounded-lg border border-amber-400 px-3 py-2 text-xs font-semibold" aria-pressed={sound}
          onClick={async () => {
            try {
              if (!sound) { audioRef.current ??= new AudioContext(); await audioRef.current.resume(); }
              setSound(!sound);
            } catch { setSound(false); }
          }}>{sound ? 'Sound on' : 'Enable sound'}</button>
        <Link href="/online-orders" className="rounded-lg bg-amber-950 px-4 py-2 text-sm font-bold text-white">Open orders</Link>
      </div>
      {data?.count ? <ul className="mx-auto mt-2 flex max-w-screen-2xl gap-2 overflow-x-auto pb-1" aria-label="Oldest outstanding orders">
        {data.orders.map(order => {
          const label = order.refundStatus === 'MANUAL_REFUND_NEEDED' ? 'Refund needed'
            : order.paymentStatus === 'PAID' && !order.salesInvoiceId ? 'Sale posting needs attention'
            : ({ AWAITING_PAYMENT: 'Awaiting payment', PAYMENT_FAILED: 'Payment failed', PAID: 'Payment confirmed', PROCESSING: 'Being prepared', READY_FOR_PICKUP: 'Ready for pickup' } as Record<string, string>)[order.status] ?? order.status;
          return <li key={order.id} className="shrink-0 rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs">
            <Link href={`/online-orders?order=${encodeURIComponent(order.id)}#order-${order.id}`} className="font-bold underline underline-offset-2">{order.orderNumber}</Link>
            <span className="ml-2">{label} · {formatMoney(order.totalPence, order.currency)} · {order.store?.name}</span>
          </li>;
        })}
      </ul> : null}
    </section>
  );
}
