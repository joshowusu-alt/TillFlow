import { defineConfig, devices } from '@playwright/test';
import { QA_USER_AGENT } from './tests/e2e/helpers/env';
import { resolveVercelPreviewBypass } from './tests/e2e/helpers/vercel-preview-bypass';

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:6200';
const isCi = !!process.env.CI;
const bypass = resolveVercelPreviewBypass({
  baseURL,
  env: process.env,
});
const disableCapturingArtifacts =
  bypass.disableCapturingArtifacts || Boolean(process.env.PLAYWRIGHT_OWNER_PASSWORD?.trim());

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: isCi,
  retries: isCi ? 1 : 0,
  workers: 1,
  timeout: isCi ? 120_000 : 90_000,
  expect: { timeout: isCi ? 30_000 : 20_000 },
  reporter: disableCapturingArtifacts
    ? [['list']]
    : [['list'], ['json', { outputFile: 'playwright/report.json' }]],
  outputDir: 'playwright/test-results',
  use: {
    baseURL,
    // Pin one user-agent for setup login AND downstream role projects. TillFlow's
    // getUser() drops a session when the request's browser family differs from
    // the family stored at login, so a Chrome/Linux setup + Chrome/Windows role
    // project (devices['Desktop Chrome']) logged the role contexts out in CI.
    userAgent: QA_USER_AGENT,
    // Fresh Playwright contexts can hit a service-worker controllerchange reload
    // mid server-action login and abort the POST before session cookies are set.
    serviceWorkers: 'block',
    trace: disableCapturingArtifacts ? 'off' : 'retain-on-failure',
    screenshot: disableCapturingArtifacts ? 'off' : 'only-on-failure',
    video: 'off',
    ...(bypass.extraHTTPHeaders ? { extraHTTPHeaders: bypass.extraHTTPHeaders } : {}),
  },
  projects: [
    {
      name: 'setup-auth',
      testMatch: /auth\.setup\.ts/,
      timeout: isCi ? 300_000 : 180_000,
    },
    {
      name: 'owner-chromium',
      dependencies: ['setup-auth'],
      testMatch: /trust-breakers-authenticated\.spec\.ts/,
      grep: /@owner/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'playwright/.auth/owner.json',
      },
    },
    {
      name: 'cashier-chromium',
      dependencies: ['setup-auth'],
      testMatch: /trust-breakers-authenticated\.spec\.ts/,
      grep: /@cashier/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'playwright/.auth/cashier.json',
      },
    },
    {
      name: 'manager-chromium',
      dependencies: ['setup-auth'],
      testMatch: /trust-breakers-authenticated\.spec\.ts/,
      grep: /@manager/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'playwright/.auth/manager.json',
      },
    },
    {
      name: 'owner-cold-boot-chromium',
      dependencies: ['setup-auth'],
      testMatch: /owner-cold-boot\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'phase1-launch-chromium',
      testMatch: /tap-to-sell-phase1-launch\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'phase1-pos-chromium',
      testMatch: /tap-to-sell-phase1-pos\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'playwright/.auth/owner.json',
      },
    },
    {
      name: 'pos-option-b-chromium',
      testMatch: /pos-checkout-option-b\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'playwright/.auth/owner.json',
      },
    },
    {
      name: 'pos-mobile-phase2-chromium',
      testMatch: /pos-mobile-phase2\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'playwright/.auth/owner.json',
      },
    },
    {
      name: 'pos-mobile-p0-chromium',
      testMatch: /pos-mobile-p0-safety\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        hasTouch: true,
        storageState: 'playwright/.auth/owner.json',
      },
    },
    {
      name: 'phase1-auth-chromium',
      testMatch: /tap-to-sell-phase1-auth\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile-overflow-owner',
      dependencies: ['setup-auth'],
      testMatch: /mobile-overflow-authenticated\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 375, height: 812 },
        isMobile: true,
        hasTouch: true,
        storageState: 'playwright/.auth/owner.json',
      },
    },
    {
      name: 'reliability-journey',
      testDir: './playwright',
      testMatch: /reliability-journey\.spec\.ts/,
      // Financial E2E: never auto-retry. Setup writes (business, tills, products,
      // shifts, invoices, drawer) are not proven idempotent end-to-end.
      retries: 0,
      // Hidden responsive copies must fail in seconds, not inherit 480s.
      // Do not raise the overall test timeout (desktop still uses setTimeout 480s).
      use: {
        ...devices['Desktop Chrome'],
        actionTimeout: 8_000,
        navigationTimeout: 15_000,
      },
    },
    {
      name: 'reliability-provisioning',
      testDir: './playwright',
      testMatch: /reliability-provisioning\.spec\.ts/,
      // Zero-financial Preview setup only. Never auto-retry. Never Production.
      retries: 0,
      timeout: 180_000,
      use: {
        ...devices['Desktop Chrome'],
        actionTimeout: 8_000,
        navigationTimeout: 15_000,
      },
    },
    {
      name: 'reliability-onboarding-manual',
      testDir: './playwright',
      testMatch: /reliability-onboarding-manual\.spec\.ts/,
      // New-business onboarding button only. Never auto-retry. Never sales.
      retries: 0,
      timeout: 180_000,
      use: {
        ...devices['Desktop Chrome'],
        actionTimeout: 8_000,
        navigationTimeout: 15_000,
      },
    },
    {
      name: 'reliability-catalogue',
      testDir: './playwright',
      testMatch: /reliability-catalogue\.spec\.ts/,
      // Catalogue/import/opening-stock only. Never auto-retry. Never sales.
      retries: 0,
      timeout: 180_000,
      use: {
        ...devices['Desktop Chrome'],
        actionTimeout: 8_000,
        navigationTimeout: 15_000,
      },
    },
    {
      name: 'reliability-till3-accounting',
      testDir: './playwright',
      testMatch: /reliability-till3-accounting\.spec\.ts/,
      // Evidence-only: persisted INV-000001 / T3ACC on Till 3. Never writes. Never Production.
      retries: 0,
      timeout: 300_000,
      use: {
        ...devices['Desktop Chrome'],
        actionTimeout: 8_000,
        navigationTimeout: 15_000,
      },
    },
  ],
});
