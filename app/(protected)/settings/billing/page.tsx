import {
  requestPlanUpgradeAction,
} from '@/app/actions/settings';
import Link from 'next/link';
import FormError from '@/components/FormError';
import PageHeader from '@/components/PageHeader';
import { requireBusiness } from '@/lib/auth';
import { getFeatures, getPlanSummary, hasPlanAccess, type BusinessPlan } from '@/lib/features';
import { PLAN_MONTHLY_PRICES, getAnnualPlanPrice, getAnnualPlanSavings } from '@/lib/plan-pricing';
import { getMerchantSubscriptionMessage } from '@/lib/subscription-lifecycle';

const PLAN_ORDER: BusinessPlan[] = ['STARTER', 'GROWTH', 'PRO'];

const PLAN_DETAILS: Record<BusinessPlan, { name: string; tone: string; highlights: string[]; featured?: boolean }> = {
  STARTER: {
    name: 'Starter',
    tone: 'border-slate-200 bg-white',
    highlights: [
      'Core POS, stock, purchases, receipts, and offline selling',
      'Basic expenses, customer receipts, supplier payments, and exports',
      'Single-branch operations with day-to-day retail control',
    ],
  },
  GROWTH: {
    name: 'Growth',
    tone: 'border-blue-200 bg-blue-50/60',
    featured: true,
    highlights: [
      'Analytics, margins, reorder suggestions, and richer reporting',
      'Income statement, balance sheet, cashflow, and risk monitor',
      'Detailed expense categories and notification automation',
      'Optional: Online storefront add-on available for +GH₵200/mo',
    ],
  },
  PRO: {
    name: 'Pro',
    tone: 'border-emerald-200 bg-emerald-50/60',
    highlights: [
      'Owner dashboard, audit log, and cashflow forecast',
      'Multi-branch workflows, transfer surfaces, and broader command visibility',
      'Online storefront with mobile-money checkout included (no add-on needed)',
      'Best fit for executive oversight across more complex operations',
    ],
  },
};

const PLAN_COMPARISON_ROWS: Array<{ feature: string; includedIn: BusinessPlan[] }> = [
  {
    feature: 'Core POS, stock, purchases, receipts, and offline selling',
    includedIn: ['STARTER', 'GROWTH', 'PRO'],
  },
  {
    feature: 'Analytics, margins, reorder suggestions, and richer reporting',
    includedIn: ['GROWTH', 'PRO'],
  },
  {
    feature: 'Product labels, income statement, balance sheet, and cashflow',
    includedIn: ['GROWTH', 'PRO'],
  },
  {
    feature: 'Notification automation and risk monitoring controls',
    includedIn: ['GROWTH', 'PRO'],
  },
  {
    feature: 'Owner dashboard, audit log, and cashflow forecast',
    includedIn: ['PRO'],
  },
  {
    feature: 'Multi-branch workflows, transfers, and broader command visibility',
    includedIn: ['PRO'],
  },
  {
    feature: 'Online storefront, public checkout, and online order operations (Pro: included · Growth: +GH₵200/mo add-on)',
    includedIn: ['PRO'],
  },
];

function formatCedi(value: number) {
  return `GH₵${value.toLocaleString('en-GH')}`;
}

function formatCediFromPence(value: number) {
  return formatCedi(Math.round(value / 100));
}

function readSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function formatDateLabel(value: Date | string | null | undefined, fallback = 'Not set') {
  if (!value) return fallback;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date.toLocaleDateString('en-GB');
}

function formatDateTimeLabel(value: Date | string | null | undefined, fallback = 'Unknown date') {
  if (!value) return fallback;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime())
    ? fallback
    : date.toLocaleString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
}

function formatBillingHistoryValue(label: string, value: string) {
  if (['Start date', 'Next due', 'Paid at'].includes(label)) {
    return formatDateLabel(value, value);
  }
  if (label === 'Amount') {
    return value.replace(/^GHc\b/i, 'GH₵');
  }
  return value;
}

type BillingHistoryEntry = {
  id: string;
  title: string;
  occurredAt: string | null;
  facts: Array<{ label: string; value: string }>;
  notes: string[];
};

function parseBillingHistory(notes: string | null | undefined): BillingHistoryEntry[] {
  if (!notes?.trim()) return [];

  return notes
    .trim()
    .split(/\n\s*\n/)
    .map((chunk, index) => {
      const lines = chunk.split('\n').map((line) => line.trim()).filter(Boolean);
      const [header = '', ...rest] = lines;
      const match = header.match(/^\[(.+?)\]\s+(.*)$/);
      const facts: Array<{ label: string; value: string }> = [];
      const freeform: string[] = [];

      for (const line of rest) {
        const separatorIndex = line.indexOf(':');
        if (separatorIndex > 0) {
          facts.push({
            label: line.slice(0, separatorIndex).trim(),
            value: line.slice(separatorIndex + 1).trim(),
          });
        } else {
          freeform.push(line);
        }
      }

      return {
        id: `${match?.[1] ?? header}-${index}`,
        title: match?.[2] ?? header,
        occurredAt: match?.[1] ?? null,
        facts,
        notes: freeform,
      };
    })
    .reverse();
}

export default async function BillingPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>> | Record<string, string | string[] | undefined>;
}) {
  const resolvedSearchParams = (
    searchParams && typeof (searchParams as Promise<Record<string, string | string[] | undefined>>).then === 'function'
      ? await searchParams
      : (searchParams ?? {})
  ) as Record<string, string | string[] | undefined>;
  const { business, user } = await requireBusiness(['MANAGER', 'OWNER']);
  const features = getFeatures((business as any).plan ?? (business.mode as any), (business as any).storeMode as any);
  const effectivePlan = features.plan;
  const purchasedPlan = ((business as any).purchasedPlan as BusinessPlan | undefined) ?? effectivePlan;
  const effectivePlanSummary = getPlanSummary(effectivePlan);
  const purchasedPlanSummary = getPlanSummary(purchasedPlan);
  const accessState = String((business as any).billingAccessState ?? 'ACTIVE');
  const billingDisplayStatus = String((business as any).billingDisplayStatus ?? accessState.replace(/_/g, ' '));
  const billingSchemaReady = Boolean((business as any).billingSchemaReady ?? false);
  const canWrite = Boolean((business as any).billingCanWrite ?? true);
  const billingPrimaryBanner = (business as any).billingPrimaryBanner as string | null | undefined;
  const billingMerchantMessage = String((business as any).billingMerchantMessage ?? getMerchantSubscriptionMessage(business as any));
  const billingControlMessage = String((business as any).billingControlMessage ?? 'Billing access is being evaluated.');
  const billingNextActionLabel = String((business as any).billingNextActionLabel ?? 'View billing');
  const billingNextActionHref = String((business as any).billingNextActionHref ?? '/settings/billing');
  const billingIsPaid = Boolean((business as any).billingIsPaid ?? false);
  const billingIsOverdue = Boolean((business as any).billingIsOverdue ?? false);
  const billingIsRestricted = Boolean((business as any).billingReadOnly ?? false);
  const trialEndsAt = (business as any).trialEndsAt as Date | null | undefined;
  const planSetAt = (business as any).planSetAt as Date | null | undefined;
  const controlBillingCadenceRaw = String((business as any).controlBillingCadence ?? '').toUpperCase();
  const billingCadenceLabel = controlBillingCadenceRaw === 'ANNUAL'
    ? 'Annual'
    : controlBillingCadenceRaw === 'MONTHLY'
      ? 'Monthly'
      : 'Not recorded';
  const subscriptionStartAt = ((business as any).controlPlanStartDate as Date | null | undefined) ?? planSetAt;
  const billingNotes = (business as any).billingNotes as string | null | undefined;
  const nextPaymentDueAt = (business as any).nextPaymentDueAt as Date | null | undefined;
  const nextBillingDate = ((business as any).nextBillingDate as Date | null | undefined) ?? nextPaymentDueAt;
  const lastPaymentAt = (business as any).lastPaymentAt as Date | null | undefined;
  const firstPaymentAt = (business as any).firstPaymentAt as Date | null | undefined;
  const currentPeriodStartedAt = (business as any).currentPeriodStartedAt as Date | null | undefined;
  const currentPeriodEndsAt = (business as any).currentPeriodEndsAt as Date | null | undefined;
  const graceEndsAt = (business as any).billingGraceEndsAt as Date | null | undefined;
  const starterFallbackEndsAt = (business as any).billingStarterFallbackEndsAt as Date | null | undefined;
  const readOnlyAt = (business as any).billingReadOnlyAt as Date | null | undefined;
  const error = readSearchParam(resolvedSearchParams.error);
  const requested = readSearchParam(resolvedSearchParams.requested) === '1';
  const feature = readSearchParam(resolvedSearchParams.feature);
  const requiredPlanValue = readSearchParam(resolvedSearchParams.requiredPlan);
  const requiredPlan = PLAN_ORDER.includes(requiredPlanValue as BusinessPlan)
    ? (requiredPlanValue as BusinessPlan)
    : undefined;
  const desiredPlanValue = readSearchParam(resolvedSearchParams.desiredPlan);
  const desiredPlan = PLAN_ORDER.includes(desiredPlanValue as BusinessPlan)
    ? (desiredPlanValue as BusinessPlan)
    : undefined;
  const upgradeOptions = PLAN_ORDER.filter((plan) => !hasPlanAccess(purchasedPlan, plan));
  const daysRemaining = (business as any).billingDaysRemaining as number | null | undefined;
  const daysLeftInTrial = (business as any).billingDaysLeftInTrial as number | null | undefined;
  const daysUntilBilling = (business as any).billingDaysUntilBilling as number | null | undefined;
  const billingAmountPence = ((business as any).billingAmountPence as number | null | undefined) ?? ((business as any).billingAmount as number | null | undefined) ?? PLAN_MONTHLY_PRICES[purchasedPlan] * 100;
  const billingHistory = parseBillingHistory(billingNotes);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Billing & Plans"
        subtitle="Review purchased access, payment windows, and what each tier unlocks for this business."
      />

      <FormError error={error} />

      {!billingSchemaReady ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
          Billing access is running in compatibility mode because the latest database migration is not deployed yet. The app will keep using legacy access rules until the billing schema is available.
        </div>
      ) : null}

      {requested ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-900">
          Upgrade request logged{desiredPlan ? ` for ${PLAN_DETAILS[desiredPlan].name}` : ''}. The request is now visible in billing notes for follow-up.
        </div>
      ) : null}

      {feature ? (
        <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-4 text-sm text-blue-900">
          You tried to open <span className="font-semibold">{feature}</span>
          {requiredPlan ? `, which is available on ${PLAN_DETAILS[requiredPlan].name}.` : '.'} Use the request form below if this business needs that access enabled.
        </div>
      ) : null}

      {billingPrimaryBanner ? (
        <div className={`rounded-2xl border px-4 py-4 text-sm ${
          billingIsRestricted
            ? 'border-rose-200 bg-rose-50 text-rose-900'
            : billingIsOverdue
              ? 'border-amber-200 bg-amber-50 text-amber-900'
              : 'border-blue-200 bg-blue-50 text-blue-900'
        }`}>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p>{billingPrimaryBanner}</p>
            <Link href={billingNextActionHref} className="font-semibold underline underline-offset-4">
              {billingNextActionLabel}
            </Link>
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-3">
        {PLAN_ORDER.map((plan) => {
          const details = PLAN_DETAILS[plan];
          const isCurrent = plan === effectivePlan;
          const isPurchased = billingIsPaid && plan === purchasedPlan;
          const monthlyPrice = PLAN_MONTHLY_PRICES[plan];
          const annualPrice = getAnnualPlanPrice(monthlyPrice);
          const annualSavings = getAnnualPlanSavings(monthlyPrice);

          return (
            <div key={plan} className={`card space-y-4 p-6 ${details.tone}`}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-[0.18em] text-black/45">Plan</div>
                  <h2 className="mt-1 text-xl font-display font-semibold text-ink">{details.name}</h2>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  {details.featured ? (
                    <span className="rounded-full bg-accentSoft px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-accent">
                      Most popular
                    </span>
                  ) : null}
                  {isPurchased ? (
                    <span className="rounded-full bg-black/[0.06] px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-black/60">
                      Purchased
                    </span>
                  ) : null}
                  {isCurrent ? (
                    <span className="rounded-full bg-accent px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-white">
                      Access today
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-black/5 bg-white/80 px-3 py-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-black/40">Monthly</div>
                  <div className="mt-1 text-2xl font-display font-bold text-ink">{formatCedi(monthlyPrice)}</div>
                  <div className="text-xs text-black/50">per month</div>
                </div>
                <div className="rounded-xl border border-black/5 bg-white/80 px-3 py-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-black/40">Annual</div>
                  <div className="mt-1 text-2xl font-display font-bold text-ink">{formatCedi(annualPrice)}</div>
                  <div className="text-xs text-black/50">per year</div>
                </div>
              </div>
              <div className="rounded-xl border border-black/5 bg-white/70 px-3 py-2 text-xs font-medium text-black/55">
                Annual billing saves {formatCedi(annualSavings)} compared with paying month by month.
              </div>
              <ul className="space-y-2 text-sm text-black/65">
                {details.highlights.map((item) => (
                  <li key={item} className="rounded-xl border border-black/5 bg-white/70 px-3 py-2">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      <div className="card overflow-hidden p-0">
        <div className="border-b border-black/5 px-6 py-4">
          <h2 className="text-lg font-display font-semibold text-ink">Plan comparison</h2>
          <p className="mt-1 text-sm text-black/60">A compact view of which operational surfaces open up at each tier.</p>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full border-separate border-spacing-0 text-sm">
            <thead>
              <tr className="bg-black/[0.02] text-left text-black/55">
                <th className="border-b border-black/5 px-6 py-4 font-semibold">Feature area</th>
                {PLAN_ORDER.map((plan) => (
                  <th key={plan} className="border-b border-black/5 px-4 py-4 text-center font-semibold">
                    <div className="text-ink">{PLAN_DETAILS[plan].name}</div>
                    <div className="mt-1 text-xs font-medium text-black/45">{formatCedi(PLAN_MONTHLY_PRICES[plan])}/mo</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PLAN_COMPARISON_ROWS.map((row) => (
                <tr key={row.feature}>
                  <td className="border-b border-black/5 px-6 py-4 text-black/70">{row.feature}</td>
                  {PLAN_ORDER.map((plan) => {
                    const included = row.includedIn.includes(plan);

                    return (
                      <td key={plan} className="border-b border-black/5 px-4 py-4 text-center">
                        <span
                          className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${
                            included
                              ? plan === 'PRO'
                                ? 'bg-emerald-50 text-emerald-700'
                                : plan === 'GROWTH'
                                  ? 'bg-blue-50 text-blue-700'
                                  : 'bg-slate-100 text-slate-700'
                              : 'bg-black/[0.05] text-black/40'
                          }`}
                        >
                          {included ? 'Included' : 'Not included'}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card p-6">
        <h2 className="text-lg font-display font-semibold">Available add-ons</h2>
        <p className="mt-1 text-sm text-black/55">
          Add-ons extend a plan with optional capabilities. They are activated by Tishgroup and billed separately.
        </p>
        <div className="mt-4 flex flex-col gap-4 sm:flex-row">
          <div className="flex-1 rounded-2xl border border-blue-200 bg-blue-50/60 px-5 py-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-semibold text-ink">Online Storefront</div>
                <div className="mt-0.5 text-xs font-medium text-blue-700">Growth plan · +GH₵200/mo</div>
              </div>
              <span className="shrink-0 rounded-full border border-blue-200 bg-white px-3 py-1 text-xs font-semibold text-blue-700">
                Pro: included
              </span>
            </div>
            <p className="mt-2 text-sm text-black/65">
              Publish a customer-facing catalogue, accept mobile-money checkout, and manage pickup orders — without upgrading to Pro. Contact Tishgroup to activate.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <div className="card space-y-4 p-6">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-black/40">Current access</div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-accentSoft px-3 py-1 text-sm font-semibold text-accent">
                {effectivePlanSummary.name}
              </span>
              <span className="rounded-full bg-black/[0.05] px-3 py-1 text-sm font-medium text-black/60">
                {billingDisplayStatus}
              </span>
              {!canWrite ? (
                <span className="rounded-full bg-rose-100 px-3 py-1 text-sm font-medium text-rose-700">Read only</span>
              ) : null}
            </div>
            <p className="mt-3 max-w-3xl text-sm text-black/60">{billingMerchantMessage}</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <div className="rounded-xl border border-black/10 bg-white px-4 py-3">
              <div className="text-xs uppercase tracking-[0.16em] text-black/40">Business</div>
              <div className="mt-1 text-base font-semibold text-ink">{business.name}</div>
            </div>
            <div className="rounded-xl border border-black/10 bg-white px-4 py-3">
              <div className="text-xs uppercase tracking-[0.16em] text-black/40">Plan</div>
              <div className="mt-1 text-base font-semibold text-ink">{purchasedPlanSummary.name}</div>
            </div>
            <div className="rounded-xl border border-black/10 bg-white px-4 py-3">
              <div className="text-xs uppercase tracking-[0.16em] text-black/40">Billing status</div>
              <div className="mt-1 text-base font-semibold text-ink">{billingDisplayStatus}</div>
            </div>
            <div className="rounded-xl border border-black/10 bg-white px-4 py-3">
              <div className="text-xs uppercase tracking-[0.16em] text-black/40">Subscription start</div>
              <div className="mt-1 text-base font-semibold text-ink">{formatDateLabel(subscriptionStartAt, 'Not recorded')}</div>
            </div>
            <div className="rounded-xl border border-black/10 bg-white px-4 py-3">
              <div className="text-xs uppercase tracking-[0.16em] text-black/40">Billing cadence</div>
              <div className="mt-1 text-base font-semibold text-ink">{billingCadenceLabel}</div>
            </div>
            <div className="rounded-xl border border-black/10 bg-white px-4 py-3">
              <div className="text-xs uppercase tracking-[0.16em] text-black/40">Next payment due</div>
              <div className="mt-1 text-base font-semibold text-ink">{formatDateLabel(nextBillingDate, 'Not scheduled')}</div>
            </div>
            <div className="rounded-xl border border-black/10 bg-white px-4 py-3">
              <div className="text-xs uppercase tracking-[0.16em] text-black/40">Amount due this cycle</div>
              <div className="mt-1 text-base font-semibold text-ink">{formatCediFromPence(billingAmountPence)}</div>
            </div>
            <div className="rounded-xl border border-black/10 bg-white px-4 py-3">
              <div className="text-xs uppercase tracking-[0.16em] text-black/40">Last payment recorded</div>
              <div className="mt-1 text-base font-semibold text-ink">{formatDateLabel(lastPaymentAt, 'Not recorded')}</div>
            </div>
            <div className="rounded-xl border border-black/10 bg-white px-4 py-3">
              <div className="text-xs uppercase tracking-[0.16em] text-black/40">First payment</div>
              <div className="mt-1 text-base font-semibold text-ink">{formatDateLabel(firstPaymentAt, 'Not yet')}</div>
            </div>
            <div className="rounded-xl border border-black/10 bg-white px-4 py-3">
              <div className="text-xs uppercase tracking-[0.16em] text-black/40">Current period</div>
              <div className="mt-1 text-base font-semibold text-ink">{formatDateLabel(currentPeriodStartedAt, 'Not started')} - {formatDateLabel(currentPeriodEndsAt, 'Not set')}</div>
            </div>
            <div className="rounded-xl border border-black/10 bg-white px-4 py-3">
              <div className="text-xs uppercase tracking-[0.16em] text-black/40">Countdown</div>
              <div className="mt-1 text-base font-semibold text-ink">
                {daysRemaining == null
                  ? 'Not scheduled'
                  : daysRemaining === 0
                    ? 'Due today'
                    : `${Math.abs(daysRemaining)} day${Math.abs(daysRemaining) === 1 ? '' : 's'} ${daysRemaining > 0 ? 'left' : 'overdue'}`}
              </div>
            </div>
            <div className="rounded-xl border border-black/10 bg-white px-4 py-3">
              <div className="text-xs uppercase tracking-[0.16em] text-black/40">Grace ends</div>
              <div className="mt-1 text-base font-semibold text-ink">{formatDateLabel(graceEndsAt, 'Not applicable')}</div>
            </div>
            <div className="rounded-xl border border-black/10 bg-white px-4 py-3">
              <div className="text-xs uppercase tracking-[0.16em] text-black/40">Starter fallback ends</div>
              <div className="mt-1 text-base font-semibold text-ink">{formatDateLabel(starterFallbackEndsAt, 'Not applicable')}</div>
            </div>
            <div className="rounded-xl border border-black/10 bg-white px-4 py-3">
              <div className="text-xs uppercase tracking-[0.16em] text-black/40">Read-only starts</div>
              <div className="mt-1 text-base font-semibold text-ink">{formatDateLabel(readOnlyAt, 'Not scheduled')}</div>
            </div>
            <div className="rounded-xl border border-black/10 bg-white px-4 py-3 sm:col-span-2 xl:col-span-3">
              <div className="text-xs uppercase tracking-[0.16em] text-black/40">Trial end</div>
              <div className="mt-1 text-base font-semibold text-ink">{formatDateLabel(trialEndsAt, 'Not applicable')}</div>
            </div>
          </div>

          <details className="rounded-2xl border border-black/5 bg-black/[0.02] px-4 py-4 text-sm text-black/65">
            <summary className="cursor-pointer text-xs uppercase tracking-[0.18em] text-black/40">Billing history</summary>
            <div className="mt-3 space-y-3">
              <p>{billingControlMessage}</p>
              {billingHistory.length > 0 ? (
                <div className="space-y-3">
                  {billingHistory.map((entry) => (
                    <article key={entry.id} className="rounded-xl border border-black/8 bg-white px-4 py-4">
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                        <div className="font-semibold text-ink">{entry.title}</div>
                        <div className="text-xs uppercase tracking-[0.14em] text-black/45">
                          {formatDateTimeLabel(entry.occurredAt, 'Unknown date')}
                        </div>
                      </div>
                      {entry.facts.length > 0 ? (
                        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                          {entry.facts.map((fact) => (
                            <div key={`${entry.id}-${fact.label}`}>
                              <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-black/40">{fact.label}</dt>
                              <dd className="mt-1 text-sm text-black/70">{formatBillingHistoryValue(fact.label, fact.value)}</dd>
                            </div>
                          ))}
                        </dl>
                      ) : null}
                      {entry.notes.length > 0 ? (
                        <div className="mt-3 space-y-1 text-sm text-black/60">
                          {entry.notes.map((line, index) => (
                            <p key={`${entry.id}-note-${index}`}>{line}</p>
                          ))}
                        </div>
                      ) : null}
                    </article>
                  ))}
                </div>
              ) : (
                <p className="text-black/55">No billing history has been recorded yet.</p>
              )}
            </div>
          </details>
        </div>

        <div className="space-y-4">
          <div id="payment-instructions" className="card space-y-4 p-6 scroll-mt-24">
            <h2 className="text-lg font-display font-semibold">Payment instructions</h2>
            <div className="space-y-3 text-sm text-black/60">
              <p>
                New businesses receive a 7-day free trial on the selected plan. After the trial, payment must be confirmed by Tishgroup before full usage continues beyond the grace window.
              </p>
              <p>
                Pay the monthly amount due and contact Tishgroup with your business name, phone number, amount, and payment reference. Once confirmed, your monthly billing cycle starts from the payment date.
              </p>
              <p>
                While restricted, billing, support, account settings, and read-only dashboard access remain available. New sales, purchases, stock adjustments, online store publishing, exports, advanced reports, staff expansion, and premium features are paused.
              </p>
              <p>
                Plan upgrades and downgrades are handled by Tishgroup Control. A self-service change flow will appear here once it is ready.
              </p>
            </div>

            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
              Multi-branch workflows only activate on Pro. Growth unlocks richer reporting and control surfaces, while fallback access uses Starter entitlements only.
            </div>
          </div>

          <div className="card space-y-4 p-6">
            <h2 className="text-lg font-display font-semibold">Commercial changes are handled by Tishgroup</h2>
            <p className="text-sm text-black/60">
              This page remains the tenant-facing visibility surface, but billing writes now happen only in Tishgroup Control so subscription state, payment history, and enforcement stay aligned.
            </p>

            <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-4 text-sm text-blue-900">
              If payment has been made or your next due date is wrong, contact Tishgroup. Once Tishgroup updates the control plane, Tillflow access will refresh from that commercial record.
            </div>
          </div>

          {upgradeOptions.length > 0 && billingSchemaReady ? (
            <form action={requestPlanUpgradeAction} className="card space-y-3 p-6">
              <div>
                <h3 className="text-sm font-semibold text-ink">Request a plan upgrade</h3>
                <p className="mt-1 text-sm text-black/60">
                  Submit an internal request so the desired commercial change is captured alongside this business record.
                </p>
              </div>

              <input type="hidden" name="feature" value={feature ?? ''} />

              <label className="block space-y-1 text-sm">
                <span className="font-medium text-ink">Requested plan</span>
                <select
                  name="desiredPlan"
                  defaultValue={requiredPlan && upgradeOptions.includes(requiredPlan) ? requiredPlan : upgradeOptions[0]}
                  className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm text-ink outline-none transition focus:border-accent"
                >
                  {upgradeOptions.map((plan) => (
                    <option key={plan} value={plan}>
                      {PLAN_DETAILS[plan].name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block space-y-1 text-sm">
                <span className="font-medium text-ink">Request note</span>
                <textarea
                  name="requestNote"
                  rows={3}
                  placeholder={feature ? `Why does the business need ${feature}?` : 'Add any commercial or operational context for the upgrade request.'}
                  className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm text-ink outline-none transition focus:border-accent"
                />
              </label>

              <button type="submit" className="btn-primary w-full justify-center sm:w-fit">
                Submit upgrade request
              </button>
            </form>
          ) : null}
        </div>
      </div>
    </div>
  );
}
