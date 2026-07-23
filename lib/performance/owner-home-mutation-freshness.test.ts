import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

describe('Owner Home post-mutation freshness contracts', () => {
  it('sale completion revalidates reports and onboarding Home without relying on resume stale window', () => {
    const sales = read('app/actions/sales.ts');
    const complete = sales.slice(
      sales.indexOf('export async function completeSaleAction'),
      sales.indexOf('export async function amendSaleAction'),
    );
    expect(complete).toContain("revalidateTag('reports')");
    expect(complete).toContain("revalidatePath('/onboarding')");
  });

  it('TopNav listens for POS sale KPI refresh events (mutation path, not resume stale)', () => {
    const topNav = read('components/TopNav.tsx');
    const events = read('lib/navigation/nav-kpi-events.ts');
    expect(events).toContain('tillflow:nav-kpi-refresh');
    expect(topNav).toContain('NAV_KPI_REFRESH_EVENT');
    expect(topNav).toContain('handlePosSaleComplete');
  });

  it('Home resume stale threshold does not wrap mutation revalidation APIs', () => {
    const refresh = read('hooks/useRouterRefreshOnVisibility.ts');
    expect(refresh).toContain('HOME_RESUME_STALE_MS');
    expect(refresh).not.toContain('revalidatePath');
    expect(refresh).not.toContain('revalidateTag');
  });
});
