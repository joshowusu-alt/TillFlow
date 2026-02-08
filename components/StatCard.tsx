type StatCardProps = {
  label: string;
  value: string;
  tone?: 'default' | 'accent' | 'danger';
  helper?: string;
};

const tones = {
  default: 'border-black/5 bg-white/90',
  accent: 'border-accent/30 bg-accentSoft',
  danger: 'border-rose/30 bg-rose/10'
};

export default function StatCard({ label, value, tone = 'default', helper }: StatCardProps) {
  return (
    <div className={`rounded-2xl border p-4 shadow-card ${tones[tone]}`}>
      <div className="text-xs uppercase tracking-wide text-black/50">{label}</div>
      <div className="mt-2 text-xl font-display font-semibold">{value}</div>
      {helper ? <div className="mt-1 text-xs text-black/50">{helper}</div> : null}
    </div>
  );
}
