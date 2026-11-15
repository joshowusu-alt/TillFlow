import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getBillingEntitlement } from '@/lib/billing-entitlements';
import { getFeatures } from '@/lib/features';

const actions = readFileSync('tishgroup-control/app/actions/control-businesses.ts', 'utf8');

describe('Control plan sync', () => {
  it.each([
    ['applySoldPlanUpdate', 'ensureControlBusinessProfile', 'args.purchasedPlan'],
    ['updateControlSubscriptionAction', 'recordControlPaymentAction', 'purchasedPlan'],
    ['recordControlPaymentAction', 'addControlNoteAction', 'purchasedPlan'],
  ])('writes the same plan to both Business fields in %s', (start, end, field) => {
    const action = actions.slice(actions.indexOf(`function ${start}(`), actions.indexOf(`function ${end}(`));
    const write = action.slice(action.indexOf('await tx.business.update('));
    expect(write).toContain(`plan: ${field},\n`);
    expect(write).toContain(`selectedPlan: ${field},\n`);
  });

  it('unlocks Growth with the storefront add-on when the purchased plan is reflected in selectedPlan', () => {
    const before = { plan: 'GROWTH', selectedPlan: 'STARTER', addonOnlineStorefront: true } as const;
    const after = { ...before, selectedPlan: before.plan };
    expect(getFeatures(getBillingEntitlement(before).effectivePlan, 'SINGLE_STORE', {
      onlineStorefront: before.addonOnlineStorefront,
    }).onlineStorefront).toBe(false);
    expect(getFeatures(getBillingEntitlement(after).effectivePlan, 'SINGLE_STORE', {
      onlineStorefront: after.addonOnlineStorefront,
    }).onlineStorefront).toBe(true);
  });
});
