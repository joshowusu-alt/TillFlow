import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');

describe('POS nav KPI refresh after checkout', () => {
  it('completeSaleAction revalidates reports and readiness tags', () => {
    const sales = read('app/actions/sales.ts');
    const completeSaleBlock = sales.slice(
      sales.indexOf('export async function completeSaleAction'),
      sales.indexOf('export async function amendSaleAction'),
    );

    expect(completeSaleBlock).toContain("revalidateTag('reports')");
    expect(completeSaleBlock).toContain('revalidateTag(`readiness-${businessId}`)');
    expect(completeSaleBlock).toContain('revalidateOwnerDashboardCache()');
  });

  it('POS checkout dispatches nav KPI refresh after a successful sale', () => {
    const posClient = read('app/(protected)/pos/PosClient.tsx');

    expect(posClient).toContain("import { dispatchNavKpiRefresh } from '@/lib/navigation/nav-kpi-events'");
    expect(posClient).toContain('dispatchNavKpiRefresh()');
    expect(posClient.indexOf('dispatchNavKpiRefresh()')).toBeGreaterThan(
      posClient.indexOf('if (result.success)'),
    );
  });

  it('TopNav listens for checkout refresh events and refetches nav KPIs', () => {
    const topNav = read('components/TopNav.tsx');
    const navKpis = read('app/actions/nav-kpis.ts');

    expect(topNav).toContain('NAV_KPI_REFRESH_EVENT');
    expect(topNav).toContain('handlePosSaleComplete');
    expect(topNav).toContain('const fresh = await getNavTodaySales()');
    expect(navKpis).toContain("requireBusiness(['CASHIER', 'MANAGER', 'OWNER'])");
  });

  it('nav KPI totals are visible for cashier and manager in the header', () => {
    const navTrustPanel = read('components/NavTrustPanel.tsx');
    const topNav = read('components/TopNav.tsx');

    expect(navTrustPanel).not.toContain("user.role === 'MANAGER' || user.role === 'OWNER'");
    expect(topNav).not.toContain("user.role === 'MANAGER' || user.role === 'OWNER'");
    expect(topNav).toContain('showMobileSalesPulse = Boolean(liveTodaySales)');
  });
});
