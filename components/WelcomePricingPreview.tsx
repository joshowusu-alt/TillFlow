'use client';

import { useState } from 'react';

type BillingCycle = 'monthly' | 'yearly';

export type WelcomePlanPreview = {
  name: string;
  monthlyPrice: number;
  note: string;
  featured?: boolean;
  bullets: string[];
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
    <div className="mt-8 rounded-[1.75rem] border border-black/5 bg-white/80 p-5 shadow-sm backdrop-blur-sm sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-black/35">Simple pricing</div>
          <div className="mt-2 text-sm text-black/50">
            Switch between monthly and yearly billing. Yearly gives 2 months off.
          </div>
          <div className="mt-2 text-xs text-black/40">
            Most owner-led stores will feel at home on Growth. Starter is for a lean start, and Pro is for broader operational control.
          </div>
        </div>

        <div className="inline-flex items-center gap-1 rounded-full border border-black/5 bg-black/[0.03] p-1 shadow-sm">
          <button
            type="button"
            onClick={() => setBillingCycle('monthly')}
            className={`rounded-full px-4 py-2 text-xs font-semibold transition ${billingCycle === 'monthly' ? 'bg-white text-gray-900 shadow-sm' : 'text-black/45 hover:text-black/70'}`}
          >
            Monthly
          </button>
          <button
            type="button"
            onClick={() => setBillingCycle('yearly')}
            className={`rounded-full px-4 py-2 text-xs font-semibold transition ${billingCycle === 'yearly' ? 'bg-accent text-white shadow-sm' : 'text-black/45 hover:text-black/70'}`}
          >
            Yearly
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {plans.map((plan) => {
          const isYearly = billingCycle === 'yearly';
          const displayPrice = isYearly ? yearlyPrice(plan.monthlyPrice) : plan.monthlyPrice;
          const cadence = isYearly ? '/year' : '/month';

          return (
            <div
              key={plan.name}
              className={`rounded-2xl border bg-white px-4 py-4 text-left shadow-sm ${plan.featured ? 'border-accent/20 ring-1 ring-accent/10' : 'border-black/5'}`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-semibold text-gray-900">{plan.name}</div>
                {plan.featured ? (
                  <span className="rounded-full bg-accentSoft px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">
                    Most popular
                  </span>
                ) : null}
              </div>

              <div className="mt-1 flex items-end gap-1">
                <span className="text-2xl font-bold font-display text-accent">{formatCedi(displayPrice)}</span>
                <span className="pb-0.5 text-xs text-black/40">{cadence}</span>
              </div>

              {isYearly ? (
                <div className="mt-1 text-xs font-medium text-black/55">
                  Equivalent to {formatCedi(Math.round(yearlyPrice(plan.monthlyPrice) / 12))}/month
                </div>
              ) : null}

              <div className="mt-1 inline-flex rounded-full bg-accentSoft px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">
                Save {formatCedi(yearlySavings(plan.monthlyPrice))} yearly
              </div>

              <div className="mt-3 text-xs font-medium text-black/50">{plan.note}</div>
              <div className="mt-4 space-y-2">
                {plan.bullets.map((bullet) => (
                  <div key={bullet} className="flex items-start gap-2 text-xs leading-5 text-black/50">
                    <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-accent" />
                    <span>{bullet}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}