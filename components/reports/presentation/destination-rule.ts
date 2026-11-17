import { STAGE_3A_WITHHELD_HREFS } from '@/lib/reports/today/stage3a-nav';

export type DestinationShellAdoption = 'prototype' | 'same-rule-later' | 'outside-reports-layout' | 'withheld';

export type DestinationShellRow = {
  href: string;
  label: string;
  adoption: DestinationShellAdoption;
  reason: string;
};

/**
 * One shell for every Reports destination: location, return, title, scope,
 * period, refresh, optional reading note, then that report's own first result.
 * Stage 3A.1 builds the shell on three reports. The others do not grow a second header system.
 */
export const DESTINATION_SHELL_RULE: DestinationShellRow[] = [
  { href: '/reports/dashboard', label: 'Trading', adoption: 'prototype', reason: 'Shell plus the live Sales revenue card. The welcome heading is not a second title.' },
  { href: '/reports/analytics', label: 'Sales analytics', adoption: 'prototype', reason: 'Shell plus the live KPI row. The row still truncates inside the report body.' },
  { href: '/reports/business-movement', label: 'Business movement', adoption: 'prototype', reason: 'Shell plus the live Sales card. The reading note stays closed until opened.' },
  { href: '/reports/money-received', label: 'Money received', adoption: 'same-rule-later', reason: 'Same chrome. Its ledger body stays out of this blueprint.' },
  { href: '/reports/momo-confirmation', label: 'MoMo to confirm', adoption: 'same-rule-later', reason: 'Same chrome. The confirmation queue stays out of this blueprint.' },
  { href: '/reports/cash-drawer', label: 'Cash drawer', adoption: 'same-rule-later', reason: 'Same chrome. The drawer body stays out of this blueprint.' },
  { href: '/reports/stock-movements', label: 'Stock movements', adoption: 'same-rule-later', reason: 'Same chrome. The movement ledger stays out of this blueprint.' },
  { href: '/reports/margins', label: 'Product margins', adoption: 'same-rule-later', reason: 'Same chrome. The margins body stays out of this blueprint.' },
  { href: '/reports/reorder-suggestions', label: 'Stock to reorder', adoption: 'same-rule-later', reason: 'Same chrome. The reorder body stays out of this blueprint.' },
  { href: '/reports/sales-by-supplier', label: 'Sales by linked supplier', adoption: 'same-rule-later', reason: 'Same chrome. The supplier sales body stays out of this blueprint.' },
  { href: '/reports/risk-monitor', label: 'Control alerts', adoption: 'same-rule-later', reason: 'Same chrome. The alerts body stays out of this blueprint.' },
  { href: '/reports/income-statement', label: 'Income statement', adoption: 'same-rule-later', reason: 'Same chrome. The statement body stays out of this blueprint.' },
  { href: '/reports/exports', label: 'Downloads', adoption: 'same-rule-later', reason: 'Same chrome. Download actions stay out of this blueprint.' },
  { href: '/reports/owner', label: 'Owner brief', adoption: 'same-rule-later', reason: 'Same chrome. The brief body stays out of this blueprint.' },
  { href: '/reports/audit-log', label: 'Audit log', adoption: 'same-rule-later', reason: 'Same chrome. The log body stays out of this blueprint.' },
  { href: '/settings/online-store/analytics', label: 'Storefront', adoption: 'outside-reports-layout', reason: 'This is a Settings page. The Reports shell does not move it in Stage 3A.1.' },
  { href: '/payments/reconciliation', label: 'MoMo with the network', adoption: 'outside-reports-layout', reason: 'This is a Payments page. The Reports shell does not move it in Stage 3A.1.' },
  ...STAGE_3A_WITHHELD_HREFS.map((href) => ({
    href,
    label: href,
    adoption: 'withheld' as const,
    reason: 'Kept out of navigation. The shell does not restore it.',
  })),
];
