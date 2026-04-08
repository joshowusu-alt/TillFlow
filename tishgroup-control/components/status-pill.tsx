import type { BusinessHealth, ManagedState, ManagedPlan } from '@/lib/control-data';

type PillTone = 'teal' | 'gold' | 'ember' | 'red' | 'slate' | 'moss';

const tones: Record<PillTone, string> = {
  teal: 'border-teal-200 bg-teal-50 text-teal-800',
  gold: 'border-amber-200 bg-amber-50 text-amber-800',
  ember: 'border-orange-200 bg-orange-50 text-orange-800',
  red: 'border-rose-200 bg-rose-50 text-rose-800',
  slate: 'border-slate-200 bg-slate-50 text-slate-700',
  moss: 'border-emerald-200 bg-emerald-50 text-emerald-800',
};

function stateTone(state: ManagedState): PillTone {
  switch (state) {
    case 'ACTIVE':
      return 'moss';
    case 'TRIAL':
      return 'teal';
    case 'DUE_SOON':
      return 'gold';
    case 'GRACE':
      return 'ember';
    case 'STARTER_FALLBACK':
      return 'ember';
    case 'READ_ONLY':
      return 'red';
    default:
      return 'slate';
  }
}

function healthTone(health: BusinessHealth): PillTone {
  switch (health) {
    case 'HEALTHY':
      return 'moss';
    case 'WATCH':
      return 'gold';
    case 'AT_RISK':
      return 'red';
    default:
      return 'slate';
  }
}

export function StatePill({ state }: { state: ManagedState }) {
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${tones[stateTone(state)]}`}>{state.replace('_', ' ')}</span>;
}

export function PlanPill({ plan }: { plan: ManagedPlan }) {
  const tone = plan === 'PRO' ? tones.teal : plan === 'GROWTH' ? tones.gold : tones.slate;
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${tone}`}>{plan}</span>;
}

export function HealthPill({ health }: { health: BusinessHealth }) {
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${tones[healthTone(health)]}`}>{health.replace('_', ' ')}</span>;
}