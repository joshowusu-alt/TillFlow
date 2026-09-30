/**
 * Stage 3A navigation. Today is the live page. Activity and More reports are
 * stage-safe lists of routes that already exist. They are not the later
 * Activity or More redesign. Withheld reports are never linked.
 *
 * Today (`/reports`, or `section` omitted):
 *   Live Today for the store scope authorised by `command_center`.
 *
 * Activity (`/reports?section=activity`):
 *   Links, only when that surface's own VIEW decision allows them:
 *   Trading `/reports/dashboard`, Business movement `/reports/business-movement`,
 *   Money received `/reports/money-received`,
 *   MoMo to confirm `/reports/momo-confirmation`, Cash drawer `/reports/cash-drawer`,
 *   Stock movements `/reports/stock-movements`, Product margins `/reports/margins`,
 *   Stock to reorder `/reports/reorder-suggestions`, Sales by linked supplier
 *   `/reports/sales-by-supplier`, Control alerts `/reports/risk-monitor`,
 *   Storefront `/settings/online-store/analytics`.
 *
 * More reports (`/reports?section=more`; mobile label More):
 *   Income statement `/reports/income-statement`, Downloads `/reports/exports`,
 *   Owner brief `/reports/owner`, Audit log `/reports/audit-log`.
 *   Each link is shown only when its own VIEW decision allows it.
 *
 * Not linked from this stage: Balance Sheet, Cash-flow Statement, Cash-flow
 * Forecast, and Weekly Digest. Those direct routes stay as they are.
 */

export const STAGE_3A_WITHHELD_HREFS = [
  '/reports/balance-sheet',
  '/reports/cashflow',
  '/reports/cashflow-forecast',
  '/reports/weekly-digest',
] as const;

export type Stage3aSection = 'today' | 'activity' | 'more';

export type Stage3aLink = {
  href: string;
  label: string;
  purpose: string;
  group: 'Reports' | 'Queues' | 'Ledgers' | 'Statements' | 'Downloads' | 'Oversight';
};

const ACTIVITY_LINKS: Stage3aLink[] = [
  { href: '/reports/dashboard', label: 'Trading', purpose: 'Sales for a period you choose', group: 'Reports' },
  { href: '/reports/business-movement', label: 'Business movement', purpose: 'How stock, cash and debts moved', group: 'Reports' },
  { href: '/reports/money-received', label: 'Money received', purpose: 'Confirmed payments, separate from sales', group: 'Reports' },
  { href: '/settings/online-store/analytics', label: 'Storefront', purpose: 'Online shop visits and orders', group: 'Reports' },
  { href: '/reports/momo-confirmation', label: 'MoMo to confirm', purpose: 'Payments waiting for you to confirm', group: 'Queues' },
  { href: '/reports/cash-drawer', label: 'Cash drawer', purpose: 'Expected cash, counted cash, difference', group: 'Ledgers' },
  { href: '/reports/stock-movements', label: 'Stock movements', purpose: 'Stock in and out', group: 'Ledgers' },
  { href: '/reports/margins', label: 'Product margins', purpose: 'Products below your target, when cost is known', group: 'Ledgers' },
  { href: '/reports/reorder-suggestions', label: 'Stock to reorder', purpose: 'What may run out', group: 'Ledgers' },
  { href: '/reports/sales-by-supplier', label: 'Sales by linked supplier', purpose: 'Sales for linked products. Not what you owe.', group: 'Ledgers' },
  { href: '/reports/risk-monitor', label: 'Control alerts', purpose: 'Variances and discounts worth a look', group: 'Ledgers' },
];

const MORE_LINKS: Stage3aLink[] = [
  { href: '/reports/income-statement', label: 'Income statement', purpose: 'Sales, costs, expenses and profit for the whole business', group: 'Statements' },
  { href: '/reports/exports', label: 'Downloads', purpose: 'CSV files for sales, purchases, stock and the till', group: 'Downloads' },
  { href: '/reports/owner', label: 'Owner brief', purpose: 'Owner brief for the whole business', group: 'Oversight' },
  { href: '/reports/audit-log', label: 'Audit log', purpose: 'Owner audit log', group: 'Oversight' },
];

export function stage3aSection(value: string | undefined): Stage3aSection {
  if (value === 'activity') return 'activity';
  if (value === 'more') return 'more';
  return 'today';
}

const WITHHELD = new Set<string>(STAGE_3A_WITHHELD_HREFS);

export function withStoreScope(href: string, storeId: string | null): string {
  if (!storeId) return href;
  const url = new URL(href, 'https://tillflow.local');
  url.searchParams.set('storeId', storeId);
  return `${url.pathname}${url.search}`;
}

export function stage3aLinks(section: Stage3aSection, allowedHrefs: ReadonlySet<string>): Stage3aLink[] {
  if (section === 'today') return [];
  const source = section === 'activity' ? ACTIVITY_LINKS : MORE_LINKS;
  return source.filter((link) => allowedHrefs.has(link.href) && !WITHHELD.has(link.href));
}

export type ReportReturnPath = {
  href: string;
  section: 'activity' | 'more';
  title: string;
  backLabel: 'Back to Activity' | 'Back to More reports';
};

const WITHHELD_TITLES: Record<(typeof STAGE_3A_WITHHELD_HREFS)[number], string> = {
  '/reports/balance-sheet': 'Balance sheet',
  '/reports/cashflow': 'Cash-flow statement',
  '/reports/cashflow-forecast': 'Cash-flow forecast',
  '/reports/weekly-digest': 'Weekly digest',
};

/** Every Activity and More destination, used to prove a return path exists. */
export function reportReturnPaths(): ReportReturnPath[] {
  return [...ACTIVITY_LINKS, ...MORE_LINKS].map((link) => ({
    href: link.href,
    section: ACTIVITY_LINKS.some((item) => item.href === link.href) ? 'activity' : 'more',
    title: link.label,
    backLabel: ACTIVITY_LINKS.some((item) => item.href === link.href) ? 'Back to Activity' : 'Back to More reports',
  }));
}

export function returnPathFor(pathname: string): ReportReturnPath | { withheld: true; title: string; href: string } | null {
  const listed = reportReturnPaths().find((path) => path.href === pathname);
  if (listed) return listed;
  if (pathname in WITHHELD_TITLES) {
    const href = pathname as keyof typeof WITHHELD_TITLES;
    return { withheld: true, title: WITHHELD_TITLES[href], href };
  }
  return null;
}

/**
 * A return link may carry one owned store id. ALL, duplicates, blanks and
 * foreign ids are dropped so the destination resolves its own scope.
 */
export function safeReturnStoreId(search: string, ownedStoreIds: readonly string[]): string | null {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const values = params.getAll('storeId').map((value) => value.trim()).filter((value) => value.length > 0);
  if (values.length !== 1) return null;
  const id = values[0];
  if (id === 'ALL') return null;
  const matches = ownedStoreIds.filter((owned) => owned === id);
  return matches.length === 1 ? id : null;
}
