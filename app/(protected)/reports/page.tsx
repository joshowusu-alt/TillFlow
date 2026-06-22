import Link from 'next/link';
import PageHeader from '@/components/PageHeader';
import { requireBusiness } from '@/lib/auth';
import { getFeatures, hasPlanAccess, type BusinessPlan } from '@/lib/features';
import type { AppRole } from '@/lib/navigation-config';

type ReportIconName =
  | 'hub'
  | 'operations'
  | 'owner'
  | 'calendar'
  | 'risk'
  | 'chart'
  | 'trend'
  | 'cash'
  | 'box'
  | 'ledger'
  | 'link'
  | 'customerCredit'
  | 'supplier'
  | 'receipt'
  | 'percent'
  | 'document'
  | 'cashflow'
  | 'scale'
  | 'forecast'
  | 'download'
  | 'audit'
  | 'date'
  | 'branch';

type ReportCard = {
  label: string;
  href: string;
  description: string;
  icon: ReportIconName;
  badge?: string;
  minimumPlan?: BusinessPlan;
  roles?: AppRole[];
};

type ReportGroup = {
  title: string;
  purpose: string;
  icon: ReportIconName;
  reports: ReportCard[];
};

type TrustCard = {
  label: string;
  copy: string;
  icon: ReportIconName;
};

const reportGroups: ReportGroup[] = [
  {
    title: 'Daily Action',
    purpose: 'What needs attention today.',
    icon: 'operations',
    reports: [
      {
        label: 'Operations Today',
        href: '/reports/command-center',
        description: 'See alerts, tasks, and key actions that need attention today.',
        icon: 'operations',
        badge: 'Daily',
      },
      {
        label: 'Owner Brief',
        href: '/reports/owner',
        description: 'Review business health, leakage watch, stock pressure, cash, and priority actions.',
        icon: 'owner',
        badge: 'Owner',
        minimumPlan: 'PRO',
        roles: ['OWNER'],
      },
      {
        label: 'Weekly Digest',
        href: '/reports/weekly-digest',
        description: 'Review the last trading week across sales, receipts, margins, activity, and controls.',
        icon: 'calendar',
        badge: 'Weekly',
      },
      {
        label: 'Risk Monitor',
        href: '/reports/risk-monitor',
        description: 'Follow up overrides, variances, and control alerts before small issues become expensive.',
        icon: 'risk',
        badge: 'Control',
        minimumPlan: 'GROWTH',
      },
    ],
  },
  {
    title: 'Sales & Payments',
    purpose: 'Understand sales and how money came in.',
    icon: 'chart',
    reports: [
      {
        label: 'Trading Report',
        href: '/reports/dashboard',
        description: 'Review sales, receipts, debtors, payables, stock pressure, and period performance.',
        icon: 'chart',
        badge: 'Core',
      },
      {
        label: 'Sales Analytics',
        href: '/reports/analytics',
        description: 'Compare sales trends, product performance, categories, peak hours, and movement.',
        icon: 'trend',
        badge: 'Advanced',
        minimumPlan: 'GROWTH',
      },
      {
        label: 'Cash Drawer',
        href: '/reports/cash-drawer',
        description: 'Compare cash expected, cash counted, and any difference from till activity.',
        icon: 'cash',
        badge: 'Cash',
      },
    ],
  },
  {
    title: 'Stock & Purchases',
    purpose: 'Understand stock, reordering, purchases, and movement.',
    icon: 'box',
    reports: [
      {
        label: 'Reorder Suggestions',
        href: '/reports/reorder-suggestions',
        description: 'See which products may need restocking based on sales and stock levels.',
        icon: 'box',
        badge: 'Stock',
        minimumPlan: 'GROWTH',
      },
      {
        label: 'Stock Movements',
        href: '/reports/stock-movements',
        description: 'Review the stock ledger for sales, purchases, returns, adjustments, and transfers.',
        icon: 'ledger',
        badge: 'Ledger',
      },
      {
        label: 'Sales by Linked Supplier',
        href: '/reports/sales-by-supplier',
        description: 'Understand sales performance by preferred supplier links. This is not supplier debt.',
        icon: 'link',
        badge: 'Supplier sales',
        minimumPlan: 'GROWTH',
      },
    ],
  },
  {
    title: 'Customers & Suppliers',
    purpose: 'Separate money owed to you from money you owe.',
    icon: 'supplier',
    reports: [
      {
        label: 'What customers owe',
        href: '/payments/customer-receipts',
        description: 'Review customer credit and outstanding balances, then record customer receipts.',
        icon: 'customerCredit',
        badge: 'Customers',
      },
      {
        label: 'What you owe suppliers',
        href: '/payments/supplier-aging',
        description: 'Review unpaid supplier purchases, ageing, and overdue supplier balances.',
        icon: 'supplier',
        badge: 'Suppliers',
      },
      {
        label: 'Supplier payments',
        href: '/payments/supplier-payments',
        description: 'Record supplier payments and clear purchase balances after reviewing what is due.',
        icon: 'receipt',
        badge: 'Payables',
      },
    ],
  },
  {
    title: 'Cash & Profit',
    purpose: 'Understand profit, cashflow, and financial statements.',
    icon: 'percent',
    reports: [
      {
        label: 'Profit Margins',
        href: '/reports/margins',
        description: 'Spot below-cost items and products falling short of your target margin.',
        icon: 'percent',
        badge: 'Profit',
        minimumPlan: 'GROWTH',
      },
      {
        label: 'Income Statement',
        href: '/reports/income-statement',
        description: 'Understand revenue, cost of goods sold, expenses, and profit for a selected period.',
        icon: 'document',
        badge: 'Finance',
        minimumPlan: 'GROWTH',
      },
      {
        label: 'Cashflow',
        href: '/reports/cashflow',
        description: 'See how trading, debtors, inventory, supplier balances, and expenses affect cash.',
        icon: 'cashflow',
        badge: 'Finance',
        minimumPlan: 'GROWTH',
      },
      {
        label: 'Balance Sheet',
        href: '/reports/balance-sheet',
        description: 'Review assets, liabilities, and equity as of a selected date.',
        icon: 'scale',
        badge: 'Finance',
        minimumPlan: 'GROWTH',
      },
      {
        label: 'Cashflow Forecast',
        href: '/reports/cashflow-forecast',
        description: 'Project short-term cash pressure from expected inflows, outflows, receivables, and payables.',
        icon: 'forecast',
        badge: 'Owner',
        minimumPlan: 'PRO',
        roles: ['OWNER'],
      },
    ],
  },
  {
    title: 'Exports & Control',
    purpose: 'Download records and review audit/control information.',
    icon: 'download',
    reports: [
      {
        label: 'Exports',
        href: '/reports/exports',
        description: 'Download sales, purchases, inventory, product, margin, risk, and end-of-day records.',
        icon: 'download',
        badge: 'Export',
      },
      {
        label: 'Audit Log',
        href: '/reports/audit-log',
        description: 'Review owner-level audit history for sensitive activity and control checks.',
        icon: 'audit',
        badge: 'Control',
        minimumPlan: 'PRO',
        roles: ['OWNER'],
      },
    ],
  },
];

const trustCards: TrustCard[] = [
  {
    label: 'Date ranges',
    copy: 'Period controls appear inside reports that support date filtering.',
    icon: 'date',
  },
  {
    label: 'Branch scope',
    copy: 'Branch or store filters appear where branch filtering is supported.',
    icon: 'branch',
  },
  {
    label: 'Exports',
    copy: 'Downloads share records without changing the report figures.',
    icon: 'download',
  },
  {
    label: 'Action reports',
    copy: 'Daily reports guide action; finance reports support review and planning.',
    icon: 'operations',
  },
];

const startHereCards: ReportCard[] = [
  {
    label: 'Operations Today',
    href: '/reports/command-center',
    description: 'See what needs attention now.',
    icon: 'operations',
    badge: 'Start',
  },
  {
    label: 'Trading Report',
    href: '/reports/dashboard',
    description: 'Review sales, receipts, debts, payables, and performance.',
    icon: 'chart',
    badge: 'Core',
  },
  {
    label: 'Cash Drawer',
    href: '/reports/cash-drawer',
    description: 'Check expected cash, counted cash, and differences.',
    icon: 'cash',
    badge: 'Cash',
  },
  {
    label: 'Exports',
    href: '/reports/exports',
    description: 'Download records for your accountant or team.',
    icon: 'download',
    badge: 'Export',
  },
];

const iconPaths: Record<ReportIconName, string[]> = {
  hub: ['M4 5.5A1.5 1.5 0 015.5 4h5v7H4V5.5z', 'M13.5 4h5A1.5 1.5 0 0120 5.5v4h-6.5V4z', 'M4 13.5h6.5V20h-5A1.5 1.5 0 014 18.5v-5z', 'M13.5 12H20v6.5a1.5 1.5 0 01-1.5 1.5h-5V12z'],
  operations: ['M8 6h8M8 12h5M8 18h8', 'M4 6h.01M4 12h.01M4 18h.01'],
  owner: ['M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6z', 'M12 15a3 3 0 100-6 3 3 0 000 6z'],
  calendar: ['M7 3v3M17 3v3M4.5 8.5h15M6 5h12a1.5 1.5 0 011.5 1.5v12A1.5 1.5 0 0118 20H6a1.5 1.5 0 01-1.5-1.5v-12A1.5 1.5 0 016 5zM8 13h4M8 16h7'],
  risk: ['M12 4l9 16H3L12 4zM12 10v4M12 17h.01'],
  chart: ['M4 19V5M4 19h16M8 15v-4M12 15V7M16 15v-6'],
  trend: ['M3 17l5-5 4 4 7-8M15 8h4v4'],
  cash: ['M4 8h16v11H4zM4 12h16M9 15h6M8 5h8v3'],
  box: ['M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z', 'M12 12l8-4.5M12 12L4 7.5M12 12v9'],
  ledger: ['M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01'],
  link: ['M9.5 14.5l5-5M10.5 7.5l1-1a4 4 0 015.66 5.66l-1 1M13.5 16.5l-1 1a4 4 0 01-5.66-5.66l1-1'],
  customerCredit: ['M15.5 19a5.5 5.5 0 00-11 0M10 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM16.5 10.5h4M18.5 8.5v4'],
  supplier: ['M4 10.5V20h16v-9.5M4 10.5L5.5 4h13l1.5 6.5M4 10.5h16M8 20v-5h4v5'],
  receipt: ['M7 3.75h10v16.5l-2-1.25-2 1.25-2-1.25-2 1.25-2-1.25V3.75zM9 9h6M9 13h6M9 16h3'],
  percent: ['M5 19L19 5M7.5 8.5a2 2 0 100-4 2 2 0 000 4zM16.5 19.5a2 2 0 100-4 2 2 0 000 4z'],
  document: ['M7 3.75h7l3 3v13.5H7V3.75zM14 3.75V7h3M9 11h6M9 14h6M9 17h3'],
  cashflow: ['M4 8h12l-3-3M20 16H8l3 3M5 13h14'],
  scale: ['M12 3v18M5 6h14M6 6l-3 7h6L6 6zM18 6l-3 7h6l-3-7zM8 21h8'],
  forecast: ['M4 18l5-5 3 3 6-8M15 8h3v3M5 6h3M5 10h2'],
  download: ['M12 4v10M12 14l4-4M12 14l-4-4M5 16v3h14v-3'],
  audit: ['M8 4h8M9 4a3 3 0 016 0M6 7h12v13H6zM9 13l2 2 4-5'],
  date: ['M7 3v3M17 3v3M4.5 8.5h15M6 5h12a1.5 1.5 0 011.5 1.5V18A1.5 1.5 0 0118 19.5H6A1.5 1.5 0 014.5 18V6.5A1.5 1.5 0 016 5z'],
  branch: ['M4 20V6l8-3 8 3v14M8 20v-7h8v7M8 8h.01M12 8h.01M16 8h.01'],
};

function reportVisibleForRole(report: ReportCard, role: AppRole) {
  return !report.roles || report.roles.includes(role);
}

function planBadge(report: ReportCard, currentPlan: BusinessPlan) {
  if (!report.minimumPlan) return report.badge;
  if (hasPlanAccess(currentPlan, report.minimumPlan)) return report.badge;
  return `${report.minimumPlan} report`;
}

function ReportIcon({ name, className = 'h-4 w-4' }: { name: ReportIconName; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.8}
    >
      {iconPaths[name].map((path) => (
        <path key={path} d={path} />
      ))}
    </svg>
  );
}

function ReportCardLink({
  report,
  currentPlan,
  featured = false,
}: {
  report: ReportCard;
  currentPlan: BusinessPlan;
  featured?: boolean;
}) {
  const badge = planBadge(report, currentPlan);

  return (
    <Link
      href={report.href}
      className={
        featured
          ? 'group rounded-2xl border border-blue-100 bg-white p-4 shadow-card transition duration-150 hover:-translate-y-px hover:border-blue-200 hover:shadow-raised active:scale-[0.98] motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:active:scale-100'
          : 'group rounded-2xl border border-slate-200/85 bg-white p-3.5 shadow-card transition duration-150 hover:-translate-y-px hover:border-blue-200 hover:shadow-raised active:scale-[0.98] motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:active:scale-100'
      }
    >
      <div className="flex items-start gap-3">
        <span className={featured ? 'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-700' : 'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-blue-700'}>
          <ReportIcon name={report.icon} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-start justify-between gap-2">
            <span className="min-w-0 text-sm font-semibold text-ink">{report.label}</span>
            {badge ? (
              <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                {badge}
              </span>
            ) : null}
          </span>
          <span className="mt-1.5 block text-sm leading-snug text-black/58">{report.description}</span>
          <span className="mt-2 inline-flex text-xs font-semibold text-primary group-hover:underline">Open</span>
        </span>
      </div>
    </Link>
  );
}

export default async function ReportsIndexPage() {
  const { business, user } = await requireBusiness(['MANAGER', 'OWNER']);
  const features = getFeatures((business as any).plan ?? (business as any).mode, (business as any).storeMode);
  const userRole = user.role as AppRole;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Reports"
        subtitle="Choose the report you need to understand sales, cash, stock, debts, suppliers, and business performance."
      />

      <section className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
        {trustCards.map((card) => (
          <div key={card.label} className="flex gap-3 rounded-2xl border border-slate-200/80 bg-white px-3.5 py-3 shadow-card">
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
              <ReportIcon name={card.icon} className="h-3.5 w-3.5" />
            </span>
            <span className="min-w-0">
              <span className="block text-xs font-semibold uppercase tracking-[0.14em] text-black/45">{card.label}</span>
              <span className="mt-1 block text-sm leading-snug text-black/60">{card.copy}</span>
            </span>
          </div>
        ))}
      </section>

      <section className="rounded-2xl border border-blue-100 bg-blue-50/70 px-4 py-3 text-sm leading-relaxed text-blue-900 shadow-sm">
        Reports are based on the records entered in TillFlow. For the clearest view, keep sales, purchases, stock
        adjustments, customer receipts, and supplier payments up to date.
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
            <ReportIcon name="hub" className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-lg font-display font-semibold text-ink">Start here</h2>
            <p className="text-sm text-black/55">Quick paths for the reports owners use most.</p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {startHereCards.map((report) => (
            <ReportCardLink key={report.href} report={report} currentPlan={features.plan} featured />
          ))}
        </div>
      </section>

      <div className="space-y-4">
        {reportGroups.map((group) => {
          const visibleReports = group.reports.filter((report) => reportVisibleForRole(report, userRole));
          if (visibleReports.length === 0) return null;

          return (
            <section key={group.title} className="rounded-3xl border border-slate-200/75 bg-slate-50/45 p-3 shadow-sm sm:p-4">
              <div className="mb-3 flex items-center gap-3">
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-white text-blue-700 shadow-sm">
                  <ReportIcon name={group.icon} />
                </span>
                <div className="min-w-0">
                  <h2 className="text-base font-display font-semibold text-ink">{group.title}</h2>
                  <p className="mt-0.5 text-sm text-black/55">{group.purpose}</p>
                </div>
              </div>
              <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
                {visibleReports.map((report) => (
                  <ReportCardLink key={report.href} report={report} currentPlan={features.plan} />
                ))}
              </div>
            </section>
          );
        })}
      </div>

      <footer className="rounded-2xl border border-slate-200/80 bg-white px-4 py-3 text-sm leading-relaxed text-black/55 shadow-card">
        Some reports are for daily action, while others are for financial review. Date, branch, and export controls live
        inside each report where they are supported.
      </footer>
    </div>
  );
}
