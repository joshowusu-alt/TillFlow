import { CommandCentrePreview } from '@/components/marketing/visuals/CommandCentrePreview';
import { DEMO_KPIS, DEMO_LIVE_SALE } from '@/lib/marketing/demo-metrics';

/**
 * A lightweight "sale in progress" teaser — deliberately a different, smaller
 * transaction than the completed checkout shown in the Product Proof section
 * below, so the hero previews the product without repeating it verbatim.
 */
function LiveSaleTeaser() {
  return (
    <div className="card overflow-hidden p-3 shadow-raised">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-black/40">Selling now</span>
        <span className="flex items-center gap-1 rounded-full bg-accentSoft px-2 py-0.5 text-[10px] font-semibold text-accent">
          <span className="h-1.5 w-1.5 rounded-full bg-accent motion-safe:animate-pulse" />
          Live
        </span>
      </div>
      <p className="mt-2 truncate text-sm font-semibold text-ink">{DEMO_LIVE_SALE.item}</p>
      <p className="mt-0.5 text-[11px] text-black/45">Scanning next item…</p>
      <div className="mt-2.5 flex items-center justify-between text-xs">
        <span className="text-black/50">{DEMO_LIVE_SALE.itemsSoFar} items so far</span>
        <span className="font-bold tabular-nums text-ink">{DEMO_LIVE_SALE.runningTotal}</span>
      </div>
    </div>
  );
}

/**
 * A one-line trust badge — states the headline expected-cash figure without
 * repeating the full itemised shift breakdown shown in the Product Proof section.
 */
function TillCheckTeaser() {
  return (
    <div className="card p-3 shadow-raised">
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-emerald-500 motion-safe:animate-pulse" />
        <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Shift active</span>
      </div>
      <p className="mt-2 text-[11px] text-black/50">Till should hold</p>
      <p className="mt-0.5 text-xl font-display font-bold text-emerald-700 tabular-nums">{DEMO_KPIS.expectedCash}</p>
      <p className="mt-1 text-[11px] text-black/45">Counted within GH₵15 at last close</p>
    </div>
  );
}

function MobileHeroProof() {
  const metrics = [
    { label: "Today's sales", value: DEMO_KPIS.todaySales },
    { label: 'Expected cash', value: DEMO_KPIS.expectedCash },
    { label: 'Receipts', value: DEMO_KPIS.todayReceipts },
    { label: 'Low stock', value: DEMO_KPIS.lowStock },
  ];

  return (
    <div className="rounded-[1.4rem] border border-slate-200/80 bg-white p-4 shadow-card">
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">
          Owner view
        </span>
        <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-slate-500">
          Main Branch
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        {metrics.map((metric) => (
          <div key={metric.label} className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">{metric.label}</p>
            <p className="mt-1 text-lg font-display font-bold tabular-nums text-ink">{metric.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-3 rounded-2xl border border-accent/15 bg-accentSoft/60 p-3">
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="font-semibold text-ink">Selling now</span>
          <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-accent">Live</span>
        </div>
        <p className="mt-1 truncate text-sm font-semibold text-ink">{DEMO_LIVE_SALE.item}</p>
        <p className="mt-0.5 text-xs text-ink/55">
          {DEMO_LIVE_SALE.itemsSoFar} items · {DEMO_LIVE_SALE.runningTotal}
        </p>
      </div>
    </div>
  );
}

export default function HeroProductComposition() {
  return (
    <div data-testid="hero-product-composition" className="welcome-hero-visual relative mx-auto w-full max-w-xl lg:max-w-none">
      <div className="lg:hidden">
        <MobileHeroProof />
      </div>

      <div className="hidden lg:block">
        <CommandCentrePreview />

        <div className="relative mt-3 grid grid-cols-2 gap-3">
          <div className="welcome-motion-pos relative z-20">
            <LiveSaleTeaser />
          </div>
          <div className="welcome-motion-shift relative z-10">
            <TillCheckTeaser />
          </div>
        </div>

        <p className="mt-3 text-center text-[11px] text-muted">Product preview built from TillFlow app screens · example data</p>
      </div>
    </div>
  );
}
