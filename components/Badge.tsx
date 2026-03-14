type BadgeTone = 'success' | 'warn' | 'pending' | 'danger' | 'info' | 'neutral';

type BadgeProps = {
  tone: BadgeTone;
  children: React.ReactNode;
  size?: 'sm' | 'md';
};

const toneClasses: Record<BadgeTone, string> = {
  success: 'border-emerald-200/80 bg-emerald-50 text-emerald-700',
  warn: 'border-amber-200/80 bg-amber-50 text-amber-700',
  pending: 'border-yellow-200/80 bg-yellow-50 text-yellow-700',
  danger: 'border-rose-200/80 bg-rose-50 text-rose-700',
  info: 'border-sky-200/80 bg-sky-50 text-sky-700',
  neutral: 'border-slate-200/80 bg-slate-50 text-slate-600',
};

const sizeClasses = {
  sm: 'px-2.5 py-1 text-[11px]',
  md: 'px-3 py-1.5 text-xs',
};

export default function Badge({ tone, children, size = 'sm' }: BadgeProps) {
  return (
    <span className={`inline-flex items-center rounded-full border font-semibold shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] ${toneClasses[tone]} ${sizeClasses[size]}`}>
      {children}
    </span>
  );
}
