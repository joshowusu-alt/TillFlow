import { DEMO_KPIS, DEMO_SHIFT_LINES } from '@/lib/marketing/demo-metrics';

export function ShiftClosePreview({ compact = false, className = '' }: { compact?: boolean; className?: string }) {
  return (
    <div className={`card p-4 shadow-raised ${className}`}>
      <div className="flex items-center gap-2">
        <div className="h-2.5 w-2.5 rounded-full bg-emerald-500 motion-safe:animate-pulse" />
        <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Shift active</span>
      </div>
      <h4 className="mt-2 text-sm font-display font-semibold text-ink">Close shift</h4>
      <p className="mt-1 text-[11px] text-black/50">Cash drawer breakdown</p>

      <div className="mt-3 space-y-1.5">
        {DEMO_SHIFT_LINES.map((line) => (
          <div key={line.label} className="flex items-center justify-between gap-2 text-[11px] sm:text-xs">
            <span className="text-black/50">{line.label}</span>
            <span
              className={`font-semibold tabular-nums ${
                line.tone === 'negative' ? 'text-rose' : 'text-ink'
              }`}
            >
              {line.value}
            </span>
          </div>
        ))}
      </div>

      <div className={`mt-4 rounded-xl border p-3 ${compact ? '' : 'sm:p-4'} border-black/10 bg-slate-50`}>
        <div className="text-[10px] font-semibold uppercase tracking-widest text-black/40">Expected cash</div>
        <div className="mt-1 text-xl font-display font-bold text-emerald-700 tabular-nums sm:text-2xl">
          {DEMO_KPIS.expectedCash}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
          <div>
            <div className="text-black/45">Actual cash</div>
            <div className="font-semibold text-ink">GH₵3,170</div>
          </div>
          <div>
            <div className="text-black/45">Variance</div>
            <div className="font-semibold text-amber-700">−GH₵15</div>
          </div>
        </div>
      </div>
    </div>
  );
}
