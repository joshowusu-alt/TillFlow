import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  LAUNCH_COMPLETION_HOLD_MS,
  LAUNCH_REDIRECT_DELAY_MS,
  LAUNCH_SPLASH_FADE_MS,
} from '@/lib/performance/launch-handoff-timing';

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');

describe('Authenticated Playwright QA setup', () => {
  it('gitignores Playwright auth storage state and reports', () => {
    const gitignore = read('.gitignore');
    expect(gitignore).toContain('playwright/.auth/');
    expect(gitignore).toContain('.playwright-qa.local.env');
    expect(gitignore).toContain('playwright/report.json');
    expect(gitignore).toContain('playwright/test-results/');
  });

  it('requires env-backed credentials in auth helpers', () => {
    const envHelper = read('tests/e2e/helpers/env.ts');
    expect(envHelper).toContain('PLAYWRIGHT_OWNER_EMAIL');
    expect(envHelper).toContain('PLAYWRIGHT_OWNER_PASSWORD');
    expect(envHelper).toContain('PLAYWRIGHT_CASHIER_EMAIL');
    expect(envHelper).toContain('PLAYWRIGHT_CASHIER_PASSWORD');
    expect(envHelper).toContain('PLAYWRIGHT_ALLOW_QA_SALE');
    expect(envHelper).toContain("process.env.PLAYWRIGHT_ALLOW_QA_SALE === 'true'");
    expect(envHelper).not.toMatch(/password\s*=\s*['"][^'"]+['"]/);
  });

  it('keeps launch completion in protected layout and owner readiness streaming intact', () => {
    expect(read('app/(protected)/layout.tsx')).toContain('LaunchSessionCompletion');
    expect(read('app/(protected)/onboarding/page.tsx')).not.toContain('LaunchSessionCompletion');
    expect(read('app/(protected)/onboarding/page.tsx')).toContain('OwnerReadinessSkeleton');
    expect(read('app/(protected)/loading.tsx')).toContain('ProtectedRouteLoading');
    expect(read('components/RootLaunchLoading.tsx')).toContain('Opening your business...');
    expect(read('components/RootLaunchLoading.tsx')).not.toContain('return null');
  });

  it('documents approved launch handoff timings used during cold boot QA', () => {
    expect(LAUNCH_REDIRECT_DELAY_MS).toBe(0);
    expect(LAUNCH_COMPLETION_HOLD_MS).toBe(120);
    expect(LAUNCH_SPLASH_FADE_MS).toBe(180);
  });

  it('does not commit auth storage paths in repo tree config', () => {
    const config = read('playwright.config.ts');
    const authPaths = read('tests/e2e/helpers/auth-paths.ts');
    expect(config).toContain("storageState: 'playwright/.auth/owner.json'");
    expect(config).toContain('setup-auth');
    expect(authPaths).toContain("path.resolve(process.cwd(), 'playwright', '.auth')");
    expect(config).not.toContain('storageState: process.env');
  });
});
