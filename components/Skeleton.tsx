type SkeletonVariant = 'line' | 'card' | 'stat' | 'table-row' | 'chart';

type SkeletonProps = {
  variant?: SkeletonVariant;
  count?: number;
  className?: string;
};

const base = 'animate-shimmer rounded bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 bg-[length:200%_100%]';

function SkeletonLine({ className }: { className?: string }) {
  return <div className={`${base} h-4 w-full ${className ?? ''}`} />;
}

function SkeletonStat() {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-card">
      <div className={`${base} mb-3 h-3 w-24`} />
      <div className={`${base} h-7 w-32`} />
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-card space-y-3">
      <div className={`${base} h-5 w-40`} />
      <div className={`${base} h-4 w-full`} />
      <div className={`${base} h-4 w-3/4`} />
      <div className={`${base} h-4 w-5/6`} />
    </div>
  );
}

function SkeletonTableRow() {
  return (
    <tr>
      {[1, 2, 3, 4].map((i) => (
        <td key={i} className="px-3 py-3">
          <div className={`${base} h-4 w-full`} />
        </td>
      ))}
    </tr>
  );
}

function SkeletonChart() {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-card">
      <div className={`${base} mb-4 h-5 w-40`} />
      <div className={`${base} h-48 w-full rounded-lg`} />
    </div>
  );
}

const renderers: Record<SkeletonVariant, (i: number) => React.ReactNode> = {
  line: (i) => <SkeletonLine key={i} />,
  stat: (i) => <SkeletonStat key={i} />,
  card: (i) => <SkeletonCard key={i} />,
  'table-row': (i) => <SkeletonTableRow key={i} />,
  chart: (i) => <SkeletonChart key={i} />,
};

export default function Skeleton({ variant = 'line', count = 1, className }: SkeletonProps) {
  const items = Array.from({ length: count }, (_, i) => renderers[variant](i));

  if (variant === 'line') {
    return <div className={`space-y-2 ${className ?? ''}`}>{items}</div>;
  }
  if (variant === 'table-row') {
    return <>{items}</>;
  }
  return <>{items}</>;
}
