type BadgeTone = 'success' | 'warn' | 'danger' | 'info' | 'neutral';

type BadgeProps = {
  tone: BadgeTone;
  children: React.ReactNode;
  size?: 'sm' | 'md';
};

const toneClasses: Record<BadgeTone, string> = {
  success: 'bg-emerald-100 text-emerald-700',
  warn: 'bg-amber-100 text-amber-700',
  danger: 'bg-rose-100 text-rose-700',
  info: 'bg-sky-100 text-sky-700',
  neutral: 'bg-gray-100 text-gray-600',
};

const sizeClasses = {
  sm: 'px-2 py-0.5 text-[11px]',
  md: 'px-2.5 py-1 text-xs',
};

export default function Badge({ tone, children, size = 'sm' }: BadgeProps) {
  return (
    <span className={`inline-flex items-center rounded-full font-semibold ${toneClasses[tone]} ${sizeClasses[size]}`}>
      {children}
    </span>
  );
}
