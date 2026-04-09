import type { BusinessPlan } from './features';

export const PLAN_MONTHLY_PRICES: Record<BusinessPlan, number> = {
  STARTER: 199,
  GROWTH: 349,
  PRO: 699,
};

export function getAnnualPlanPrice(monthlyPrice: number) {
  return monthlyPrice * 10;
}

export function getAnnualPlanSavings(monthlyPrice: number) {
  return monthlyPrice * 2;
}