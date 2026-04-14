import { ReactNode } from 'react';

type KpiTone = 'default' | 'teal' | 'gold' | 'ember' | 'moss';

const toneCard: Record<KpiTone, string> = {
  default: '',
  teal:    'metric-card-teal',
  gold:    'metric-card-gold',
  ember:   'metric-card-ember',
  moss:    'metric-card-moss',
};

const toneStrip: Record<KpiTone, string> = {
  default: '',
  teal:    'kpi-top-strip kpi-top-strip-teal',
  gold:    'kpi-top-strip kpi-top-strip-gold',
  ember:   'kpi-top-strip kpi-top-strip-ember',
  moss:    'kpi-top-strip kpi-top-strip-moss',
};

const toneNumber: Record<KpiTone, string> = {
  default: 'text-control-ink',
  teal:    'text-[#1a7370]',
  gold:    'text-[#b8882e]',
  ember:   'text-[#9a4a22]',
  moss:    'text-[#255842]',
};

export default function KpiCard({
  label,
  value,
  hint,
  accent,
  tone = 'default',
}: {
  label: string;
  value: string;
  hint: string;
  accent: ReactNode;
  tone?: KpiTone;
}) {
  return (
    <div className={`metric-card flex flex-col justify-between ${toneCard[tone]}`}>
      {tone !== 'default' && <span className={toneStrip[tone]} aria-hidden="true" />}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="eyebrow">{label}</div>
          <div className={`mt-2 font-display text-[1.55rem] font-bold tabular-nums tracking-tight sm:text-[1.9rem] ${toneNumber[tone]}`}>
            {value}
          </div>
        </div>
        <div className="shrink-0 rounded-full border border-black/8 bg-white/80 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-black/50">
          {accent}
        </div>
      </div>
      <p className="mt-3 text-sm leading-5 text-black/56">{hint}</p>
    </div>
  );
}
