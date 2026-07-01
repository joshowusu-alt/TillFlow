import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');

describe('Trust Breakers T1: cold boot and POS measurement', () => {
  const layout = read('app/(protected)/layout.tsx');
  const onboardingPage = read('app/(protected)/onboarding/page.tsx');
  const onboardingAction = read('app/actions/onboarding.ts');
  const posPage = read('app/(protected)/pos/page.tsx');
  const launchRedirector = read('components/LaunchRedirector.tsx');
  const launchCompletion = read('components/LaunchSessionCompletion.tsx');
  const onboardingClient = read('app/(protected)/onboarding/OnboardingClient.tsx');
  const salesAction = read('app/actions/sales.ts');
  const salesService = read('lib/services/sales.ts');

  it('instruments protected layout auth and store gates', () => {
    expect(layout).toContain('app.protected.layout-gate');
    expect(layout).toContain('app.protected.require-business');
    expect(layout).toContain('app.protected.first-store');
    expect(layout).toContain('measureServerOperation');
  });

  it('instruments owner onboarding readiness', () => {
    expect(onboardingAction).toContain('page.onboarding.get-readiness');
    expect(read('app/(protected)/onboarding/OwnerReadinessContent.tsx')).toContain('page.onboarding.owner-readiness');
    expect(read('app/(protected)/onboarding/OwnerReadinessContent.tsx')).toContain('measureServerOperation');
    expect(onboardingPage).toContain('<Suspense');
    expect(onboardingPage).toContain('OwnerReadinessContent');
  });

  it('adds launch handoff performance marks without changing delay constants', () => {
    expect(launchRedirector).toContain('markTillflowPerformance');
    expect(launchRedirector).not.toContain("performance.mark('tillflow.launch.mounted')");
    expect(launchRedirector).toContain("'tillflow.launch.mounted'");
    expect(launchRedirector).toContain("'tillflow.launch.redirect.scheduled'");
    expect(launchRedirector).toContain("'tillflow.launch.redirect.started'");
    expect(launchRedirector).toContain('160');

    expect(launchCompletion).toContain('markTillflowPerformance');
    expect(launchCompletion).toContain("'tillflow.launch.completion.mounted'");
    expect(launchCompletion).toContain("'tillflow.launch.splash.remove.started'");
    expect(launchCompletion).toContain("'tillflow.launch.splash.removed'");
    expect(launchCompletion).toContain('480');

    expect(onboardingClient).toContain("'tillflow.launch.protected-content.mounted'");
  });

  it('instruments POS data stages while preserving Promise.all parallelism', () => {
    expect(posPage).toContain('page.pos.total-load');
    expect(posPage).toContain('page.pos.initial-data-load');
    expect(posPage).toContain('page.pos.tills-load');
    expect(posPage).toContain('page.pos.shifts-load');
    expect(posPage).toContain('page.pos.inventory-load');
    expect(posPage).toContain('page.pos.products-load');
    expect(posPage).toContain('page.pos.units-load');
    expect(posPage).toContain('page.pos.categories-load');
    expect(posPage).toContain('page.pos.customers-load');
    expect(posPage).toContain('page.pos.requested-customer-load');
    expect(posPage).toContain('page.pos.open-shift-load');
    expect(posPage).toContain('page.pos.dto-map');

    const initialLoadBlock = posPage.slice(
      posPage.indexOf('page.pos.initial-data-load'),
      posPage.indexOf('page.pos.open-shift-load'),
    );
    expect(initialLoadBlock).toContain('Promise.all([');
    expect(initialLoadBlock).not.toMatch(/await measurePosFetch[\s\S]*await measurePosFetch/);
  });

  it('does not change checkout, sale creation, cache TTLs, or schema', () => {
    expect(salesAction).toContain('export async function completeSaleAction(data: {');
    expect(salesService).toContain('action.checkout.create-sale');
    expect(salesService).toContain("{ revalidate: 60, tags: ['checkout-context'] }");
    expect(salesService).toContain("{ revalidate: 300, tags: ['checkout-context'] }");

    expect(posPage).toContain("{ revalidate: 60, tags: ['pos-products'] }");
    expect(posPage).toContain("{ revalidate: 30, tags: ['pos-inventory'] }");
    expect(posPage).toContain("{ revalidate: 10, tags: ['pos-shifts'] }");

    expect(read('prisma/schema.prisma')).toMatch(/provider\s+=\s+"sqlite"/);
    expect(read('prisma/schema.postgres.prisma')).toMatch(/provider\s+=\s+"postgresql"/);
  });

  it('does not add production console logging for client launch marks', () => {
    const clientMarks = read('lib/performance/client-performance-marks.ts');
    expect(clientMarks).toContain('performance.mark');
    expect(clientMarks).not.toContain('console.log');
    expect(clientMarks).not.toContain('console.warn');
  });
});
