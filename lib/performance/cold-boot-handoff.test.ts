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

describe('Trust Breakers T2b: cold boot launch handoff', () => {
  const launchRedirector = read('components/LaunchRedirector.tsx');
  const launchCompletion = read('components/LaunchSessionCompletion.tsx');
  const rootLoading = read('app/loading.tsx');
  const rootLaunchLoading = read('components/RootLaunchLoading.tsx');
  const protectedLayout = read('app/(protected)/layout.tsx');
  const protectedLoading = read('app/(protected)/loading.tsx');
  const onboardingPage = read('app/(protected)/onboarding/page.tsx');
  const onboardingClient = read('app/(protected)/onboarding/OnboardingClient.tsx');
  const posPage = read('app/(protected)/pos/page.tsx');
  const launchPage = read('app/launch/page.tsx');

  it('keeps a single branded launch entry and protected non-launch fallback', () => {
    expect(launchPage).toContain('tillflow-logo-blue.png');
    expect(launchPage).toContain('LaunchRedirector');
    expect(protectedLoading).toContain('ProtectedRouteLoading');
    expect(protectedLoading).not.toContain('AppLaunchLoading');
    expect(protectedLoading).not.toContain('mode="launch"');
  });

  it('completes launch from the protected shell instead of the readiness body', () => {
    expect(protectedLayout).toContain('LaunchSessionCompletion');
    expect(onboardingPage).not.toContain('LaunchSessionCompletion');
    expect(onboardingClient).not.toContain('LaunchSessionCompletion');
    expect(onboardingPage).toContain('<Suspense');
    expect(onboardingPage).toContain('OwnerReadinessSkeleton');
    expect(onboardingPage).toContain('OwnerReadinessContent');
  });

  it('suppresses duplicate fullscreen root loading during an active launch handoff', () => {
    expect(rootLoading).toContain('RootLaunchLoading');
    expect(rootLaunchLoading).toContain('tillflow:launching');
    expect(rootLaunchLoading).toContain('tillflow:launchSplashSeen');
    expect(rootLaunchLoading).toContain('AppLaunchLoading');
    expect(rootLaunchLoading).toContain('return null');
  });

  it('uses approved launch timing constants and performance marks', () => {
    expect(LAUNCH_REDIRECT_DELAY_MS).toBe(160);
    expect(LAUNCH_COMPLETION_HOLD_MS).toBeLessThan(480);
    expect(LAUNCH_COMPLETION_HOLD_MS).toBe(120);

    expect(launchRedirector).toContain('LAUNCH_REDIRECT_DELAY_MS');
    expect(launchCompletion).toContain('LAUNCH_COMPLETION_HOLD_MS');
    expect(launchCompletion).toContain('LAUNCH_SPLASH_FADE_MS');
    expect(launchCompletion).toContain("'tillflow.launch.completion.mounted'");
    expect(launchCompletion).toContain("'tillflow.launch.splash.remove.started'");
    expect(launchCompletion).toContain("'tillflow.launch.splash.removed'");
    expect(launchCompletion).not.toContain(', 480');
  });

  it('preserves auth and role gates on owner onboarding', () => {
    expect(onboardingPage).toContain('requireUser()');
    expect(onboardingPage).toContain("user.role !== 'OWNER'");
    expect(onboardingPage).toContain("redirect('/pos')");
    expect(read('app/actions/onboarding.ts')).toContain("requireBusiness(['OWNER'])");
  });

  it('does not touch POS, manifest, service worker, cache, or schema', () => {
    expect(posPage).not.toContain('RootLaunchLoading');
    expect(posPage).toContain('LaunchSessionCompletion');
    expect(posPage).toContain("{ revalidate: 60, tags: ['pos-products'] }");

    expect(read('public/manifest.json')).toContain('"/launch"');
    expect(read('public/sw.js')).toContain('self.addEventListener');

    expect(read('prisma/schema.prisma')).toMatch(/provider\s+=\s+"sqlite"/);
    expect(read('prisma/schema.postgres.prisma')).toMatch(/provider\s+=\s+"postgresql"/);
  });
});
