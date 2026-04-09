import { ReactNode } from 'react';

export default function KpiCard({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint: string;
  accent: ReactNode;
}) {
  return (
    <div className="metric-card flex flex-col justify-between">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="eyebrow">{label}</div>
          <div className="mt-3 text-[1.9rem] font-semibold tracking-tight text-control-ink sm:text-3xl">{value}</div>
        </div>
        <div className="rounded-full border border-black/5 bg-white/70 px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-black/55">
          {accent}
        </div>
      </div>
      <p className="mt-4 text-sm leading-6 text-black/62">{hint}</p>
    </div>
  );
}