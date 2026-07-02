import { defineConfig, devices } from '@playwright/test';
import { QA_USER_AGENT } from './tests/e2e/helpers/env';

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:6200';
const isCi = !!process.env.CI;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: isCi,
  retries: isCi ? 1 : 0,
  workers: 1,
  timeout: isCi ? 120_000 : 90_000,
  expect: { timeout: isCi ? 30_000 : 20_000 },
  reporter: [['list'], ['json', { outputFile: 'playwright/report.json' }]],
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
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
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
  ],
});
