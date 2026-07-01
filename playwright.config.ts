import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:6200';
const authDir = path.join(__dirname, 'playwright/.auth');

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 20_000 },
  reporter: [['list'], ['json', { outputFile: 'playwright/report.json' }]],
  outputDir: 'playwright/test-results',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    { name: 'setup-owner', testMatch: /auth\.owner\.setup\.ts/ },
    { name: 'setup-cashier', testMatch: /auth\.cashier\.setup\.ts/ },
    { name: 'setup-manager', testMatch: /auth\.manager\.setup\.ts/ },
    {
      name: 'owner-chromium',
      dependencies: ['setup-owner'],
      testMatch: /trust-breakers-authenticated\.spec\.ts/,
      grep: /@owner/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: path.join(authDir, 'owner.json'),
      },
    },
    {
      name: 'cashier-chromium',
      dependencies: ['setup-cashier'],
      testMatch: /trust-breakers-authenticated\.spec\.ts/,
      grep: /@cashier/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: path.join(authDir, 'cashier.json'),
      },
    },
    {
      name: 'manager-chromium',
      dependencies: ['setup-manager'],
      testMatch: /trust-breakers-authenticated\.spec\.ts/,
      grep: /@manager/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: path.join(authDir, 'manager.json'),
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
