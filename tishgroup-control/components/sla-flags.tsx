import type { SlaFlag } from '@/lib/sla';

const TONE_CLASS: Record<SlaFlag['tone'], string> = {
  amber: 'border-amber-300 bg-amber-50 text-amber-800',
  red: 'border-red-300 bg-red-50 text-red-700',
};

export default function SlaFlags({ flags, compact }: { flags: SlaFlag[]; compact?: boolean }) {
  if (flags.length === 0) return null;
  const sizing = compact ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-[11px]';
  return (
    <div className="flex flex-wrap gap-1.5">
      {flags.map((flag) => (
        <span
          key={`${flag.reason}-${flag.label}`}
          className={`inline-flex items-center gap-1 rounded-full border font-semibold uppercase tracking-[0.16em] ${sizing} ${TONE_CLASS[flag.tone]}`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${flag.tone === 'red' ? 'bg-red-500' : 'bg-amber-500'}`} aria-hidden="true" />
          {flag.label}
        </span>
      ))}
    </div>
  );
}
