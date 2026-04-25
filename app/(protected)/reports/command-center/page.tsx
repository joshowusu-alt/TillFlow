import Link from 'next/link';
import { requireBusiness } from '@/lib/auth';
import { getTodayKPIs } from '@/lib/reports/today-kpis';
import { getFirstStore } from '@/lib/auth';
import { getFeatures } from '@/lib/features';
import { formatMoney } from '@/lib/format';
import RefreshIndicator from '@/components/RefreshIndicator';

export const dynamic = 'force-dynamic';

/* ─── Types ──────────────────────────────────────────────────────────── */
type Severity = 'critical' | 'warning' | 'info';

interface AttentionItem {
  id: string;
  severity: Severity;
  title: string;
  detail: string;
  href: string;
  cta: string;
}

interface NextAction {
  id: string;
  label: string;
  detail: string;
  href: string;
  primary?: boolean;
}

interface DeeperLink {
  label: string;
  desc: string;
  href: string;
  plan?: 'GROWTH' | 'PRO';
}

/* ─── Page ───────────────────────────────────────────────────────────── */

export default async function CommandCenterPage() {
  const { business, user } = await requireBusiness(['MANAGER', 'OWNER']);
  const features = getFeatures(
    (business as any).plan ?? (business.mode as any),
    (business as any).storeMode as any,
  );

  const store = await getFirstStore(business.id);
  const now = new Date();
  const kpis = await getTodayKPIs(business.id).catch(() => null);

  const currency = business.currency;

  /* ── Build attention items from KPI signals ─────────────────────── */
  const attentionItems: AttentionItem[] = [];

  if (kpis) {
    if (kpis.stockoutImminentCount > 0) {
      attentionItems.push({
        id: 'stockout',
        severity: 'critical',
        title: `${kpis.stockoutImminentCount} product${kpis.stockoutImminentCount === 1 ? '' : 's'} about to stock out`,
        detail: 'Shelf will be empty before next reorder unless you act now.',
        href: '/reports/reorder-suggestions',
        cta: 'Open reorder queue',
      });
    }

    if (kpis.urgentReorderCount > 0) {
      attentionItems.push({
        id: 'reorder',
        severity: 'warning',
        title: `${kpis.urgentReorderCount} urgent reorder${kpis.urgentReorderCount === 1 ? '' : 's'} needed`,
        detail: 'Stock below reorder threshold — raise purchase orders before availability drops.',
        href: '/reports/reorder-suggestions',
        cta: 'View reorder queue',
      });
    }

    if (kpis.arOver60Pence > 0) {
      attentionItems.push({
        id: 'ar-overdue',
        severity: kpis.arOver90Pence > 0 ? 'critical' : 'warning',
        title: `${formatMoney(kpis.arOver60Pence, currency)} in overdue receivables`,
        detail: kpis.arOver90Pence > 0
          ? `${formatMoney(kpis.arOver90Pence, currency)} is 90+ days overdue — risk of write-off.`
          : 'Outstanding customer invoices over 60 days — follow up to protect cashflow.',
        href: '/payments/customer-receipts',
        cta: 'Collect receipts',
      });
    }

    if (kpis.outstandingAPPence > 0) {
      attentionItems.push({
        id: 'ap-due',
        severity: 'warning',
        title: `${formatMoney(kpis.outstandingAPPence, currency)} payable to suppliers`,
        detail: 'Outstanding purchase invoices need attention to maintain supplier relationships.',
        href: '/payments/supplier-payments',
        cta: 'Pay suppliers',
      });
    }

    if (kpis.cashVarianceTotalPence > 0) {
      attentionItems.push({
        id: 'cash-variance',
        severity: 'warning',
        title: `${formatMoney(kpis.cashVarianceTotalPence, currency)} unreconciled cash variance`,
        detail: 'Till cash does not match expected balance — investigate discrepancies.',
        href: '/reports/cash-drawer',
        cta: 'Investigate',
      });
    }

    if (kpis.momoPendingCount > 0) {
      attentionItems.push({
        id: 'momo-pending',
        severity: 'info',
        title: `${kpis.momoPendingCount} MoMo payment${kpis.momoPendingCount === 1 ? '' : 's'} pending reconciliation`,
        detail: 'Mobile Money transactions awaiting confirmation — reconcile before end of day.',
        href: '/payments/reconciliation',
        cta: 'Reconcile MoMo',
      });
    }

    if (kpis.negativeMarginProductCount > 0) {
      attentionItems.push({
        id: 'neg-margin',
        severity: 'warning',
        title: `${kpis.negativeMarginProductCount} product${kpis.negativeMarginProductCount === 1 ? '' : 's'} selling below cost`,
        detail: 'Negative margin detected — review pricing before losses compound.',
        href: '/reports/margins',
        cta: 'Check margins',
      });
    }

    if (kpis.discountOverrideCount > 0) {
      attentionItems.push({
        id: 'discount-overrides',
        severity: 'info',
        title: `${kpis.discountOverrideCount} discount override${kpis.discountOverrideCount === 1 ? '' : 's'} today`,
        detail: 'Manual overrides recorded in today\'s sales — verify they were authorised.',
        href: '/reports/risk-monitor',
        cta: 'Review overrides',
      });
    }
  }

  /* ── Build next actions ─────────────────────────────────────────── */
  const nextActions: NextAction[] = [];

  if ((kpis?.txCount ?? 0) === 0) {
    nextActions.push({
      id: 'open-pos',
      label: 'Open the POS',
      detail: 'No sales recorded today yet.',
      href: '/pos',
      primary: true,
    });
  } else {
    nextActions.push({
      id: 'continue-selling',
      label: 'Continue selling',
      detail: `${kpis!.txCount} sale${kpis!.txCount === 1 ? '' : 's'} recorded today.`,
      href: '/pos',
      primary: true,
    });
  }

  if ((kpis?.urgentReorderCount ?? 0) > 0 || (kpis?.stockoutImminentCount ?? 0) > 0) {
    nextActions.push({
      id: 'reorder-now',
      label: 'Raise purchase orders',
      detail: 'Low stock lines need restocking now.',
      href: '/purchases',
    });
  }

  if ((kpis?.arOver60Pence ?? 0) > 0) {
    nextActions.push({
      id: 'chase-debtors',
      label: 'Chase overdue invoices',
      detail: `${formatMoney(kpis!.arOver60Pence, currency)} in customer debt over 60 days.`,
      href: '/payments/customer-receipts',
    });
  }

  if ((kpis?.momoPendingCount ?? 0) > 0) {
    nextActions.push({
      id: 'reconcile-momo',
      label: 'Reconcile MoMo',
      detail: `${kpis!.momoPendingCount} pending transaction${kpis!.momoPendingCount === 1 ? '' : 's'}.`,
      href: '/payments/reconciliation',
    });
  }

  nextActions.push({
    id: 'record-purchases',
    label: 'Record supplier delivery',
    detail: 'Log goods received to keep stock counts accurate.',
    href: '/purchases',
  });

  /* ── Deeper analysis links ──────────────────────────────────────── */
  const deeperLinks: DeeperLink[] = [
    { label: 'Trading Report', desc: 'Sales, debtors, and stock pressure for any date range', href: '/reports/dashboard' },
  ];

  if (features.advancedReports) {
    deeperLinks.push(
      { label: 'Trend Analytics', desc: 'Period-over-period trends, product performance, and customer mix', href: '/reports/analytics', plan: 'GROWTH' },
      { label: 'Profit Margins', desc: 'Product-level margin analysis with cost breakdown', href: '/reports/margins', plan: 'GROWTH' },
      { label: 'Risk Monitor', desc: 'Overrides, variances, and control alerts', href: '/reports/risk-monitor', plan: 'GROWTH' },
      { label: 'Reorder Queue', desc: 'Stock replenishment priorities ranked by urgency', href: '/reports/reorder-suggestions', plan: 'GROWTH' },
      { label: 'Income Statement', desc: 'Revenue minus costs for any period', href: '/reports/income-statement', plan: 'GROWTH' },
      { label: 'Cashflow', desc: 'Cash movements and payment method split', href: '/reports/cashflow', plan: 'GROWTH' },
    );
  }

  if (features.ownerIntelligence) {
    deeperLinks.push(
      { label: 'Owner Intelligence', desc: 'Executive brief — health score, leakage watch, activity', href: '/reports/owner', plan: 'PRO' },
      { label: 'Cashflow Forecast', desc: '14-day money pulse and low-balance alerts', href: '/reports/cashflow-forecast', plan: 'PRO' },
    );
  }

  deeperLinks.push(
    { label: 'Exports', desc: 'Download transactions, stock, and financial data', href: '/reports/exports' },
    { label: 'Cash Drawer', desc: 'Till balance and reconciliation history', href: '/reports/cash-drawer' },
  );

  const fetchedAt = now.toISOString();

  return (
    <div className="space-y-6 pb-4">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="inline-flex rounded-full border border-blue-100 bg-blue-50/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-primary">
            Operations
          </div>
          <h1 className="mt-2 text-2xl font-display font-bold tracking-tight text-ink sm:text-3xl">
            Operations Today
          </h1>
          <p className="mt-1 text-sm text-muted">
            {business.name} · {user.role === 'OWNER' ? 'Owner view' : 'Manager view'} · {store?.name ?? 'Main branch'}
          </p>
        </div>
        <RefreshIndicator fetchedAt={fetchedAt} autoRefreshMs={60_000} />
      </div>

      {/* ── Layer 1: Posture ────────────────────────────────────────── */}
      <PostureStrip kpis={kpis} currency={currency} />

      {/* ── Layer 2: Attention Needed ───────────────────────────────── */}
      <section>
        <LayerHeader
          eyebrow="Attention needed"
          title="Issues requiring action now"
        />
        {attentionItems.length === 0 ? (
          <div className="mt-3 flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 px-5 py-4">
            <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              <CheckIcon className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-semibold text-emerald-800">No active operational issues</p>
              <p className="text-xs text-emerald-700/80">Sales, stock, debtors, cash, and control signals are within normal thresholds.</p>
            </div>
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            {attentionItems.map((item) => (
              <AttentionCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </section>

      {/* ── Layer 3: Next Actions ────────────────────────────────────── */}
      <section>
        <LayerHeader
          eyebrow="Next actions"
          title="What to do right now"
        />
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {nextActions.slice(0, 6).map((action) => (
            <Link
              key={action.id}
              href={action.href}
              className={`flex items-start justify-between gap-3 rounded-2xl border p-4 transition-transform hover:-translate-y-0.5 ${
                action.primary
                  ? 'border-accent bg-accent text-white shadow-floating hover:bg-accent/90'
                  : 'border-slate-200/80 bg-white/95 shadow-card hover:border-primary/25'
              }`}
            >
              <div className="min-w-0">
                <p className={`text-sm font-semibold ${action.primary ? 'text-white' : 'text-ink'}`}>
                  {action.label}
                </p>
                <p className={`mt-0.5 text-xs ${action.primary ? 'text-white/70' : 'text-muted'}`}>
                  {action.detail}
                </p>
              </div>
              <ChevronRightIcon className={`mt-0.5 h-4 w-4 flex-shrink-0 ${action.primary ? 'text-white/70' : 'text-primary'}`} />
            </Link>
          ))}
        </div>
      </section>

      {/* ── Layer 4: Deeper Analysis ─────────────────────────────────── */}
      <section>
        <LayerHeader
          eyebrow="Deeper analysis"
          title="Trends, reports, and supporting detail"
        />
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {deeperLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="flex items-start justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-card transition-transform hover:-translate-y-0.5 hover:border-primary/25"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-ink">{link.label}</p>
                  {link.plan && (
                    <span className="rounded-full border border-primary/20 bg-blue-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">
                      {link.plan}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs leading-relaxed text-muted">{link.desc}</p>
              </div>
              <ChevronRightIcon className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

/* ─── Posture strip ──────────────────────────────────────────────────── */

function PostureStrip({ kpis, currency }: {
  kpis: Awaited<ReturnType<typeof import('@/lib/reports/today-kpis').getTodayKPIs>> | null;
  currency: string;
}) {
  const metrics = [
    {
      label: "Today's sales",
      value: kpis ? formatMoney(kpis.totalSalesPence, currency) : '—',
      sub: kpis ? `${kpis.txCount} transaction${kpis.txCount === 1 ? '' : 's'}` : 'No data',
      tone: 'neutral' as const,
    },
    {
      label: 'Gross margin',
      value: kpis ? `${kpis.gpPercent.toFixed(1)}%` : '—',
      sub: kpis ? formatMoney(kpis.grossMarginPence, currency) : 'No cost data',
      tone: kpis && kpis.gpPercent < 10 ? 'danger' : kpis && kpis.gpPercent < 20 ? 'warning' : 'ok' as const,
    },
    {
      label: 'Liquid assets',
      value: kpis ? formatMoney(kpis.cashOnHandEstimatePence, currency) : '—',
      sub: 'Cash + MoMo/bank balance',
      tone: kpis && kpis.cashOnHandEstimatePence < 0 ? 'danger' : 'ok' as const,
    },
    {
      label: 'Outstanding debtors',
      value: kpis ? formatMoney(kpis.outstandingARPence, currency) : '—',
      sub: kpis && kpis.arOver60Pence > 0 ? `${formatMoney(kpis.arOver60Pence, currency)} overdue` : 'No overdue',
      tone: kpis && kpis.arOver60Pence > 0 ? 'warning' : 'ok' as const,
    },
    {
      label: 'Open issues',
      value: kpis
        ? String(
            (kpis.stockoutImminentCount > 0 ? 1 : 0) +
            (kpis.arOver60Pence > 0 ? 1 : 0) +
            (kpis.cashVarianceTotalPence > 0 ? 1 : 0) +
            (kpis.momoPendingCount > 0 ? 1 : 0) +
            (kpis.negativeMarginProductCount > 0 ? 1 : 0),
          )
        : '—',
      sub: 'Requiring attention',
      tone: 'neutral' as const,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {metrics.map((m) => {
        const toneClass =
          m.tone === 'danger'
            ? 'border-red-100 bg-gradient-to-br from-red-50 via-white to-red-50/50'
            : m.tone === 'warning'
            ? 'border-amber-100 bg-gradient-to-br from-amber-50 via-white to-amber-50/50'
            : m.tone === 'ok'
            ? 'border-emerald-100/70 bg-white/95'
            : 'border-slate-200/80 bg-white/95';
        return (
          <div key={m.label} className={`rounded-2xl border p-4 shadow-card ${toneClass}`}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted">{m.label}</p>
            <p className="mt-2 text-2xl font-display font-bold tracking-tight text-ink tabular-nums">{m.value}</p>
            <p className="mt-1 text-xs text-slate-500">{m.sub}</p>
          </div>
        );
      })}
    </div>
  );
}

/* ─── Helpers ────────────────────────────────────────────────────────── */

function LayerHeader({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="inline-flex rounded-full border border-blue-100 bg-blue-50/80 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">
        {eyebrow}
      </span>
      <span className="text-base font-display font-semibold text-ink">{title}</span>
    </div>
  );
}

function AttentionCard({ item }: { item: AttentionItem }) {
  const styles =
    item.severity === 'critical'
      ? { shell: 'border-red-200 bg-red-50/70', dot: 'bg-red-600', badge: 'border-red-200 bg-red-100 text-red-700' }
      : item.severity === 'warning'
      ? { shell: 'border-amber-200 bg-amber-50/70', dot: 'bg-amber-500', badge: 'border-amber-200 bg-amber-100 text-amber-700' }
      : { shell: 'border-blue-200 bg-blue-50/70', dot: 'bg-blue-500', badge: 'border-blue-200 bg-blue-100 text-blue-700' };

  return (
    <div className={`rounded-2xl border p-4 sm:p-5 ${styles.shell}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className={`mt-1.5 h-2.5 w-2.5 flex-shrink-0 rounded-full ${styles.dot}`} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-ink">{item.title}</p>
              <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] ${styles.badge}`}>
                {item.severity}
              </span>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-slate-600">{item.detail}</p>
          </div>
        </div>
        <Link
          href={item.href}
          className="btn-primary w-full flex-shrink-0 justify-center text-sm sm:w-auto"
        >
          {item.cta}
        </Link>
      </div>
    </div>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
    </svg>
  );
}

function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m9 6 6 6-6 6" />
    </svg>
  );
}
