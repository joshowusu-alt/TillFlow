import { describe, expect, it } from 'vitest';
import { PreviewQaOwnerBlockedError } from './preview-qa-owner';
import { readOnboardingQaOwnerCredentials } from './preview-qa-onboarding-owner';
import { RELIABILITY_ONBOARDING_QA_TENANT_1 } from '../../../lib/reliability/onboarding-qa-tenants';

describe('onboarding QA owner identity', () => {
  it('records tenant 1 as Gino / Step 2 Done and unsuitable for pristine Step 2', () => {
    expect(RELIABILITY_ONBOARDING_QA_TENANT_1.productName).toBe('Gino');
    expect(RELIABILITY_ONBOARDING_QA_TENANT_1.productStep).toBe('Done');
    expect(RELIABILITY_ONBOARDING_QA_TENANT_1.transactionCount).toBe(0);
    expect(RELIABILITY_ONBOARDING_QA_TENANT_1.suitableForPristineStep2).toBe(false);
  });

  it('requires PLAYWRIGHT_ONBOARDING_OWNER_EMAIL_2 distinct from owner and tenant 1', () => {
    expect(() =>
      readOnboardingQaOwnerCredentials({
        PLAYWRIGHT_OWNER_EMAIL: 'owner@example.com',
        PLAYWRIGHT_OWNER_PASSWORD: 'secret',
      }),
    ).toThrow(PreviewQaOwnerBlockedError);

    expect(() =>
      readOnboardingQaOwnerCredentials({
        PLAYWRIGHT_ONBOARDING_OWNER_EMAIL_2: 'owner@example.com',
        PLAYWRIGHT_ONBOARDING_OWNER_PASSWORD_2: 'onboard-secret',
        PLAYWRIGHT_OWNER_EMAIL: 'owner@example.com',
        PLAYWRIGHT_OWNER_PASSWORD: 'secret',
      }),
    ).toThrow(/separate Preview identity/);

    expect(() =>
      readOnboardingQaOwnerCredentials({
        PLAYWRIGHT_ONBOARDING_OWNER_EMAIL: 'onboarding-1@example.com',
        PLAYWRIGHT_ONBOARDING_OWNER_PASSWORD: 'onboard-secret',
        PLAYWRIGHT_ONBOARDING_OWNER_EMAIL_2: 'onboarding-1@example.com',
        PLAYWRIGHT_ONBOARDING_OWNER_PASSWORD_2: 'onboard-secret-2',
        PLAYWRIGHT_OWNER_EMAIL: 'owner@example.com',
        PLAYWRIGHT_OWNER_PASSWORD: 'secret',
      }),
    ).toThrow(/must not reuse tenant 1/);

    expect(
      readOnboardingQaOwnerCredentials({
        PLAYWRIGHT_ONBOARDING_OWNER_EMAIL: 'onboarding-1@example.com',
        PLAYWRIGHT_ONBOARDING_OWNER_PASSWORD: 'onboard-secret',
        PLAYWRIGHT_ONBOARDING_OWNER_EMAIL_2: 'onboarding-2@example.com',
        PLAYWRIGHT_ONBOARDING_OWNER_PASSWORD_2: 'onboard-secret-2',
        PLAYWRIGHT_OWNER_EMAIL: 'owner@example.com',
        PLAYWRIGHT_OWNER_PASSWORD: 'secret',
      }),
    ).toEqual({
      email: 'onboarding-2@example.com',
      password: 'onboard-secret-2',
    });
  });
});
