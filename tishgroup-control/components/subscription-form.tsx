'use client';

import { useMemo, useState } from 'react';
import { updateControlSubscriptionAction } from '@/app/actions/control-businesses';
import BillingScheduleFields from '@/components/BillingScheduleFields';
import ConfirmSubmitButton from '@/components/confirm-submit-button';
import {
  computeSubscriptionPricing,
  controlMonthlyValueGhs,
  resolveAddonForPlan,
  storefrontPricingSummary,
} from '@/lib/vendor/plan-pricing';
import type { BusinessPlan } from '@/lib/vendor/features';

type SubscriptionFormBusiness = {
  id: string;
  plan: string;
  addonOnlineStorefront?: boolean | null;
  storefrontEnabled?: boolean | null;
  subscriptionStatus: string;
  billingCadence: 'MONTHLY' | 'ANNUAL';
  subscriptionStartAt?: string | null;
  planSetAt?: string | null;
  nextDueAt?: string | null;
  trialEndsAt?: string | null;
  monthlyValue: number;
  outstandingAmount: number;
};

function asDateInput(value?: string | null) {
  return value && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : '';
}

function normalizePlan(value: string): BusinessPlan {
  return value === 'PRO' || value === 'GROWTH' ? value : 'STARTER';
}

export default function SubscriptionForm({
  business,
  checkboxId = 'addonOnlineStorefront',
}: {
  business: SubscriptionFormBusiness;
  checkboxId?: string;
}) {
  const [plan, setPlan] = useState<BusinessPlan>(normalizePlan(business.plan));
  const [addonSelected, setAddonSelected] = useState(Boolean(business.addonOnlineStorefront));
  const [billingCadence, setBillingCadence] = useState<'MONTHLY' | 'ANNUAL'>(business.billingCadence);
  const [monthlyValue, setMonthlyValue] = useState(business.monthlyValue);
  const [monthlyEdited, setMonthlyEdited] = useState(false);

  const addonOnlineStorefront = resolveAddonForPlan(plan, addonSelected);
  const pricing = useMemo(
    () =>
      computeSubscriptionPricing({
        plan,
        addonOnlineStorefront,
        billingInterval: billingCadence,
      }),
    [plan, addonOnlineStorefront, billingCadence],
  );
  const recommendedMonthly = controlMonthlyValueGhs(pricing);
  const summary = storefrontPricingSummary(pricing, Boolean(business.storefrontEnabled));
  const addonDisabled = plan !== 'GROWTH';

  function handlePlanChange(nextPlan: BusinessPlan) {
    setPlan(nextPlan);
    if (nextPlan !== 'GROWTH') {
      setAddonSelected(false);
    }
    if (!monthlyEdited) {
      setMonthlyValue(
        controlMonthlyValueGhs(
          computeSubscriptionPricing({
            plan: nextPlan,
            addonOnlineStorefront: resolveAddonForPlan(nextPlan, nextPlan === 'GROWTH' && addonSelected),
            billingInterval: billingCadence,
          }),
        ),
      );
    }
  }

  function handleAddonChange(checked: boolean) {
    setAddonSelected(checked);
    if (!monthlyEdited) {
      setMonthlyValue(
        controlMonthlyValueGhs(
          computeSubscriptionPricing({
            plan,
            addonOnlineStorefront: resolveAddonForPlan(plan, checked),
            billingInterval: billingCadence,
          }),
        ),
      );
    }
  }

  return (
    <form action={updateControlSubscriptionAction} className="space-y-3 rounded-2xl border border-black/8 bg-white/80 p-4">
      <input type="hidden" name="businessId" value={business.id} />
      <div>
        <h3 className="text-sm font-semibold text-control-ink">Update subscription</h3>
        <p className="mt-1 text-sm text-black/60">Set the sold plan, cadence, and current subscription state from the control plane.</p>
      </div>

      <label className="block space-y-1 text-sm">
        <span className="font-medium text-control-ink">Sold plan</span>
        <select
          name="purchasedPlan"
          value={plan}
          onChange={(e) => handlePlanChange(normalizePlan(e.target.value))}
          className="control-field"
        >
          <option value="STARTER">Starter</option>
          <option value="GROWTH">Growth</option>
          <option value="PRO">Pro</option>
        </select>
      </label>

      <div className="rounded-xl border border-black/8 bg-black/[0.02] px-3 py-3 text-sm space-y-1">
        <p className="font-medium text-control-ink">Plan: {plan.charAt(0) + plan.slice(1).toLowerCase()}</p>
        <p>{summary.storefrontLine}</p>
        <p>{summary.monthlyLine}</p>
        <p>{summary.annualLine}</p>
        <p>{summary.publishedLine}</p>
      </div>

      {plan === 'PRO' ? (
        <p className="text-sm text-black/60">Online Storefront included in Pro — no extra charge.</p>
      ) : plan === 'STARTER' ? (
        <p className="text-sm text-black/60">Online Storefront is available on Growth add-on or included in Pro.</p>
      ) : (
        <div className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            id={checkboxId}
            name="addonOnlineStorefront"
            className="mt-0.5 h-4 w-4"
            checked={addonSelected}
            disabled={addonDisabled}
            onChange={(e) => handleAddonChange(e.target.checked)}
          />
          <label htmlFor={checkboxId} className="space-y-0.5">
            <span className="block font-medium text-control-ink">Add Online Storefront — +GHS 200/month</span>
            <span className="block text-black/60">Let customers browse products and place pickup orders online.</span>
          </label>
        </div>
      )}

      <label className="block space-y-1 text-sm">
        <span className="font-medium text-control-ink">Subscription status</span>
        <select name="status" defaultValue={business.subscriptionStatus} className="control-field">
          <option value="PAID_ACTIVE">Paid active</option>
          <option value="TRIAL">Trial</option>
          <option value="SUSPENDED">Suspended</option>
          <option value="READ_ONLY">Read only</option>
          <option value="INACTIVE">Deactivated</option>
        </select>
      </label>

      <BillingScheduleFields
        defaultCadence={business.billingCadence}
        defaultStartDate={asDateInput(business.subscriptionStartAt ?? business.planSetAt)}
        defaultNextDueDate={asDateInput(business.nextDueAt)}
        onCadenceChange={(value) => {
          const cadence = value === 'ANNUAL' ? 'ANNUAL' : 'MONTHLY';
          setBillingCadence(cadence);
        }}
      />

      <p className="text-sm text-black/60">
        Leave next due blank to calculate it automatically from the subscription start date and cadence.
      </p>

      <label className="block space-y-1 text-sm">
        <span className="font-medium text-control-ink">Trial end date</span>
        <input type="date" name="trialEndsAt" defaultValue={asDateInput(business.trialEndsAt)} className="control-field" />
      </label>

      <label className="block space-y-1 text-sm">
        <span className="font-medium text-control-ink">Monthly value</span>
        <input
          type="number"
          min="0"
          name="monthlyValuePence"
          value={monthlyEdited ? monthlyValue : recommendedMonthly}
          onChange={(e) => {
            setMonthlyEdited(true);
            setMonthlyValue(Number(e.target.value) || 0);
          }}
          className="control-field"
        />
        <span className="block text-xs text-black/55">
          Recommended: GHS {recommendedMonthly}/month
          {monthlyEdited && monthlyValue !== recommendedMonthly ? ' · manual override kept on save if unchanged from current stored value' : ''}
        </span>
      </label>

      <label className="block space-y-1 text-sm">
        <span className="font-medium text-control-ink">Outstanding amount</span>
        <input type="number" min="0" name="outstandingAmountPence" defaultValue={business.outstandingAmount} className="control-field" />
      </label>

      <ConfirmSubmitButton
        className="inline-flex w-full items-center justify-center rounded-2xl bg-control-ink px-4 py-3 text-sm font-semibold text-white transition hover:bg-control-night disabled:cursor-not-allowed disabled:opacity-65 sm:w-fit"
        confirmMessage="Save this subscription state and mirror the commercial changes into Tillflow?"
        pendingLabel="Saving..."
      >
        Save subscription state
      </ConfirmSubmitButton>
    </form>
  );
}
