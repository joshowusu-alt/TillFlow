import { describe, expect, it, vi } from 'vitest';

// billing-db-compat imports the Prisma client at module load; stub it so this
// pure-logic test never needs a database connection.
vi.mock('@/lib/prisma', () => ({ prisma: { business: { findUnique: vi.fn() } } }));

import { AUTH_BILLING_SELECT, isBillingSchemaError } from './billing-db-compat';

describe('AUTH_BILLING_SELECT', () => {
  it('selects addonOnlineStorefront so merchant pages can gate storefront access', () => {
    // Without this field, requireBusiness() returns undefined and every merchant
    // page evaluates `addonOnlineStorefront ?? false` — silently blocking
    // Growth + add-on businesses from Online Store settings, analytics, and orders.
    expect(AUTH_BILLING_SELECT).toHaveProperty('addonOnlineStorefront', true);
  });

  it('keeps the core billing/entitlement fields the entitlement layer reads', () => {
    expect(AUTH_BILLING_SELECT).toHaveProperty('plan', true);
    expect(AUTH_BILLING_SELECT).toHaveProperty('billingInterval', true);
    expect(AUTH_BILLING_SELECT).toHaveProperty('subscriptionStatus', true);
  });

  it('treats a missing addonOnlineStorefront column as a billing-schema error so the legacy fallback engages', () => {
    const error = new Error('The column `addonOnlineStorefront` does not exist in the current database.');
    expect(isBillingSchemaError(error)).toBe(true);
  });
});
