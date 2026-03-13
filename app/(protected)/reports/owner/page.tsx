import type { ReactNode } from 'react';
import { requireBusiness } from '@/lib/auth';
import { getOwnerDashboardSnapshot, type ActivityItem, type AttentionItem, type BusinessHealthCard, type LeakageMetric, type InventoryRiskRow } from '@/lib/reports/owner-dashboard';
import type { PriorityAction } from '@/lib/owner-intel';
import PageHeader from '@/components/PageHeader';
import Link from 'next/link';
import { formatMoney } from '@/lib/format';
import RefreshIndicator from '@/components/RefreshIndicator';
import OwnerStatusStrip from '@/components/owner/OwnerStatusStrip';
import { getBusinessStores } from '@/lib/services/stores';

export const dynamic = 'force-dynamic';

const quickLinks = [
  { label: 'Reorder queue', href: '/reports/reorder-suggestions', desc: 'Raise purchase orders before shelves go empty' },
  { label: 'Cashflow forecast', href: '/reports/cashflow-forecast', desc: 'See short-term cash pressure and low-balance dates' },
  { label: 'Risk monitor', href: '/reports/risk-monitor', desc: 'Follow up overrides, variances, and control alerts' },
  { label: 'Weekly digest', href: '/reports/weekly-digest', desc: 'Review the last 7 trading days in one brief' },
];

/* ─── Page ───────────────────────────────────────────────────────────── */

export default async function OwnerIntelligencePage() {
  const { business, user } = await requireBusiness(['OWNER', 'MANAGER']);

  const [{ stores }, snapshot] = await Promise.all([
    getBusinessStores(business.id),
    getOwnerDashboardSnapshot(business.id, business.currency),
  ]);

  const currency = business.currency;
  const scopeLabel = stores.length <= 1
    ? `Branch: ${stores[0]?.name ?? 'Main branch'}`
    : `Scope: All ${stores.length} branches`;

  return (
    <div className="space-y-5 pb-2 sm:space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <PageHeader
          title="Owner Dashboard"
          subtitle={`Live operating brief for ${business.name} — generated ${new Date(snapshot.generatedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`}
          description="See business health, cash pressure, stock risk, debtor follow-up, and trading activity in one serious retail control center."
        />
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-shrink-0 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
          <RefreshIndicator fetchedAt={snapshot.generatedAt} autoRefreshMs={60_000} />
          <a
            href="/reports/owner/export?format=html"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary justify-center text-sm"
          >
            Export Brief
          </a>
        </div>
      </div>

      <OwnerStatusStrip
        businessName={business.name}
        scopeLabel={scopeLabel}
        roleLabel={user.role}
        fetchedAt={snapshot.generatedAt}
      />

      <LayerShell
        eyebrow="Business Health Overview"
        title="Read the business in one glance"
        description="Today’s trading position, gross profit discipline, till cash, debtors, supplier obligations, and shelf pressure — tuned for supermarket operations, not vanity analytics."
      >
        <div className="grid items-stretch gap-4 lg:grid-cols-[1.25fr_3fr]">
          <div className="min-w-0">
            <HealthOverviewCard
              score={snapshot.brief.healthScore.score}
              grade={snapshot.brief.healthScore.grade}
              topDrivers={snapshot.brief.healthScore.topDrivers}
              href={snapshot.brief.healthScore.scoreUrl}
            />
          </div>
          <div className="grid auto-rows-fr gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 stagger-children">
            {snapshot.overviewCards.map((card) => (
              <MetricCard key={card.id} card={card} currency={currency} />
            ))}
          </div>
        </div>
      </LayerShell>

      <LayerShell
        eyebrow="Attention Needed Today"
        title="Act on the risks that can hurt cash, stock, or control"
        description="The highest-priority problems surface first so the owner knows what needs action right now."
      >
        <div className="grid items-stretch gap-6 lg:grid-cols-[minmax(0,1.7fr)_minmax(340px,1fr)] xl:grid-cols-[minmax(0,1.75fr)_minmax(380px,1fr)]">
          <section className="card min-w-0 overflow-hidden border-red-100/90 bg-white/95 shadow-raised">
            <div className="border-b border-red-100 bg-gradient-to-r from-red-50 via-white to-white px-4 py-3.5 sm:px-6 sm:py-5">
              <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <h2 className="text-base font-semibold text-ink sm:text-lg">Attention Needed Today</h2>
                  <p className="mt-1 text-sm text-muted">Critical issues, warnings, and monitors ranked for the owner.</p>
                </div>
                <span className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-red-700 sm:self-auto">
                  {snapshot.attentionItems.length} live item{snapshot.attentionItems.length === 1 ? '' : 's'}
                </span>
              </div>
            </div>

            {snapshot.attentionItems.length === 0 ? (
              <div className="flex min-h-[240px] flex-col items-center justify-center px-4 py-8 text-center sm:min-h-[320px] sm:px-6 sm:py-10">
                <div className="rounded-full bg-emerald-50 p-4 text-emerald-600">
                  <CheckCircleIcon className="h-8 w-8" />
                </div>
                <p className="mt-4 text-base font-semibold text-ink">No operational issues are shouting for attention.</p>
                <p className="mt-1 max-w-xl text-sm text-muted">Sales, stock, debtors, supplier dues, and control signals are within normal thresholds right now.</p>
              </div>
            ) : (
              <div className="stagger-children space-y-3 px-3.5 py-3.5 sm:px-6 sm:py-5">
                {snapshot.attentionItems.map((item) => (
                  <AttentionRow key={item.id} item={item} />
                ))}
              </div>
            )}
          </section>

          <div className="flex min-w-0 flex-col gap-6 lg:self-start">
            <PriorityActionsPanel actions={snapshot.brief.priorityActions} />
            <MoneyPulsePanel snapshot={snapshot} currency={currency} />
          </div>
        </div>
      </LayerShell>

      <LayerShell
        eyebrow="Operational Insights"
        title="Watch shelf pressure, leakage, and live operational movement"
        description="This layer turns TillFlow into a control surface: inventory risk, money leakage, and the activity stream that tells you what happened across the store."
      >
        <div className="space-y-6">
          <div className="grid items-stretch gap-6 2xl:grid-cols-[1.25fr_1.1fr_1.65fr] xl:grid-cols-2">
            <div className="min-w-0">
              <LeakageWatchPanel metrics={snapshot.leakageMetrics} currency={currency} />
            </div>
            <div className="min-w-0">
              <InventoryRiskPanel inventory={snapshot.inventoryRisk} />
            </div>
            <div className="hidden min-w-0 2xl:block">
              <RecentActivityPanel items={snapshot.recentActivity} />
            </div>
          </div>

          <div className="min-w-0 2xl:hidden">
            <RecentActivityPanel items={snapshot.recentActivity} />
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {quickLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="card animate-fade-in-up flex h-full items-start justify-between gap-3 rounded-[1.35rem] border border-slate-200/80 bg-white/95 p-4 transition-transform hover:-translate-y-0.5"
            >
              <div>
                <p className="text-sm font-semibold text-ink">{link.label}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted">{link.desc}</p>
              </div>
              <ChevronRightIcon className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
            </Link>
          ))}
        </div>
      </LayerShell>

      <div className="rounded-[1.35rem] border border-slate-200/90 bg-white/90 px-4 py-4 shadow-card backdrop-blur-sm sm:px-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-ink">Owner daily brief</p>
            <p className="text-xs text-muted">Save a point-in-time snapshot for reviews, meetings, or end-of-day control checks.</p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <a href="/reports/owner/export?format=html" target="_blank" rel="noopener noreferrer" className="btn-secondary justify-center text-sm">
              Print / Save PDF
            </a>
            <a href="/reports/owner/export?format=csv" className="btn-secondary justify-center text-sm">
              Export CSV
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

function LayerShell({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children: ReactNode }) {
  return (
    <section className="min-w-0 rounded-[1.6rem] border border-slate-200/80 bg-white/70 px-3.5 py-3.5 shadow-card backdrop-blur-sm sm:rounded-[1.8rem] sm:px-5 sm:py-5 md:px-6 md:py-6">
      <div className="mb-5 sm:mb-6">
        <div className="inline-flex rounded-full border border-blue-100 bg-blue-50/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-primary">
          {eyebrow}
        </div>
        <h2 className="mt-3 text-lg font-display font-bold tracking-tight text-ink sm:text-xl">{title}</h2>
        <p className="mt-1.5 max-w-4xl text-[13px] leading-relaxed text-muted sm:text-sm">{description}</p>
      </div>
      {children}
    </section>
  );
}

function HealthOverviewCard({ score, grade, topDrivers, href }: { score: number; grade: 'GREEN' | 'AMBER' | 'RED'; topDrivers: string[]; href: string }) {
  const gradeCopy = grade === 'GREEN' ? 'Healthy' : grade === 'AMBER' ? 'Needs attention' : 'Critical';
  const gradeTone = grade === 'GREEN' ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : grade === 'AMBER' ? 'text-amber-700 bg-amber-50 border-amber-200' : 'text-red-700 bg-red-50 border-red-200';

  return (
    <section className="card animate-fade-in-up flex min-w-0 h-full flex-col overflow-hidden rounded-[1.35rem] border border-slate-200/80 bg-gradient-to-br from-slate-950 via-blue-950 to-blue-900 p-4 text-white shadow-floating sm:rounded-[1.5rem] sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-blue-100/80">Business health score</p>
          <div className="mt-3 flex items-end gap-2">
            <span className="text-[2.75rem] font-display font-bold leading-none tabular-nums sm:text-5xl">{score}</span>
            <span className="pb-1 text-sm font-semibold text-blue-100/80">/100</span>
          </div>
        </div>
        <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] ${gradeTone}`}>
          {gradeCopy}
        </span>
      </div>

      <div className="mt-5 flex-1 space-y-2">
        {topDrivers.slice(0, 3).map((driver, index) => (
          <div key={`${driver}-${index}`} className="flex items-start gap-3 text-[13px] text-blue-50/90 sm:text-sm">
            <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-emerald-400" />
            <span>{driver}</span>
          </div>
        ))}
      </div>

      <Link href={href} className="btn-secondary mt-6 w-full justify-center border-white/20 bg-white/10 text-white hover:bg-white/15">
        Open full health report
      </Link>
    </section>
  );
}

function MetricCard({ card, currency }: { card: BusinessHealthCard; currency: string }) {
  const value = card.kind === 'money' ? formatMoney(card.value, currency) : card.value.toLocaleString('en-GB');
  const toneClass = card.tone === 'danger'
    ? 'border-red-100 bg-gradient-to-br from-red-50 via-white to-red-50/70'
    : card.tone === 'warning'
    ? 'border-amber-100 bg-gradient-to-br from-amber-50 via-white to-amber-50/70'
    : card.tone === 'success'
    ? 'border-emerald-100 bg-gradient-to-br from-emerald-50 via-white to-emerald-50/70'
    : card.tone === 'primary'
    ? 'border-blue-100 bg-gradient-to-br from-blue-50 via-white to-blue-50/70'
    : 'border-slate-200 bg-white/95';
  const trendClass = card.trend.tone === 'negative'
    ? 'border-red-200 bg-red-50 text-red-700'
    : card.trend.tone === 'positive'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : 'border-slate-200 bg-slate-50 text-slate-600';

  return (
    <Link href={card.href} className={`animate-fade-in-up flex min-w-0 h-full flex-col overflow-hidden rounded-[1.35rem] border p-4 shadow-card transition-transform hover:-translate-y-0.5 sm:p-5 ${toneClass}`}>
      <div className="flex min-w-0 flex-col gap-3">
        <p className="min-w-0 text-[11px] font-semibold uppercase tracking-[0.24em] text-muted">{card.label}</p>
        <div className="flex min-w-0 justify-start sm:justify-end">
          <span className={`inline-flex max-w-full items-start gap-1 rounded-full border px-2.5 py-1 text-left text-[10px] font-semibold uppercase tracking-[0.18em] leading-[1.15] whitespace-normal sm:max-w-[10.5rem] sm:text-right ${trendClass}`}>
            <TrendIcon direction={card.trend.direction} />
            {card.trend.label}
          </span>
        </div>
      </div>
      <p className="mt-3 pr-1 text-[1.72rem] font-display font-bold leading-none tracking-tight text-ink tabular-nums sm:text-[1.95rem]">{value}</p>
      <p className="mt-4 flex-1 text-sm leading-relaxed text-slate-600 sm:min-h-[3.5rem]">{card.subtitle}</p>
    </Link>
  );
}

function AttentionRow({ item }: { item: AttentionItem }) {
  const styles = item.severity === 'critical'
    ? {
        shell: 'border-red-200 bg-red-50/70',
        badge: 'border-red-200 bg-red-100 text-red-700',
        dot: 'bg-red-600',
      }
    : item.severity === 'warning'
    ? {
        shell: 'border-amber-200 bg-amber-50/70',
        badge: 'border-amber-200 bg-amber-100 text-amber-700',
        dot: 'bg-amber-500',
      }
    : {
        shell: 'border-blue-200 bg-blue-50/70',
        badge: 'border-blue-200 bg-blue-100 text-blue-700',
        dot: 'bg-blue-600',
      };

  return (
    <div className={`animate-fade-in-up rounded-[1.15rem] border p-3.5 sm:rounded-[1.25rem] sm:p-5 ${styles.shell}`}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 gap-3">
          <span className={`mt-2 h-2.5 w-2.5 flex-shrink-0 rounded-full ${styles.dot}`} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[15px] font-semibold leading-snug text-ink">{item.title}</p>
              <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${styles.badge}`}>
                {item.severity}
              </span>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">{item.whyItMatters}</p>
          </div>
        </div>
        <Link href={item.href} className="btn-primary w-full justify-center self-start text-sm sm:w-auto sm:flex-shrink-0">
          {item.ctaLabel}
        </Link>
      </div>
    </div>
  );
}

function PriorityActionsPanel({ actions }: { actions: PriorityAction[] }) {
  return (
    <section className="card min-w-0 overflow-hidden rounded-[1.35rem] border border-slate-200/80 bg-white/95 shadow-card sm:rounded-[1.5rem]">
      <div className="border-b border-slate-200/80 px-4 py-3.5 sm:px-6 sm:py-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-ink sm:text-lg">Priority actions</h2>
            <p className="mt-1 max-w-md text-sm leading-relaxed text-muted">The fastest high-value moves the owner can make from the current report signals.</p>
          </div>
          <span className="mt-0.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-600">
            {actions.length} action{actions.length === 1 ? '' : 's'}
          </span>
        </div>
      </div>

      <div className="space-y-3 overflow-y-auto px-3.5 py-3.5 sm:px-6 sm:py-5 lg:max-h-[34rem] lg:pr-4">
        {actions.length === 0 ? (
          <div className="rounded-[1rem] border border-emerald-200 bg-emerald-50/70 p-3.5 text-sm leading-relaxed text-emerald-800 sm:rounded-[1.1rem] sm:p-4">
            No urgent owner actions are queued right now. That’s the good kind of quiet.
          </div>
        ) : (
          actions.map((action) => {
            const styles = action.severity === 'critical'
              ? {
                  shell: 'border-red-200 bg-red-50/70',
                  badge: 'border-red-200 bg-red-100 text-red-700',
                }
              : action.severity === 'warn'
              ? {
                  shell: 'border-amber-200 bg-amber-50/70',
                  badge: 'border-amber-200 bg-amber-100 text-amber-700',
                }
              : {
                  shell: 'border-blue-200 bg-blue-50/70',
                  badge: 'border-blue-200 bg-blue-100 text-blue-700',
                };

            return (
              <div key={action.id} className={`rounded-[1rem] border p-3.5 sm:rounded-[1.1rem] sm:p-4 ${styles.shell}`}>
                <div className="flex flex-col gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-start gap-2">
                      <p className="text-sm font-semibold leading-snug text-ink sm:text-[15px]">{action.title}</p>
                      <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${styles.badge}`}>
                        {action.severity === 'critical' ? 'Critical' : action.severity === 'warn' ? 'Watch' : 'Info'}
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-slate-600">{action.why}</p>
                    <p className="mt-2 text-sm font-medium text-ink">Recommended next step: {action.recommendation}</p>
                  </div>
                  <Link href={action.href} className="btn-secondary w-full justify-center text-sm sm:w-auto sm:self-start">
                    Open
                  </Link>
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}

function MoneyPulsePanel({ snapshot, currency }: { snapshot: Awaited<ReturnType<typeof getOwnerDashboardSnapshot>>; currency: string }) {
  const seriesMax = Math.max(...snapshot.moneyPulseSeries.map((day) => Math.abs(day.projectedBalancePence)), 1);

  return (
    <section className="card flex min-w-0 h-full flex-col overflow-hidden rounded-[1.35rem] border border-blue-100/90 bg-gradient-to-br from-blue-950 via-blue-900 to-slate-950 text-white shadow-floating sm:rounded-[1.5rem]">
      <div className="border-b border-white/10 px-4 py-3.5 sm:px-6 sm:py-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold sm:text-lg">Money Pulse</h2>
            <p className="mt-1 text-sm text-blue-100/80">Short-term visibility into cash pressure, collections, and supplier obligations.</p>
          </div>
          <Link href="/reports/cashflow-forecast" className="inline-flex min-h-10 items-center rounded-full border border-white/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-blue-100/80 transition-colors hover:border-white/20 hover:text-white">
            Full forecast
          </Link>
        </div>
      </div>

      <div className="flex-1 space-y-4 px-4 py-3.5 sm:px-6 sm:py-5">
        <MoneyPulseRow label="Cash balance today" value={formatMoney(snapshot.brief.moneyPulse.cashTodayPence, currency)} tone="positive" />
        <MoneyPulseRow label="Receivables due (7d)" value={formatMoney(snapshot.brief.moneyPulse.arDue7DaysPence, currency)} tone="positive" />
        <MoneyPulseRow label="Payables due (7d)" value={formatMoney(snapshot.brief.moneyPulse.apDue7DaysPence, currency)} tone="warning" />
        <MoneyPulseRow
          label="Lowest forecast balance (14d)"
          value={`${formatMoney(snapshot.brief.moneyPulse.forecastLowestPence, currency)}${snapshot.brief.moneyPulse.daysUntilNegative !== null ? ` in ${snapshot.brief.moneyPulse.daysUntilNegative} day${snapshot.brief.moneyPulse.daysUntilNegative === 1 ? '' : 's'}` : ''}`}
          tone={snapshot.brief.moneyPulse.forecastLowestPence < 0 ? 'danger' : 'positive'}
        />

        <div className="rounded-[1rem] border border-white/10 bg-white/5 p-3.5 sm:rounded-[1.1rem] sm:p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-100/80">14-day pulse</p>
            <p className="text-[11px] text-blue-100/70">Projected balance</p>
          </div>
          <div className="flex h-24 items-end gap-2">
            {snapshot.moneyPulseSeries.map((day) => {
              const height = Math.max((Math.abs(day.projectedBalancePence) / seriesMax) * 100, 8);
              const isNegative = day.projectedBalancePence < 0;
              return (
                <div key={day.date} className="flex flex-1 flex-col items-center gap-2">
                  <div
                    className={`w-full rounded-t-md opacity-90 transition-transform duration-300 ease-out hover:-translate-y-0.5 ${isNegative ? 'bg-red-400' : 'bg-emerald-400'}`}
                    style={{ height: `${height}%` }}
                    title={`${day.date}: ${formatMoney(day.projectedBalancePence, currency)}`}
                  />
                  <span className="text-[10px] tabular-nums text-blue-100/70">{day.date.slice(5)}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

function LeakageWatchPanel({ metrics, currency }: { metrics: LeakageMetric[]; currency: string }) {
  return (
    <PanelShell title="Leakage watch" description="Surface the places where gross profit or cash control can leak quietly.">
      <div className="space-y-3 stagger-children">
        {metrics.map((metric) => {
          const value = metric.kind === 'money' ? formatMoney(metric.value, currency) : metric.value.toLocaleString('en-GB');
          const toneClass = metric.tone === 'danger'
            ? 'text-red-700 bg-red-50 border-red-200'
            : metric.tone === 'warning'
            ? 'text-amber-700 bg-amber-50 border-amber-200'
            : metric.tone === 'success'
            ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
            : 'text-slate-700 bg-slate-50 border-slate-200';

          return (
            <Link key={metric.id} href={metric.href} className="animate-fade-in-up flex min-w-0 flex-col overflow-hidden rounded-[1.1rem] border border-slate-200/80 bg-slate-50/80 p-4 hover:border-primary/25 hover:bg-white">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted">{metric.label}</p>
                  <p className="mt-3 text-2xl font-display font-bold tracking-tight text-ink tabular-nums">{value}</p>
                  <p className="mt-2 text-sm text-slate-600">{metric.helper}</p>
                </div>
                <span className={`flex-shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${toneClass}`}>
                  {metric.tone === 'danger' ? 'Critical' : metric.tone === 'warning' ? 'Watch' : metric.tone === 'success' ? 'Healthy' : 'Stable'}
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </PanelShell>
  );
}

function InventoryRiskPanel({ inventory }: { inventory: Awaited<ReturnType<typeof getOwnerDashboardSnapshot>>['inventoryRisk'] }) {
  return (
    <PanelShell
      title="Inventory risk"
      description="Low stock, critical stock, and stockouts ranked for quick shelf action."
      action={<Link href={inventory.reorderHref} className="text-xs font-semibold uppercase tracking-[0.22em] text-primary hover:underline">Open reorder queue</Link>}
    >
      <div className="mb-4 flex flex-wrap gap-2">
        <InventoryChip label="Low stock" value={inventory.lowStockCount} tone="warning" />
        <InventoryChip label="Critical" value={inventory.criticalCount} tone="danger" />
        <InventoryChip label="Stockouts" value={inventory.stockoutCount} tone="danger" />
      </div>

      <div className="space-y-3 stagger-children">
        {inventory.rows.length === 0 ? (
          <div className="rounded-[1.1rem] border border-emerald-200 bg-emerald-50/70 p-4 text-sm text-emerald-800">
            Shelf levels are healthy across the tracked items right now.
          </div>
        ) : (
          inventory.rows.map((row) => (
            <div key={row.id} className="animate-fade-in-up min-w-0 overflow-hidden rounded-[1.1rem] border border-slate-200/80 bg-slate-50/70 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-ink">{row.name}</p>
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${inventoryStateClass(row.state)}`}>
                      {row.state === 'stockout' ? 'Stockout' : row.state === 'critical' ? 'Critical' : 'Low stock'}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                    <span>Current: <strong className="font-semibold text-ink">{row.currentQtyLabel}</strong></span>
                    <span>Reorder threshold: <strong className="font-semibold text-ink">{row.reorderThresholdLabel}</strong></span>
                    {row.reorderQtyBase > 0 ? <span>Suggested reorder: <strong className="font-semibold text-ink">{row.reorderQtyBase}</strong></span> : null}
                    {row.supplierName ? <span>Supplier: <strong className="font-semibold text-ink">{row.supplierName}</strong></span> : null}
                  </div>
                </div>
                <Link href={row.href} className="btn-secondary w-full justify-center self-start text-sm sm:w-auto sm:flex-shrink-0">
                  {row.ctaLabel}
                </Link>
              </div>
            </div>
          ))
        )}
      </div>
    </PanelShell>
  );
}

function RecentActivityPanel({ items }: { items: ActivityItem[] }) {
  return (
    <PanelShell title="Recent activity" description="Important operational events across sales, tills, stock, suppliers, customers, and MoMo.">
      <div className="stagger-children space-y-3">
        {items.length === 0 ? (
          <div className="rounded-[1.1rem] border border-slate-200 bg-slate-50/80 p-4 text-sm text-slate-600">
            Recent activity will appear here as TillFlow records store events.
          </div>
        ) : (
          items.map((item) => (
            <Link key={item.id} href={item.href} className="animate-fade-in-up flex items-start gap-3 rounded-[1.1rem] border border-slate-200/80 bg-slate-50/70 p-4 transition-transform hover:-translate-y-0.5 hover:bg-white">
              <span className={`mt-0.5 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl ${activityToneClass(item.tone)}`}>
                <ActivityIcon kind={item.kind} className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink">{item.text}</p>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                  <span>{formatTimestamp(item.timestamp)}</span>
                  {item.actor ? <span>Actor: {item.actor}</span> : null}
                </div>
              </div>
            </Link>
          ))
        )}
      </div>
    </PanelShell>
  );
}

function PanelShell({ title, description, action, children }: { title: string; description: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="card flex min-w-0 h-full flex-col overflow-hidden rounded-[1.35rem] border border-slate-200/80 bg-white/95 p-4 shadow-card sm:rounded-[1.5rem] sm:p-6">
      <div className="mb-4 flex flex-col gap-3 sm:mb-5 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-ink sm:text-lg">{title}</h3>
          <p className="mt-1 text-sm leading-relaxed text-muted">{description}</p>
        </div>
        {action ? <div className="w-full sm:w-auto">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}

function MoneyPulseRow({ label, value, tone }: { label: string; value: string; tone: 'positive' | 'warning' | 'danger' }) {
  const valueClass = tone === 'danger' ? 'text-red-300' : tone === 'warning' ? 'text-amber-200' : 'text-emerald-200';

  return (
    <div className="flex flex-col gap-1 border-b border-white/10 pb-3 last:border-b-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
      <span className="text-sm text-blue-100/80">{label}</span>
      <span className={`text-sm font-semibold tabular-nums ${valueClass}`}>{value}</span>
    </div>
  );
}

function InventoryChip({ label, value, tone }: { label: string; value: number; tone: 'warning' | 'danger' }) {
  return (
    <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] ${tone === 'danger' ? 'border-red-200 bg-red-50 text-red-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
      {label}
      <span className="tabular-nums">{value}</span>
    </span>
  );
}

function inventoryStateClass(state: InventoryRiskRow['state']) {
  if (state === 'stockout') return 'bg-red-100 text-red-700';
  if (state === 'critical') return 'bg-amber-100 text-amber-700';
  return 'bg-blue-100 text-blue-700';
}

function activityToneClass(tone: ActivityItem['tone']) {
  if (tone === 'danger') return 'bg-red-100 text-red-700';
  if (tone === 'warning') return 'bg-amber-100 text-amber-700';
  if (tone === 'success') return 'bg-emerald-100 text-emerald-700';
  if (tone === 'primary') return 'bg-blue-100 text-blue-700';
  return 'bg-slate-100 text-slate-600';
}

function formatTimestamp(timestamp: string) {
  const date = new Date(timestamp);
  return date.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function TrendIcon({ direction }: { direction: BusinessHealthCard['trend']['direction'] }) {
  if (direction === 'flat') return <MinusIcon className="h-3 w-3" />;
  return <ArrowUpIcon className={`h-3 w-3 ${direction === 'down' ? 'rotate-180' : ''}`} />;
}

function ActivityIcon({ kind, className }: { kind: ActivityItem['kind']; className?: string }) {
  if (kind === 'sale') return <ReceiptIcon className={className} />;
  if (kind === 'supplier-payment') return <WalletIcon className={className} />;
  if (kind === 'stock-adjustment') return <BoxesIcon className={className} />;
  if (kind === 'discount-override') return <TagIcon className={className} />;
  if (kind === 'till-variance') return <AlertTriangleIcon className={className} />;
  if (kind === 'purchase-received') return <TruckIcon className={className} />;
  if (kind === 'customer-added') return <UserPlusIcon className={className} />;
  return <PhoneCheckIcon className={className} />;
}

function iconProps(className?: string) {
  return { className, fill: 'none', viewBox: '0 0 24 24', stroke: 'currentColor', strokeWidth: 1.8 };
}

function ArrowUpIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 19V5m0 0-5 5m5-5 5 5" />
    </svg>
  );
}

function MinusIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" />
    </svg>
  );
}

function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m9 6 6 6-6 6" />
    </svg>
  );
}

function CheckCircleIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    </svg>
  );
}

function ReceiptIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Zm3 5h6m-6 4h6m-6 4h4" />
    </svg>
  );
}

function WalletIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.625H3.75A2.25 2.25 0 0 1 6 6.375h12a2.25 2.25 0 0 1 2.25 2.25Zm0 0v6.75A2.25 2.25 0 0 1 18 17.625H6a2.25 2.25 0 0 1-2.25-2.25v-6.75m16.5 0h-3.375a1.125 1.125 0 1 0 0 2.25h3.375" />
    </svg>
  );
}

function BoxesIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m3.75 7.5 8.25-3 8.25 3m-16.5 0v9l8.25 3m-8.25-12 8.25 3m8.25-3v9l-8.25 3m0-9v9" />
    </svg>
  );
}

function TagIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m9 5.25 8.625 8.625a1.5 1.5 0 0 1 0 2.121l-1.629 1.629a1.5 1.5 0 0 1-2.121 0L5.25 9V5.25H9Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 7.5h.008v.008H7.5V7.5Z" />
    </svg>
  );
}

function AlertTriangleIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m11.25 3.75-8.25 14.25a1.5 1.5 0 0 0 1.299 2.25h16.402A1.5 1.5 0 0 0 22 18l-8.25-14.25a1.5 1.5 0 0 0-2.598 0ZM12 9v4.5m0 3h.008v.008H12V16.5Z" />
    </svg>
  );
}

function TruckIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25H6.75A2.25 2.25 0 0 1 4.5 15V6.75A2.25 2.25 0 0 1 6.75 4.5h7.5A2.25 2.25 0 0 1 16.5 6.75V8.25h1.879a2.25 2.25 0 0 1 1.768.86l1.103 1.379a2.25 2.25 0 0 1 .5 1.406V15A2.25 2.25 0 0 1 19.5 17.25H18m-9 0a1.5 1.5 0 1 0 3 0m-3 0a1.5 1.5 0 1 1 3 0m6 0a1.5 1.5 0 1 0 3 0m-3 0a1.5 1.5 0 1 1 3 0" />
    </svg>
  );
}

function UserPlusIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M18 7.5v6m3-3h-6m-4.5-1.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm0 1.5c-3.107 0-5.625 2.015-5.625 4.5v.375h8.721" />
    </svg>
  );
}

function PhoneCheckIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 2.25h12A2.25 2.25 0 0 1 20.25 4.5v15A2.25 2.25 0 0 1 18 21.75H6A2.25 2.25 0 0 1 3.75 19.5v-15A2.25 2.25 0 0 1 6 2.25Zm3.75 14.25 1.875 1.875 3.75-3.75" />
    </svg>
  );
}
