import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');

describe('Mobile dashboard sales consistency', () => {
  it('shares getTodayKPIs across nav, operations, and home readiness surfaces', () => {
    const navKpis = read('app/actions/nav-kpis.ts');
    const onboarding = read('app/actions/onboarding.ts');
    const commandCenter = read('app/(protected)/reports/command-center/page.tsx');

    expect(navKpis).toContain("import { getTodayKPIs } from '@/lib/reports/today-kpis'");
    expect(navKpis).toContain('getTodayKPIs(business.id)');
    expect(navKpis).toContain('totalPence: kpis.totalSalesPence');
    expect(navKpis).toContain('txCount: kpis.txCount');

    expect(onboarding).toContain("import { getTodayKPIs } from '@/lib/reports/today-kpis'");
    expect(onboarding).toContain('getTodayKPIs(business.id)');
    expect(onboarding).toContain('todayRevenuePence: todayKpis?.totalSalesPence ?? 0');
    expect(onboarding).toContain('todayTransactionCount: todayKpis?.txCount ?? 0');

    expect(commandCenter).toContain("import { getTodayKPIs } from '@/lib/reports/today-kpis'");
    expect(commandCenter).toContain('getTodayKPIs(business.id)');
    expect(commandCenter).toContain('kpis.totalSalesPence');
    expect(commandCenter).toContain('kpis.txCount');
    expect(commandCenter).toContain('kpis.todayReceiptsPence');
  });

  it('labels business-wide KPI surfaces as all branches', () => {
    const commandCenter = read('app/(protected)/reports/command-center/page.tsx');
    const topNav = read('components/TopNav.tsx');
    const mobileMenu = read('components/NavMobileMenu.tsx');
    const readiness = read('components/ReadinessJourney.tsx');

    expect(commandCenter).toContain('All branches');
    expect(commandCenter).not.toContain("store?.name ?? 'Main branch'");
    expect(topNav).toContain("mobileSales ? 'All branches'");
    expect(mobileMenu).not.toContain('Today sales · all branches');
    expect(mobileMenu).not.toContain('Transactions · all branches');
    expect(mobileMenu).toContain('Quick actions');
    expect(readiness).toContain('Today · all branches');
  });

  it('home hero live revenue and transaction stats refresh from the same action as the top nav', () => {
    const topNav = read('components/TopNav.tsx');
    const readiness = read('components/ReadinessJourney.tsx');

    expect(topNav).toContain("import { getNavTodaySales } from '@/app/actions/nav-kpis'");
    expect(topNav).toContain('const fresh = await getNavTodaySales()');
    expect(topNav).toContain('NAV_KPI_REFRESH_EVENT');

    expect(readiness).toContain("import { getNavTodaySales } from '@/app/actions/nav-kpis'");
    expect(readiness).toContain('const fresh = await getNavTodaySales()');
    expect(readiness).toContain('todayRevenuePence: fresh.totalPence');
    expect(readiness).toContain('todayTransactionCount: fresh.txCount');
    expect(readiness).toContain('displayData');
    expect(readiness).toContain('expectedCashPence');
  });

  it('keeps expected cash and receipts as distinct metrics on Operations Today', () => {
    const commandCenter = read('app/(protected)/reports/command-center/page.tsx');
    const readiness = read('components/ReadinessJourney.tsx');

    expect(commandCenter).toContain("label: \"Today's receipts\"");
    expect(commandCenter).toContain('kpis.todayReceiptsPence');
    expect(commandCenter).toContain("label: \"Today's sales\"");
    expect(readiness).toContain('Expected Cash');
    expect(readiness).toContain('Current open till balance');
    expect(readiness).not.toContain('expectedCashPence: kpis');
  });

  it('POS checkout success revalidates reports, owner dashboard, readiness, and onboarding', () => {
    const sales = read('app/actions/sales.ts');
    const completeSaleBlock = sales.slice(
      sales.indexOf('export async function completeSaleAction'),
      sales.indexOf('export async function amendSaleAction'),
    );

    expect(completeSaleBlock).toContain("revalidateTag('reports')");
    expect(completeSaleBlock).toContain('revalidateOwnerDashboardCache()');
    expect(completeSaleBlock).toContain('revalidateTag(`readiness-${businessId}`)');
    expect(completeSaleBlock).toContain("revalidatePath('/onboarding')");
    expect(completeSaleBlock).toContain('await createSale({');
  });

  it('RefreshIndicator and home readiness refresh when the page becomes active again', () => {
    const refreshIndicator = read('components/RefreshIndicator.tsx');
    const readiness = read('components/ReadinessJourney.tsx');
    const hook = read('hooks/useRouterRefreshOnVisibility.ts');

    expect(refreshIndicator).toContain('useRouterRefreshOnVisibility');
    expect(refreshIndicator).toContain('setInterval(() => router.refresh()');
    expect(readiness).toContain('useRouterRefreshOnVisibility');
    expect(hook).toContain('visibilitychange');
    expect(hook).toContain("document.visibilityState === 'visible'");
    expect(hook).toContain("window.addEventListener('focus'");
    expect(hook).toContain("window.addEventListener('pageshow'");
    expect(hook).toContain('event.persisted');
  });
});
