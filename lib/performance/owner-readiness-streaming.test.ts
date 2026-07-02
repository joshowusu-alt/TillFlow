import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');

describe('Trust Breakers T2: owner home readiness streaming', () => {
  const onboardingPage = read('app/(protected)/onboarding/page.tsx');
  const ownerContent = read('app/(protected)/onboarding/OwnerReadinessContent.tsx');
  const onboardingAction = read('app/actions/onboarding.ts');
  const onboardingClient = read('app/(protected)/onboarding/OnboardingClient.tsx');
  const posPage = read('app/(protected)/pos/page.tsx') + '\n' + read('app/(protected)/pos/PosBoard.tsx');
  const salesAction = read('app/actions/sales.ts');
  const todayKpis = read('lib/reports/today-kpis.ts');

  it('streams owner readiness behind Suspense instead of blocking the page shell', () => {
    expect(onboardingPage).toContain('<Suspense');
    expect(onboardingPage).toContain('OwnerReadinessContent');
    expect(onboardingPage).toContain('OwnerReadinessSkeleton');
    expect(onboardingPage).not.toMatch(/await\s+measureServerOperation[\s\S]*getReadiness/);
    expect(onboardingPage).not.toContain('await getReadiness');
  });

  it('loads heavy readiness in a child async server component', () => {
    expect(ownerContent).toContain('export default async function OwnerReadinessContent');
    expect(ownerContent).toContain('page.onboarding.owner-readiness');
    expect(ownerContent).toContain('getReadiness()');
    expect(ownerContent).toContain('completeOnboarding()');
    expect(ownerContent).toContain('<OnboardingClient readiness={readiness} />');
  });

  it('preserves auth and role gates on the top-level page', () => {
    expect(onboardingPage).toContain('requireUser()');
    expect(onboardingPage).toContain("user.role !== 'OWNER'");
    expect(onboardingPage).toContain("redirect('/pos')");
  });

  it('keeps getReadiness and getTodayKPIs calculation logic unchanged', () => {
    expect(onboardingAction).toContain('page.onboarding.get-readiness');
    expect(onboardingAction).toContain('getTodayKPIs(business.id)');
    expect(onboardingAction).toContain('todayRevenuePence: todayKpis?.totalSalesPence ?? 0');
    expect(onboardingAction).toContain('todayTransactionCount: todayKpis?.txCount ?? 0');
    expect(onboardingAction).toContain('resolveReadinessExpectedCashPence');

    expect(todayKpis).toContain('export function getTodayKPIs');
    expect(todayKpis).toContain('report.today-kpis.snapshot');
  });

  it('preserves hero live KPI refresh and protected-shell launch completion', () => {
    const readinessJourney = read('components/ReadinessJourney.tsx');
    const protectedLayout = read('app/(protected)/layout.tsx');

    expect(onboardingClient).toContain("'tillflow.launch.protected-content.mounted'");
    expect(protectedLayout).toContain('LaunchSessionCompletion');
    expect(onboardingPage).not.toContain('LaunchSessionCompletion');

    expect(readinessJourney).toContain('getNavTodaySales');
    expect(readinessJourney).toContain('todayRevenuePence: fresh.totalPence');
    expect(readinessJourney).toContain('todayTransactionCount: fresh.txCount');
    expect(readinessJourney).toContain('useRouterRefreshOnVisibility');
  });

  it('uses a compact owner-dashboard skeleton fallback', () => {
    const skeleton = read('app/(protected)/onboarding/OwnerReadinessSkeleton.tsx');
    const loading = read('app/(protected)/onboarding/loading.tsx');

    expect(skeleton).toContain('Today in your shop');
    expect(skeleton).toContain("Preparing today");
    expect(skeleton).not.toContain('min-h-[70vh]');
    expect(skeleton).not.toContain('tillflow-logo');
    expect(loading).toContain('OwnerReadinessSkeleton');
  });

  it('does not touch POS, checkout, cache TTLs, tags, revalidation, or schema', () => {
    expect(posPage).toContain("{ revalidate: 60, tags: ['pos-products'] }");
    expect(posPage).toContain("{ revalidate: 30, tags: ['pos-inventory'] }");
    expect(posPage).not.toContain('OwnerReadinessContent');

    expect(salesAction).toContain('export async function completeSaleAction(data: {');
    expect(salesAction).toContain("revalidateTag('reports')");
    expect(salesAction).not.toContain('OwnerReadinessContent');

    expect(onboardingAction).toContain("revalidateTag(`readiness-${business.id}`)");
    expect(onboardingAction).toContain("revalidateTag('control-portfolio')");
    expect(onboardingAction).not.toMatch(/revalidate:\s*\d+/);

    expect(read('prisma/schema.prisma')).toMatch(/provider\s+=\s+"sqlite"/);
    expect(read('prisma/schema.postgres.prisma')).toMatch(/provider\s+=\s+"postgresql"/);
  });
});
