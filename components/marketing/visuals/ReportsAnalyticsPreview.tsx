import CountUp from '@/components/marketing/CountUp';
import { DEMO_ANALYTICS, DEMO_KPI_NUMBERS } from '@/lib/marketing/demo-metrics';

export function ReportsAnalyticsPreview({ className = '' }: { className?: string }) {
  const metrics = [
    { label: 'Revenue', value: <CountUp value={DEMO_KPI_NUMBERS.revenue} prefix="GH₵" /> },
    { label: 'Gross profit', value: <CountUp value={DEMO_KPI_NUMBERS.grossProfit} prefix="GH₵" /> },
    { label: 'Margin', value: <CountUp value={DEMO_KPI_NUMBERS.grossMargin} suffix="%" decimals={1} /> },
    { label: 'Transactions', value: <CountUp value={DEMO_KPI_NUMBERS.transactions} /> },
  ];

  return (
    <div className={`operational-page rounded-[1.25rem] border border-slate-200/80 bg-white p-4 shadow-card ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="inline-flex rounded-full border border-blue-100 bg-blue-50/80 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">
            Trend analytics
          </span>
          <h4 className="mt-2 text-base font-display font-bold text-ink">Owner report</h4>
        </div>
        <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700">Today</span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        {metrics.map((metric) => (
          <div key={metric.label} className="rounded-xl border border-black/5 bg-slate-50/70 p-3">
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">{metric.label}</div>
            <div className="mt-1 text-lg font-display font-bold tabular-nums text-ink">{metric.value}</div>
          </div>
        ))}
      </div>

      <div className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50/50 p-3">
        <div className="flex items-end gap-1.5">
          {DEMO_ANALYTICS.trend.map((height, index) => (
            <div
              key={index}
              className="welcome-chart-bar min-h-3 flex-1 rounded-t bg-emerald-500/80"
              style={{ height: `${height}px`, animationDelay: `${index * 70}ms` }}
            />
          ))}
        </div>
        <div className="mt-1.5 flex gap-1.5">
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, index) => (
            <span key={index} className="flex-1 text-center text-[9px] font-semibold uppercase text-emerald-900/40">
              {day}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-xl border border-black/5 bg-white p-3">
          <div className="text-black/45">Top product</div>
          <div className="mt-1 font-semibold text-ink">{DEMO_ANALYTICS.topProduct}</div>
        </div>
        <div className="rounded-xl border border-black/5 bg-white p-3">
          <div className="text-black/45">Peak hour</div>
          <div className="mt-1 font-semibold text-ink">{DEMO_ANALYTICS.peakHour}</div>
        </div>
      </div>
    </div>
  );
}
