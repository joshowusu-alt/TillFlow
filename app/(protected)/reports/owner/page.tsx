import { Suspense } from 'react';
import { requireBusiness } from '@/lib/auth';
import { getOwnerBrief } from '@/lib/owner-intel';
import { getTodayKPIs } from '@/lib/reports/today-kpis';
import { getCashflowForecast } from '@/lib/reports/forecast';
import PageHeader from '@/components/PageHeader';
import StatCard from '@/components/StatCard';
import Link from 'next/link';
import { formatMoney } from '@/lib/format';
import RefreshIndicator from '@/components/RefreshIndicator';

export const dynamic = 'force-dynamic';

const quickLinks = [
  { label: 'Weekly Digest', href: '/reports/weekly-digest', desc: 'Last 7 days summary' },
  { label: 'Reorder', href: '/reports/reorder-suggestions', desc: 'Stock replenishment' },
  { label: 'Risk Monitor', href: '/reports/risk-monitor', desc: 'Fraud & control alerts' },
  { label: 'Cashflow', href: '/reports/cashflow', desc: 'Cash position statement' },
  { label: 'Income Statement', href: '/reports/income-statement', desc: 'Revenue & expenses' },
  { label: 'Balance Sheet', href: '/reports/balance-sheet', desc: 'Assets & liabilities' },
];

/* ─── Helpers ────────────────────────────────────────────────────────── */

function gradeColour(grade: 'GREEN' | 'AMBER' | 'RED') {
  if (grade === 'GREEN') return 'text-success';
  if (grade === 'AMBER') return 'text-warning';
  return 'text-error';
}

function severityBadge(s: 'critical' | 'warn' | 'info') {
  if (s === 'critical')
    return 'bg-red-50 text-error border border-red-200';
  if (s === 'warn')
    return 'bg-amber-50 text-warning border border-amber-200';
  return 'bg-blue-50 text-primary border border-blue-200';
}

function severityDot(s: 'critical' | 'warn' | 'info') {
  if (s === 'critical') return 'bg-error';
  if (s === 'warn') return 'bg-warning';
  return 'bg-primary';
}

function scoreRing(score: number, grade: 'GREEN' | 'AMBER' | 'RED') {
  const r = 36;
  const c = 2 * Math.PI * r;
  const offset = c - (Math.min(score, 100) / 100) * c;
  const colour = grade === 'GREEN' ? '#059669' : grade === 'AMBER' ? '#D97706' : '#DC2626';
  return (
    <svg className="h-24 w-24 -rotate-90" viewBox="0 0 88 88">
      <circle cx="44" cy="44" r={r} fill="none" stroke="#E5E7EB" strokeWidth="6" />
      <circle
        cx="44" cy="44" r={r} fill="none"
        stroke={colour} strokeWidth="6" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={offset}
        style={{ transition: 'stroke-dashoffset 0.8s ease-out' }}
      />
    </svg>
  );
}

/* ─── Section wrappers ───────────────────────────────────────────────── */

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="card p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold text-ink">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/* ─── Page ───────────────────────────────────────────────────────────── */

export default async function OwnerIntelligencePage() {
  const { business } = await requireBusiness(['OWNER', 'MANAGER']);

  const [brief, kpis, forecast] = await Promise.all([
    getOwnerBrief(business.id, business.currency),
    getTodayKPIs(business.id),
    getCashflowForecast(business.id, 14),
  ]);
  const currency = business.currency;
  const forecastMini = forecast.days.slice(0, 7);

  const gradeLabel = { GREEN: 'Healthy', AMBER: 'Needs Attention', RED: 'Critical' };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <PageHeader
          title="Owner Intelligence"
          subtitle={`Your daily business brief — generated ${new Date(brief.generatedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`}
        />
        <div className="flex items-center gap-2 flex-shrink-0">
          <RefreshIndicator fetchedAt={brief.generatedAt} autoRefreshMs={60_000} />
          <a
            href="/reports/owner/export?format=html"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary text-sm"
          >
            Export Brief
          </a>
        </div>
      </div>

      {/* Top row: Health + Priority Actions */}
      <div className="grid gap-6 lg:grid-cols-3">

        {/* Health Score card */}
        <section className="card p-6 flex flex-col items-center text-center">
          <div className="relative inline-flex items-center justify-center mb-3">
            {scoreRing(brief.healthScore.score, brief.healthScore.grade)}
            <div className="absolute flex flex-col items-center">
              <span className={`text-2xl font-bold tabular-nums ${gradeColour(brief.healthScore.grade)}`}>
                {brief.healthScore.score}
              </span>
              <span className="text-[10px] font-medium text-muted leading-none">/100</span>
            </div>
          </div>
          <p className={`text-sm font-semibold ${gradeColour(brief.healthScore.grade)}`}>
            {gradeLabel[brief.healthScore.grade]}
          </p>
          <p className="mt-1 text-xs text-muted">Business Health Score</p>
          {brief.healthScore.topDrivers.length > 0 && (
            <ul className="mt-3 space-y-1 text-left w-full">
              {brief.healthScore.topDrivers.slice(0, 3).map((d, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-muted">
                  <span className="mt-0.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary/40" />
                  {d}
                </li>
              ))}
            </ul>
          )}
          <Link href={brief.healthScore.scoreUrl} className="btn-secondary mt-4 w-full text-xs py-1.5">
            Full Report →
          </Link>
        </section>

        {/* Priority Actions */}
        <section className="card p-6 lg:col-span-2">
          <h2 className="mb-4 text-base font-semibold text-ink">
            Priority Actions
            <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              {brief.priorityActions.length}
            </span>
          </h2>
          {brief.priorityActions.length === 0 ? (
            <div className="flex flex-col items-center py-8 text-center">
              <span className="text-3xl">✅</span>
              <p className="mt-2 text-sm font-medium text-ink">No priority issues today</p>
              <p className="text-xs text-muted">Your business metrics are within healthy ranges.</p>
            </div>
          ) : (
            <ul className="space-y-3">
              {brief.priorityActions.map((action) => (
                <li key={action.id} className="flex gap-3 rounded-lg border border-border bg-surface p-3">
                  <span className={`mt-1 h-2 w-2 flex-shrink-0 rounded-full ${severityDot(action.severity)}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-ink leading-tight">{action.title}</p>
                      <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${severityBadge(action.severity)}`}>
                        {action.severity}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted">{action.why}</p>
                    <p className="mt-1 text-xs font-medium text-ink">→ {action.recommendation}</p>
                    <Link href={action.href} className="mt-2 inline-block text-xs font-semibold text-primary hover:underline">
                      Take action &rsaquo;
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Today's KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Today's Sales"
          value={formatMoney(kpis.totalSalesPence, currency)}
          tone="accent"
          helper={`${kpis.txCount} transaction${kpis.txCount !== 1 ? 's' : ''}`}
        />
        <StatCard
          label={`Gross Profit (${kpis.gpPercent}%)`}
          value={formatMoney(kpis.grossMarginPence, currency)}
          tone={kpis.gpPercent >= 20 ? 'success' : kpis.gpPercent >= 10 ? 'warn' : 'danger'}
        />
        <StatCard
          label="Debtors (AR)"
          value={formatMoney(kpis.outstandingARPence, currency)}
          tone={kpis.arOver90Pence > 0 ? 'warn' : 'default'}
          helper={kpis.arOver90Pence > 0 ? `${formatMoney(kpis.arOver90Pence, currency)} 90+ days` : undefined}
        />
        <StatCard
          label="Payables (AP)"
          value={formatMoney(kpis.outstandingAPPence, currency)}
        />
      </div>

      {/* Data-quality warning: extremely negative GP means wrong cost prices */}
      {kpis.gpPercent < -50 && kpis.totalSalesPence > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p className="font-semibold">⚠ Gross margin looks unusual ({kpis.gpPercent}%)</p>
          <p className="mt-0.5 text-amber-700">
            A margin this negative usually means product cost prices are set much higher than selling prices —
            possibly entered in whole {currency} instead of minor units, or a per-case cost was applied to
            individual units. Go to{' '}
            <Link href="/products" className="underline font-medium">Products</Link>{' '}
            and review the <strong>cost price</strong> for your top-selling items.
          </p>
        </div>
      )}

      {/* 7-Day Cash Forecast Mini */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-ink">7-Day Cash Forecast</h3>
          <Link href="/reports/cashflow-forecast" className="text-xs text-accent hover:underline">
            Full forecast \u2192
          </Link>
        </div>
        <div className="flex items-end gap-1 h-24">
          {forecastMini.map((day) => {
            const maxVal = Math.max(
              ...forecastMini.map((d) => Math.abs(d.projectedBalancePence)),
              1
            );
            const heightPct = Math.max(
              (Math.abs(day.projectedBalancePence) / maxVal) * 100,
              4
            );
            const isNeg = day.projectedBalancePence < 0;
            return (
              <div key={day.date} className="flex-1 flex flex-col items-center gap-1">
                <div
                  className={`w-full rounded-t-md transition-all ${
                    isNeg ? 'bg-rose-400' : 'bg-emerald-400'
                  }`}
                  style={{ height: `${heightPct}%`, minHeight: '4px' }}
                  title={`${day.date}: ${formatMoney(day.projectedBalancePence, currency)}`}
                />
                <span className="text-[9px] text-muted tabular-nums">
                  {day.date.slice(5)}
                </span>
              </div>
            );
          })}
        </div>
        {forecast.summary.daysUntilNegative !== null && (
          <div className="mt-2 rounded-lg bg-rose-50 px-3 py-1.5 text-xs text-rose-700">
            Cash goes negative in {forecast.summary.daysUntilNegative} day{forecast.summary.daysUntilNegative !== 1 ? 's' : ''}
          </div>
        )}
      </div>

      {/* Money Pulse + Leakage + Stock Risk */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">

        {/* Money Pulse */}
        <Section
          title="Money Pulse"
          action={
            <Link href="/reports/cashflow-forecast" className="text-xs text-primary hover:underline">
              View forecast →
            </Link>
          }
        >
          <dl className="space-y-3">
            <MoneyRow label="Cash on hand today" value={formatMoney(brief.moneyPulse.cashTodayPence / 100, brief.currency)} />
            <MoneyRow
              label="Receivables due (7 days)"
              value={formatMoney(brief.moneyPulse.arDue7DaysPence / 100, brief.currency)}
              positive
            />
            <MoneyRow
              label="Payables due (7 days)"
              value={formatMoney(brief.moneyPulse.apDue7DaysPence / 100, brief.currency)}
              negative
            />
            <div className="border-t border-border pt-3">
              <MoneyRow
                label="Forecast lowest balance (14d)"
                value={formatMoney(brief.moneyPulse.forecastLowestPence / 100, brief.currency)}
                negative={brief.moneyPulse.forecastLowestPence < 0}
              />
              {brief.moneyPulse.daysUntilNegative !== null ? (
                <p className="mt-1 text-xs text-error font-medium">
                  ⚠ Cash projected negative in {brief.moneyPulse.daysUntilNegative} day{brief.moneyPulse.daysUntilNegative !== 1 ? 's' : ''}
                </p>
              ) : (
                <p className="mt-1 text-xs text-success">✓ Cash stays positive for 14 days</p>
              )}
            </div>
          </dl>
        </Section>

        {/* Leakage Watch */}
        <Section
          title="Leakage Watch"
          action={
            <Link href="/reports/margins" className="text-xs text-primary hover:underline">
              View margins →
            </Link>
          }
        >
          <div className="space-y-3">
            <LeakageItem
              label="Discount overrides (7 days)"
              count={brief.leakageWatch.discountOverrideCount}
              threshold={10}
              href="/reports/risk-monitor"
              unit="overrides"
            />
            <LeakageItem
              label="Items selling below cost"
              count={brief.leakageWatch.negativeMarginProductCount}
              threshold={0}
              href="/reports/margins"
              unit="products"
            />
            <LeakageItem
              label="Cash variances (7 days)"
              count={Math.round(brief.leakageWatch.cashVariancePence / 100)}
              threshold={20}
              href="/reports/risk-monitor"
              unit={brief.currency}
              isMoney
            />
          </div>
        </Section>

        {/* Stock Risk */}
        <Section
          title="Stock Risk"
          action={
            <Link href={brief.stockRisk.reorderHref} className="text-xs text-primary hover:underline">
              View reorders →
            </Link>
          }
        >
          <div className="space-y-3">
            <RiskItem
              label="Products near stockout"
              count={brief.stockRisk.stockoutImminentCount}
              colour={brief.stockRisk.stockoutImminentCount > 3 ? 'text-error' : brief.stockRisk.stockoutImminentCount > 0 ? 'text-warning' : 'text-success'}
              href="/reports/reorder-suggestions"
            />
            <RiskItem
              label="Urgent reorder needed"
              count={brief.stockRisk.urgentReorderCount}
              colour={brief.stockRisk.urgentReorderCount > 3 ? 'text-error' : brief.stockRisk.urgentReorderCount > 0 ? 'text-warning' : 'text-success'}
              href="/reports/reorder-suggestions"
            />
          </div>
          {brief.stockRisk.stockoutImminentCount === 0 && brief.stockRisk.urgentReorderCount === 0 ? (
            <p className="mt-4 text-xs text-success font-medium">✓ Stock levels are healthy</p>
          ) : (
            <Link
              href={brief.stockRisk.reorderHref}
              className="btn-primary mt-4 w-full text-center text-xs py-2 block"
            >
              Review & Raise Orders
            </Link>
          )}
        </Section>
      </div>

      {/* Quick Links */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {quickLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="card flex items-center gap-3 p-4 hover:border-primary transition-colors"
          >
            <div>
              <p className="text-sm font-semibold text-ink">{link.label}</p>
              <p className="text-xs text-muted">{link.desc}</p>
            </div>
          </Link>
        ))}
      </div>

      {/* Export brief footer */}
      <div className="rounded-lg border border-border bg-surface p-4 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p className="text-sm font-medium text-ink">Owner Daily Brief</p>
          <p className="text-xs text-muted">Print or save a snapshot of today's business health.</p>
        </div>
        <div className="flex gap-2">
          <a href="/reports/owner/export?format=html" target="_blank" rel="noopener noreferrer" className="btn-secondary text-sm">
            Print / Save PDF
          </a>
          <a href="/reports/owner/export?format=csv" className="btn-secondary text-sm">
            Export CSV
          </a>
        </div>
      </div>
    </div>
  );
}

/* ─── Sub-components ─────────────────────────────────────────────────── */

function MoneyRow({ label, value, positive, negative }: { label: string; value: string; positive?: boolean; negative?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={`text-sm font-semibold tabular-nums ${positive ? 'text-success' : negative ? 'text-error' : 'text-ink'}`}>
        {value}
      </dd>
    </div>
  );
}

function LeakageItem({ label, count, threshold, href, unit, isMoney }: {
  label: string; count: number; threshold: number; href: string; unit: string; isMoney?: boolean;
}) {
  const isAlert = count > threshold;
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-muted">{label}</span>
      <Link
        href={href}
        className={`text-sm font-semibold tabular-nums hover:underline ${isAlert ? 'text-error' : 'text-success'}`}
      >
        {isMoney ? count : count} {unit}
      </Link>
    </div>
  );
}

function RiskItem({ label, count, colour, href }: { label: string; count: number; colour: string; href: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-muted">{label}</span>
      <Link href={href} className={`text-sm font-semibold tabular-nums hover:underline ${colour}`}>
        {count}
      </Link>
    </div>
  );
}
