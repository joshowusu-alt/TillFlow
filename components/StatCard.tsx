type StatCardProps = {
  label: string;
  value: string;
  tone?: 'default' | 'accent' | 'danger' | 'success' | 'warn';
  helper?: string;
};

const tones = {
  default: 'border-slate-200/80 bg-white/95',
  accent:  'border-blue-100/90 bg-gradient-to-br from-blue-50 via-white to-blue-50/70',
  danger:  'border-red-100/90 bg-gradient-to-br from-red-50 via-white to-red-50/70',
  success: 'border-emerald-100/90 bg-gradient-to-br from-emerald-50 via-white to-emerald-50/70',
  warn:    'border-amber-100/90 bg-gradient-to-br from-amber-50 via-white to-amber-50/70',
};

const stripColors = {
  default: 'bg-slate-300',
  accent:  'bg-blue-500',
  danger:  'bg-rose-500',
  success: 'bg-emerald-500',
  warn:    'bg-amber-400',
};

const valueColors = {
  default: 'text-ink',
  accent:  'text-accent',
  danger:  'text-rose',
  success: 'text-success',
  warn:    'text-amber',
};

export default function StatCard({ label, value, tone = 'default', helper }: StatCardProps) {
  return (
    <div
      className={`relative overflow-hidden rounded-[1.4rem] border p-5 transition-all duration-200 ${tones[tone]}`}
      style={{ boxShadow: '0 1px 3px rgba(15,23,42,0.05), 0 10px 30px rgba(15,23,42,0.06)' }}
    >
      <div className={`absolute inset-x-0 top-0 h-1 ${stripColors[tone]}`} />
      <div className="absolute right-4 top-4 h-10 w-10 rounded-full bg-white/70 blur-xl" aria-hidden="true" />
      <div className="relative">
        <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted">{label}</div>
        <div className={`mt-3 text-2xl font-display font-bold tabular-nums tracking-tight md:text-[2rem] ${valueColors[tone]}`}>{value}</div>
        {helper ? <div className="mt-2 text-xs leading-relaxed text-slate-500">{helper}</div> : null}
      </div>
    </div>
  );
}
