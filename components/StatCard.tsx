type StatCardProps = {
  label: string;
  value: string;
  tone?: 'default' | 'accent' | 'danger' | 'success' | 'warn';
  helper?: string;
};

const tones = {
  default: 'border-gray-100 bg-white',
  accent:  'border-blue-100 bg-blue-50/60',
  danger:  'border-red-100 bg-red-50/60',
  success: 'border-emerald-100 bg-emerald-50/60',
  warn:    'border-amber-100 bg-amber-50/60',
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
    <div className={`relative overflow-hidden rounded-2xl border p-4 transition-shadow hover:shadow-md ${tones[tone]}`}
         style={{ boxShadow: '0 1px 3px rgba(15,23,42,0.05), 0 4px 16px rgba(15,23,42,0.06)' }}>
      {/* Colored accent strip */}
      <div className={`absolute inset-x-0 top-0 h-[3px] ${stripColors[tone]}`} />
      <div className="pt-1 text-xs font-semibold uppercase tracking-widest text-muted">{label}</div>
      <div className={`mt-1.5 text-2xl font-display font-bold tabular-nums tracking-tight ${valueColors[tone]}`}>{value}</div>
      {helper ? <div className="mt-1 text-xs text-muted">{helper}</div> : null}
    </div>
  );
}
