import { defineConfig, devices } from '@playwright/test';
import { authStatePath } from './tests/e2e/helpers/auth-paths';

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
      name: 'setup-owner',
      testMatch: /auth\.owner\.setup\.ts/,
      timeout: isCi ? 240_000 : 150_000,
    },
    {
      name: 'setup-cashier',
      testMatch: /auth\.cashier\.setup\.ts/,
      dependencies: ['setup-owner'],
      timeout: isCi ? 240_000 : 150_000,
    },
    {
      name: 'setup-manager',
      testMatch: /auth\.manager\.setup\.ts/,
      dependencies: ['setup-cashier'],
      timeout: isCi ? 240_000 : 150_000,
    },
    {
      name: 'owner-chromium',
      dependencies: ['setup-owner'],
      testMatch: /trust-breakers-authenticated\.spec\.ts/,
      grep: /@owner/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: authStatePath('owner'),
      },
    },
    {
      name: 'cashier-chromium',
      dependencies: ['setup-cashier'],
      testMatch: /trust-breakers-authenticated\.spec\.ts/,
      grep: /@cashier/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: authStatePath('cashier'),
      },
    },
    {
      name: 'manager-chromium',
      dependencies: ['setup-manager'],
      testMatch: /trust-breakers-authenticated\.spec\.ts/,
      grep: /@manager/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: authStatePath('manager'),
      },
    },
    {
      name: 'owner-cold-boot-chromium',
      dependencies: ['setup-owner'],
      testMatch: /owner-cold-boot\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
