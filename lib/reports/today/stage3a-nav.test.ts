import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { STAGE_3A_WITHHELD_HREFS, stage3aLinks, stage3aSection } from '@/lib/reports/today/stage3a-nav';

describe('Stage 3A navigation', () => {
  it('sends Today to the reports page and names More reports only on the desktop list', () => {
    expect(stage3aSection(undefined)).toBe('today');
    expect(stage3aSection('activity')).toBe('activity');
    expect(stage3aSection('more')).toBe('more');
    expect(stage3aSection('balance-sheet')).toBe('today');
    const page = readFileSync('components/reports/today/TodayScreen.tsx', 'utf8');
    expect(page).toContain("label: mobile ? 'More' : 'More reports'");
  });

  it('links only existing authorised destinations and withholds the unfinished statements', () => {
    const allowed = new Set([
      '/reports/dashboard',
      '/reports/income-statement',
      '/reports/exports',
      '/reports/balance-sheet',
      '/reports/cashflow',
      '/reports/cashflow-forecast',
      '/reports/weekly-digest',
      '/reports/owner',
    ]);
    const activity = stage3aLinks('activity', allowed).map((link) => link.href);
    const more = stage3aLinks('more', allowed).map((link) => link.href);
    expect(activity).toEqual(['/reports/dashboard']);
    expect(more).toEqual(['/reports/income-statement', '/reports/exports', '/reports/owner']);
    for (const href of STAGE_3A_WITHHELD_HREFS) {
      expect(activity).not.toContain(href);
      expect(more).not.toContain(href);
    }
  });

  it('does not query Today from the page before the decision allows it', () => {
    const page = readFileSync('app/(protected)/reports/page.tsx', 'utf8');
    const loader = readFileSync('lib/reports/today/load.ts', 'utf8');
    const loadAt = page.indexOf('loadToday(');
    expect(page.indexOf("branch.selected === 'ALL' && plan !== 'PRO'")).toBeLessThan(loadAt);
    expect(page.indexOf('appliedRange')).toBeLessThan(loadAt);
    expect(page).not.toMatch(/selectedPlan/);
    expect(page).not.toMatch(/getTodayKPIs|getCommandCenterKpis|unstable_cache/);
    expect(loader).not.toMatch(/getTodayKPIs|getCommandCenterKpis|selectedPlan/);
    expect(loader).toContain('REPORTING_EXCLUDED_SALE_STATUSES');
    expect(loader).toContain('requireMoneyReceivedMethodRows');
  });
});
