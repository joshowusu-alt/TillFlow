'use client';

import Link from 'next/link';
import { useState } from 'react';
import RevealOnScroll from '@/components/marketing/RevealOnScroll';

type BillingCycle = 'monthly' | 'yearly';

export type WelcomePlanPreview = {
  name: string;
  monthlyPrice: number;
  note: string;
  /** Stage-of-control identity shown above the plan name. */
  maturity?: string;
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
          <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted">Stages of control</div>
          <div className="mt-2 text-sm leading-6 text-ink/50">
            {billingCycle === 'yearly'
              ? "You're on yearly billing — 2 months free versus paying monthly."
              : 'Switch to yearly and get 2 months off.'}
          </div>
          <div className="mt-1 text-xs leading-5 text-muted">
            Growth is Owner View — see what is happening without standing at the counter all day.
          </div>
        </div>

        <div className="inline-flex items-center gap-1 rounded-full border border-border bg-surfaceMuted p-1 shadow-sm">
          <button
            type="button"
            onClick={() => setBillingCycle('monthly')}
            aria-pressed={billingCycle === 'monthly'}
            className={`min-h-11 rounded-full px-4 py-2 text-xs font-semibold transition duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ${billingCycle === 'monthly' ? 'bg-white text-ink shadow-sm' : 'text-muted hover:text-ink/70'}`}
          >
            Monthly
          </button>
          <button
            type="button"
            onClick={() => setBillingCycle('yearly')}
            aria-pressed={billingCycle === 'yearly'}
            className={`min-h-11 rounded-full px-4 py-2 text-xs font-semibold transition duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ${billingCycle === 'yearly' ? 'bg-accent text-white shadow-sm' : 'text-muted hover:text-ink/70'}`}
          >
            Yearly
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        {plans.map((plan, index) => {
          const isYearly = billingCycle === 'yearly';
          const displayPrice = isYearly ? yearlyPrice(plan.monthlyPrice) : plan.monthlyPrice;
          const cadence = isYearly ? '/year' : '/month';
          const ctaLabel = plan.featured ? 'Start Growth trial' : `Try ${plan.name}`;

          return (
            <RevealOnScroll key={plan.name} delayMs={index * 60}>
              <div
                data-testid={`plan-card-${plan.name.toLowerCase()}`}
                className={`flex h-full flex-col rounded-2xl border bg-white px-4 py-4 text-left ${plan.featured ? 'border-accent/25 shadow-md ring-1 ring-accent/10' : 'border-border shadow-sm'}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    {plan.maturity ? (
                      <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">{plan.maturity}</div>
                    ) : null}
                    <div className={`text-sm font-semibold text-ink ${plan.maturity ? 'mt-1' : ''}`}>{plan.name}</div>
                  </div>
                  {plan.featured ? (
                    <span className="rounded-full bg-accentSoft px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">
                      Recommended
                    </span>
                  ) : null}
                </div>

                <div key={billingCycle} className="welcome-price-fade">
                  <div className="mt-1 flex items-end gap-1">
                    <span data-testid={`plan-price-${plan.name.toLowerCase()}`} className="text-2xl font-bold font-display text-accent">
                      {formatCedi(displayPrice)}
                    </span>
                    <span className="pb-0.5 text-xs text-muted">{cadence}</span>
                  </div>

                  {isYearly ? (
                    <>
                      <div className="mt-1 text-xs font-medium text-ink/55">
                        Equivalent to {formatCedi(Math.round(yearlyPrice(plan.monthlyPrice) / 12))}/month
                      </div>
                      <div className="mt-1 inline-flex rounded-full bg-accentSoft px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">
                        Save {formatCedi(yearlySavings(plan.monthlyPrice))} yearly
                      </div>
                    </>
                  ) : null}
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

                {/* Secondary trial actions — visually quieter than the page WhatsApp primary. */}
                <Link
                  href="/register"
                  className="mt-5 inline-flex min-h-11 items-center justify-center rounded-xl border border-border bg-white px-4 py-2.5 text-sm font-semibold text-ink/70 transition-all duration-150 hover:border-accent/30 hover:text-accent active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
                >
                  {ctaLabel}
                </Link>
              </div>
            </RevealOnScroll>
          );
        })}
      </div>
    </div>
  );
}
