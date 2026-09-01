import { describe, expect, it } from 'vitest';
import { PreviewQaOwnerBlockedError } from './preview-qa-owner';
import { readOnboardingQaOwnerCredentials } from './preview-qa-onboarding-owner';

describe('onboarding QA owner identity', () => {
  it('requires a Preview-only identity distinct from PLAYWRIGHT_OWNER_EMAIL', () => {
    expect(() =>
      readOnboardingQaOwnerCredentials({
        PLAYWRIGHT_OWNER_EMAIL: 'owner@example.com',
        PLAYWRIGHT_OWNER_PASSWORD: 'secret',
      }),
    ).toThrow(PreviewQaOwnerBlockedError);

    expect(() =>
      readOnboardingQaOwnerCredentials({
        PLAYWRIGHT_ONBOARDING_OWNER_EMAIL: 'owner@example.com',
        PLAYWRIGHT_ONBOARDING_OWNER_PASSWORD: 'onboard-secret',
        PLAYWRIGHT_OWNER_EMAIL: 'owner@example.com',
        PLAYWRIGHT_OWNER_PASSWORD: 'secret',
      }),
    ).toThrow(/separate Preview identity/);

    expect(
      readOnboardingQaOwnerCredentials({
        PLAYWRIGHT_ONBOARDING_OWNER_EMAIL: 'onboarding@example.com',
        PLAYWRIGHT_ONBOARDING_OWNER_PASSWORD: 'onboard-secret',
        PLAYWRIGHT_OWNER_EMAIL: 'owner@example.com',
        PLAYWRIGHT_OWNER_PASSWORD: 'secret',
      }),
    ).toEqual({
      email: 'onboarding@example.com',
      password: 'onboard-secret',
    });
  });
});
