import type { BusinessPlan } from '@/lib/features';

const PLAN_STYLES: Record<BusinessPlan, string> = {
  STARTER: 'border-slate-200 bg-slate-50 text-slate-700',
  GROWTH: 'border-blue-200 bg-blue-50 text-blue-700',
  PRO: 'border-emerald-200 bg-emerald-50 text-emerald-700',
};

export default function PlanFeatureBadge({
  plan,
  label,
}: {
  plan: BusinessPlan;
  label?: string;
}) {
  return (
    <span className={`inline-flex items-center justify-center rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${PLAN_STYLES[plan]}`}>
      {label ?? `${plan} feature`}
    </span>
  );
}