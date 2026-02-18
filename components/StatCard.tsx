type StatCardProps = {
  label: string;
  value: string;
  tone?: 'default' | 'accent' | 'danger' | 'success' | 'warn';
  helper?: string;
};

const tones = {
  default: 'border-gray-200 bg-white',
  accent:  'border-blue-200 bg-blue-50',
  danger:  'border-red-200 bg-red-50',
  success: 'border-emerald-200 bg-emerald-50',
  warn:    'border-amber-200 bg-amber-50',
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
    <div className={`rounded-xl border p-4 shadow-card ${tones[tone]}`}>
      <div className="text-xs font-medium uppercase tracking-wide text-muted">{label}</div>
      <div className={`mt-2 text-xl font-display font-bold tabular-nums tracking-tight ${valueColors[tone]}`}>{value}</div>
      {helper ? <div className="mt-1 text-xs text-muted">{helper}</div> : null}
    </div>
  );
}
