import { updateControlSubscriptionAction } from '@/app/actions/control-businesses';
import BillingScheduleFields from '@/components/BillingScheduleFields';
import ConfirmSubmitButton from '@/components/confirm-submit-button';

type SubscriptionFormBusiness = {
  id: string;
  plan: string;
  addonOnlineStorefront?: boolean | null;
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

export default function SubscriptionForm({
  business,
  checkboxId = 'addonOnlineStorefront',
}: {
  business: SubscriptionFormBusiness;
  checkboxId?: string;
}) {
  return (
    <form action={updateControlSubscriptionAction} className="space-y-3 rounded-2xl border border-black/8 bg-white/80 p-4">
      <input type="hidden" name="businessId" value={business.id} />
      <div>
        <h3 className="text-sm font-semibold text-control-ink">Update subscription</h3>
        <p className="mt-1 text-sm text-black/60">Set the sold plan, cadence, and current subscription state from the control plane.</p>
      </div>

      <label className="block space-y-1 text-sm">
        <span className="font-medium text-control-ink">Sold plan</span>
        <select name="purchasedPlan" defaultValue={business.plan} className="control-field">
          <option value="STARTER">Starter</option>
          <option value="GROWTH">Growth</option>
          <option value="PRO">Pro</option>
        </select>
      </label>

      <div className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          id={checkboxId}
          name="addonOnlineStorefront"
          className="mt-0.5 h-4 w-4"
          defaultChecked={business.addonOnlineStorefront ?? false}
        />
        <label htmlFor={checkboxId} className="space-y-0.5">
          <span className="block font-medium text-control-ink">Online storefront add-on</span>
          <span className="block text-black/60">Enables the Growth online store add-on (+GHS 200/mo). No effect on Pro plans - storefront is included.</span>
        </label>
      </div>

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
        <input type="number" min="0" name="monthlyValuePence" defaultValue={business.monthlyValue} className="control-field" />
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
