import { describe, expect, it } from 'vitest';
import { canReceiveOnlineOrderAlerts } from './online-order-alert-eligibility';

const active = { plan: 'PRO', storefrontEnabled: true, billingCanWrite: true };

describe('online order alert eligibility', () => {
  it('requires a published storefront even on Pro or Growth with an add-on', () => {
    expect(canReceiveOnlineOrderAlerts({ ...active, storefrontEnabled: false }, 'OWNER', true)).toBe(false);
    expect(canReceiveOnlineOrderAlerts({ ...active, storefrontEnabled: undefined }, 'OWNER', true)).toBe(false);
    expect(canReceiveOnlineOrderAlerts({ ...active, plan: 'GROWTH', addonOnlineStorefront: true, storefrontEnabled: false }, 'OWNER', true)).toBe(false);
  });
  it('requires existing plan entitlement', () => {
    expect(canReceiveOnlineOrderAlerts({ ...active, plan: 'STARTER' }, 'OWNER', true)).toBe(false);
    expect(canReceiveOnlineOrderAlerts({ ...active, plan: 'GROWTH' }, 'OWNER', true)).toBe(false);
    expect(canReceiveOnlineOrderAlerts({ ...active, plan: 'GROWTH', addonOnlineStorefront: true }, 'OWNER', true)).toBe(true);
  });
  it('matches the order actions and billing permissions', () => {
    expect(canReceiveOnlineOrderAlerts(active, 'OWNER', false)).toBe(true);
    expect(canReceiveOnlineOrderAlerts(active, 'MANAGER', false)).toBe(true);
    expect(canReceiveOnlineOrderAlerts(active, 'CASHIER', true)).toBe(true);
    expect(canReceiveOnlineOrderAlerts(active, 'CASHIER', false)).toBe(false);
    expect(canReceiveOnlineOrderAlerts(active, 'UNKNOWN', true)).toBe(false);
    expect(canReceiveOnlineOrderAlerts({ ...active, billingCanWrite: false }, 'OWNER', true)).toBe(false);
  });
});
