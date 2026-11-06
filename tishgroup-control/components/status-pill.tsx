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
    case 'PAID_ACTIVE':
      return 'moss';
    case 'CANCELLED':
      return 'slate';
    case 'TRIAL_ACTIVE':
    case 'TRIAL_DUE_SOON':
      return 'teal';
    case 'TRIAL_DUE_TODAY':
    case 'RENEWAL_DUE_SOON':
    case 'PAYMENT_DUE_TODAY':
      return 'gold';
    case 'TRIAL_EXPIRED_GRACE':
    case 'PAYMENT_OVERDUE_GRACE':
    case 'TRIAL_RESTRICTED':
    case 'PAYMENT_RESTRICTED':
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

const stateLabels: Partial<Record<ManagedState, string>> = {
  PAYMENT_OVERDUE_GRACE: 'Overdue · grace',
  TRIAL_EXPIRED_GRACE: 'Trial ended · grace',
  RENEWAL_DUE_SOON: 'Renewal due soon',
  PAYMENT_DUE_TODAY: 'Payment due today',
};

export function StatePill({ state }: { state: ManagedState }) {
  return <span title={state.replace(/_/g, ' ')} className={`inline-flex max-w-full rounded-full border px-2.5 py-1 text-[11px] font-semibold ${tones[stateTone(state)]}`}>{stateLabels[state] ?? state.toLowerCase().replace(/_/g, ' ').replace(/^./, (character) => character.toUpperCase())}</span>;
}

export function PlanPill({ plan }: { plan: ManagedPlan }) {
  const tone = plan === 'PRO' ? tones.teal : plan === 'GROWTH' ? tones.gold : tones.slate;
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${tone}`}>{plan}</span>;
}

export function HealthPill({ health }: { health: BusinessHealth }) {
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${tones[healthTone(health)]}`}>{health.replace('_', ' ')}</span>;
}
