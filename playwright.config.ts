import { defineConfig, devices } from '@playwright/test';

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
