import { defineConfig, devices } from '@playwright/test';
import { QA_USER_AGENT } from './tests/e2e/helpers/env';
import { resolveVercelPreviewBypass } from './tests/e2e/helpers/vercel-preview-bypass';

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:6200';
const isCi = !!process.env.CI;
const bypass = resolveVercelPreviewBypass({
  baseURL,
  env: process.env,
});

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: isCi,
  retries: isCi ? 1 : 0,
  workers: 1,
  timeout: isCi ? 120_000 : 90_000,
  expect: { timeout: isCi ? 30_000 : 20_000 },
  reporter: bypass.disableCapturingArtifacts
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
    trace: bypass.disableCapturingArtifacts ? 'off' : 'retain-on-failure',
    screenshot: bypass.disableCapturingArtifacts ? 'off' : 'only-on-failure',
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
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
