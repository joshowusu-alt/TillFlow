type SparklineProps = {
  values: number[];
  width?: number;
  height?: number;
  /** Tone determines stroke + fill colours. */
  tone?: 'teal' | 'gold' | 'ember' | 'ink';
  className?: string;
  /** Optional aria label for screen readers. */
  ariaLabel?: string;
};

const TONE_STROKE: Record<NonNullable<SparklineProps['tone']>, string> = {
  teal: '#1f8a82',
  gold: '#e2a83d',
  ember: '#b35c2e',
  ink: '#122126',
};

const TONE_FILL: Record<NonNullable<SparklineProps['tone']>, string> = {
  teal: 'rgba(31, 138, 130, 0.12)',
  gold: 'rgba(226, 168, 61, 0.14)',
  ember: 'rgba(179, 92, 46, 0.14)',
  ink: 'rgba(18, 33, 38, 0.12)',
};

/**
 * Tiny inline SVG sparkline. Server-renderable, no JS required.
 * Used on the portfolio dashboard to show trading rhythm at a glance.
 */
export default function Sparkline({
  values,
  width = 96,
  height = 28,
  tone = 'teal',
  className,
  ariaLabel,
}: SparklineProps) {
  if (values.length === 0) {
    return (
      <div
        className={`inline-flex items-center text-[10px] font-semibold uppercase tracking-[0.16em] text-black/35 ${className ?? ''}`}
        style={{ width, height }}
      >
        no data
      </div>
    );
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = values.length > 1 ? width / (values.length - 1) : 0;

  const points = values.map((value, index) => {
    const x = stepX * index;
    const y = height - ((value - min) / range) * height;
    return `${x},${y}`;
  });

  const linePath = `M ${points.join(' L ')}`;
  const areaPath = `${linePath} L ${stepX * (values.length - 1)},${height} L 0,${height} Z`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className={className}
      role={ariaLabel ? 'img' : 'presentation'}
      aria-label={ariaLabel}
    >
      <path d={areaPath} fill={TONE_FILL[tone]} />
      <path d={linePath} fill="none" stroke={TONE_STROKE[tone]} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={stepX * (values.length - 1)} cy={height - ((values[values.length - 1] - min) / range) * height} r={2} fill={TONE_STROKE[tone]} />
    </svg>
  );
}
