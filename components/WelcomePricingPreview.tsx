'use client';

import Link from 'next/link';
import { useState } from 'react';

type BillingCycle = 'monthly' | 'yearly';

export type WelcomePlanPreview = {
  name: string;
  monthlyPrice: number;
  note: string;
  featured?: boolean;
  bullets: string[];
  addon?: {
    name: string;
    monthlyPrice: number;
    description: string;
  };
};

function formatCedi(value: number) {
  return `GH₵${value.toLocaleString('en-GH')}`;
}

function yearlyPrice(monthlyPrice: number) {
  return monthlyPrice * 10;
}

function yearlySavings(monthlyPrice: number) {
  return monthlyPrice * 2;
}

export default function WelcomePricingPreview({ plans }: { plans: WelcomePlanPreview[] }) {
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('monthly');

  return (
    <div className="mt-7 rounded-[1.75rem] border border-border bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted">Simple pricing</div>
          <div className="mt-2 text-sm leading-6 text-ink/50">
            Switch between monthly and yearly billing. Yearly gives 2 months off.
          </div>
          <div className="mt-1 text-xs leading-5 text-muted">
            Growth is best for most owner-led retail businesses.
          </div>
        </div>

        <div className="inline-flex items-center gap-1 rounded-full border border-border bg-surfaceMuted p-1 shadow-sm">
          <button
            type="button"
            onClick={() => setBillingCycle('monthly')}
            className={`min-h-11 rounded-full px-4 py-2 text-xs font-semibold transition ${billingCycle === 'monthly' ? 'bg-white text-ink shadow-sm' : 'text-muted hover:text-ink/70'}`}
          >
            Monthly
          </button>
          <button
            type="button"
            onClick={() => setBillingCycle('yearly')}
            className={`min-h-11 rounded-full px-4 py-2 text-xs font-semibold transition ${billingCycle === 'yearly' ? 'bg-accent text-white shadow-sm' : 'text-muted hover:text-ink/70'}`}
          >
            Yearly
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        {plans.map((plan) => {
          const isYearly = billingCycle === 'yearly';
          const displayPrice = isYearly ? yearlyPrice(plan.monthlyPrice) : plan.monthlyPrice;
          const cadence = isYearly ? '/year' : '/month';

          return (
            <div
              key={plan.name}
              className={`flex flex-col rounded-2xl border bg-white px-4 py-4 text-left ${plan.featured ? 'border-accent/25 shadow-lg shadow-accent/10 ring-1 ring-accent/10' : 'border-border shadow-sm'}`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-semibold text-ink">{plan.name}</div>
                {plan.featured ? (
                  <span className="rounded-full bg-accentSoft px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">
                    Recommended
                  </span>
                ) : null}
              </div>

              <div className="mt-1 flex items-end gap-1">
                <span className="text-2xl font-bold font-display text-accent">{formatCedi(displayPrice)}</span>
                <span className="pb-0.5 text-xs text-muted">{cadence}</span>
              </div>

              {isYearly ? (
                <div className="mt-1 text-xs font-medium text-ink/55">
                  Equivalent to {formatCedi(Math.round(yearlyPrice(plan.monthlyPrice) / 12))}/month
                </div>
              ) : null}

              <div className="mt-1 inline-flex rounded-full bg-accentSoft px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">
                Save {formatCedi(yearlySavings(plan.monthlyPrice))} yearly
              </div>

              <div className="mt-3 text-xs font-medium text-ink/50">{plan.note}</div>
              <div className="mt-3 flex-1 space-y-1.5">
                {plan.bullets.map((bullet) => (
                  <div key={bullet} className="flex items-start gap-2 text-xs leading-5 text-ink/50">
                    <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-accent" />
                    <span>{bullet}</span>
                  </div>
                ))}
              </div>

              {plan.addon ? (
                <div className="mt-3 rounded-xl border border-dashed border-accent/25 bg-accentSoft/40 px-3 py-2.5 text-left">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">Add-on</span>
                    <span className="text-xs font-bold text-accent">+{formatCedi(plan.addon.monthlyPrice)}/mo</span>
                  </div>
                  <div className="mt-1 text-xs font-semibold text-ink">{plan.addon.name}</div>
                  <div className="mt-0.5 text-[11px] leading-4 text-ink/55">{plan.addon.description}</div>
                </div>
              ) : null}

              <Link
                href="/register"
                className={
                  plan.featured
                    ? 'mt-5 inline-flex min-h-11 items-center justify-center rounded-xl bg-gradient-to-r from-accent to-accent/80 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-accent/25 transition-all hover:shadow-xl hover:shadow-accent/30 hover:-translate-y-0.5'
                    : 'mt-5 inline-flex min-h-11 items-center justify-center rounded-xl border border-border bg-white px-4 py-2.5 text-sm font-semibold text-ink transition-all hover:border-accent/30 hover:text-accent'
                }
              >
                Start free trial
              </Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}
