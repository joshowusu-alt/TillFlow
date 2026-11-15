import type { ManagedPlan } from './control-data';

export function planAfterPayment(purchasedPlan: string | null | undefined, businessPlan: string): ManagedPlan {
  const plan = purchasedPlan ?? businessPlan;
  return plan === 'PRO' || plan === 'GROWTH' ? plan : 'STARTER';
}

export function paymentPlanChangeNotice(plan: ManagedPlan | null | undefined) {
  if (!plan) return null;
  return `Recording this payment will set the TillFlow plan to ${{ STARTER: 'Starter', GROWTH: 'Growth', PRO: 'Pro' }[plan]}.`;
}
