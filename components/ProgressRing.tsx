type ProgressRingProps = {
  value: number; // 0–100
  size?: number;
  strokeWidth?: number;
  grade: 'GREEN' | 'AMBER' | 'RED';
};

const gradeColors: Record<string, { stroke: string; text: string; bg: string }> = {
  GREEN: { stroke: 'stroke-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-50' },
  AMBER: { stroke: 'stroke-amber-500', text: 'text-amber-700', bg: 'bg-amber-50' },
  RED: { stroke: 'stroke-rose-500', text: 'text-rose-700', bg: 'bg-rose-50' },
};

export default function ProgressRing({
  value,
  size = 120,
  strokeWidth = 10,
  grade,
}: ProgressRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(Math.max(value, 0), 100) / 100) * circumference;
  const colors = gradeColors[grade] ?? gradeColors.GREEN;

  return (
    <div className={`relative inline-flex items-center justify-center rounded-full ${colors.bg}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-gray-200"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={`${colors.stroke} transition-all duration-700 ease-out`}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className={`text-2xl font-display font-bold tabular-nums ${colors.text}`}>
          {Math.round(value)}
        </span>
        <span className={`text-[10px] font-semibold uppercase tracking-wider ${colors.text}`}>
          {grade === 'GREEN' ? 'Healthy' : grade === 'AMBER' ? 'Caution' : 'At Risk'}
        </span>
      </div>
    </div>
  );
}
