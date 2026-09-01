/**
 * First dedicated onboarding QA tenant (PLAYWRIGHT_ONBOARDING_OWNER_EMAIL).
 * Owner registered it manually after the helper’s controlled-input fill failed.
 * It now has product Gino, Step 2 Done, and 0 txns. Do not delete Gino or
 * fabricate a pristine Step 2 on this tenant.
 */
export const RELIABILITY_ONBOARDING_QA_TENANT_1 = {
  envEmailKey: 'PLAYWRIGHT_ONBOARDING_OWNER_EMAIL',
  productName: 'Gino',
  productStep: 'Done',
  transactionCount: 0,
  suitableForPristineStep2: false,
} as const;

export const RELIABILITY_ONBOARDING_QA_TENANT_2_EMAIL_KEY = 'PLAYWRIGHT_ONBOARDING_OWNER_EMAIL_2';
export const RELIABILITY_ONBOARDING_QA_TENANT_2_PASSWORD_KEY = 'PLAYWRIGHT_ONBOARDING_OWNER_PASSWORD_2';
