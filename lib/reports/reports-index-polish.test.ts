import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NAV_GROUPS, REPORT_NAV_SECTIONS } from '@/lib/navigation-config';
import { STAGE_3A_WITHHELD_HREFS, stage3aLinks } from '@/lib/reports/today/stage3a-nav';

const root = process.cwd();
const src = readFileSync(join(root, 'app/(protected)/reports/page.tsx'), 'utf8');
const nav = readFileSync(join(root, 'lib/reports/today/stage3a-nav.ts'), 'utf8');
const screen = readFileSync(join(root, 'components/reports/today/TodayScreen.tsx'), 'utf8');

describe('Reports Today shell', () => {
  it('replaces the card catalogue with Today and does not redirect the page to Command Center', () => {
    expect(src).toContain('export default function ReportsPage');
    expect(src).not.toContain("redirect('/reports/command-center')");
    expect(src).not.toContain("title: 'Daily Action'");
    expect(src).not.toContain('const startHereCards');
    expect(src).toContain('loadToday(');
    expect(src).toContain("surfaceId: 'command_center'");
  });

  it('keeps Reports in the header as Today, Activity and More reports', () => {
    const reports = NAV_GROUPS.find((group) => group.id === 'reports');
    expect(reports?.items.map((item) => item.label)).toEqual(['Today', 'Activity', 'More reports']);
    expect(reports?.items.map((item) => item.href)).toEqual([
      '/reports',
      '/reports?section=activity',
      '/reports?section=more',
    ]);
    const labels = REPORT_NAV_SECTIONS.flatMap((section) => section.items.map((item) => item.label));
    expect(labels).toEqual(['Today', 'Activity', 'More reports']);
  });

  it('lists existing Activity and More destinations and withholds unfinished statements', () => {
    expect(screen).toContain('More reports');
    expect(screen).toContain('data-reports-nav="contextual"');
    expect(screen).not.toContain('fixed inset-x-0');
    expect(nav).toContain("href: '/reports/business-movement'");
    expect(nav).toContain("href: '/reports/dashboard'");
    expect(nav).toContain("href: '/reports/cash-drawer'");
    expect(src).toContain("'/payments/customer-receipts'");
    expect(src).not.toContain('/payments/customer-aging');
    const everything = new Set([
      '/reports/dashboard',
      '/reports/business-movement',
      '/reports/money-received',
      '/reports/momo-confirmation',
      '/reports/cash-drawer',
      '/reports/stock-movements',
      '/reports/margins',
      '/reports/reorder-suggestions',
      '/reports/sales-by-supplier',
      '/reports/risk-monitor',
      '/settings/online-store/analytics',
      '/reports/income-statement',
      '/reports/exports',
      '/reports/owner',
      '/reports/audit-log',
      ...STAGE_3A_WITHHELD_HREFS,
    ]);
    const shown = [
      ...stage3aLinks('activity', everything),
      ...stage3aLinks('more', everything),
    ].map((link) => link.href);
    expect(shown).toContain('/reports/business-movement');
    for (const href of STAGE_3A_WITHHELD_HREFS) expect(shown).not.toContain(href);
  });
});
