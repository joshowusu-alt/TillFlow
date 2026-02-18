import Link from 'next/link';
import PageHeader from '@/components/PageHeader';
import StatCard from '@/components/StatCard';
import Badge from '@/components/Badge';
import ProgressRing from '@/components/ProgressRing';
import RefreshIndicator from '@/components/RefreshIndicator';
import { requireBusiness } from '@/lib/auth';
import { formatMoney } from '@/lib/format';
import { getTodayKPIs } from '@/lib/reports/today-kpis';
import { calculateHealthScore } from '@/lib/reports/health-score';
import { computeBusinessAlerts, type BusinessAlert } from '@/lib/reports/alerts';
import { getCashflowForecast } from '@/lib/reports/forecast';

export const dynamic = 'force-dynamic';

const quickLinks = [
  { label: 'Weekly Digest', href: '/reports/weekly-digest', desc: 'Last 7 days summary' },
  { label: 'Reorder', href: '/reports/reorder-suggestions', desc: 'Stock replenishment' },
  { label: 'Risk Monitor', href: '/reports/risk-monitor', desc: 'Fraud & control alerts' },
  { label: 'Cashflow', href: '/reports/cashflow', desc: 'Cash position statement' },
  { label: 'Income Statement', href: '/reports/income-statement', desc: 'Revenue & expenses' },
  { label: 'Balance Sheet', href: '/reports/balance-sheet', desc: 'Assets & liabilities' },
];

function AlertCard({ alert }: { alert: BusinessAlert }) {
  const toneMap = { HIGH: 'danger', MEDIUM: 'warn', LOW: 'info' } as const;
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-card animate-fade-in-up">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <Badge tone={toneMap[alert.severity]}>{alert.severity}</Badge>
            <h3 className="text-sm font-semibold text-ink">{alert.title}</h3>
          </div>
          <p className="mt-1.5 text-xs text-muted leading-relaxed">{alert.explanation}</p>
        </div>
        <Link
          href={alert.cta.href}
          className="shrink-0 rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-200 transition-colors"
        >
          {alert.cta.label}
        </Link>
      </div>
    </div>
  );
}

export default async function CommandCenterPage() {
  const { business } = await requireBusiness(['OWNER']);
  if (!business) {
    return (
      <div className="card p-6 text-center">
        <div className="text-lg font-semibold">Setup Required</div>
        <div className="mt-2 text-sm text-muted">Complete your business setup to get started.</div>
        <a href="/settings" className="btn-primary mt-4 inline-block">Go to Settings</a>
      </div>
    );
  }

  const currency = business.currency;

  // Fetch KPIs and forecast in parallel
  const [kpis, forecast] = await Promise.all([
    getTodayKPIs(business.id),
    getCashflowForecast(business.id, 14),
  ]);

  // Calculate health score
  const healthScore = calculateHealthScore({
    totalSalesPence: kpis.totalSalesPence,
    grossMarginPence: kpis.grossMarginPence,
    targetGpPercent: 20,
    cashOnHandPence: forecast.startingCashPence,
    dailyOperatingExpensesPence: kpis.avgDailyExpensesPence,
    arTotalPence: kpis.outstandingARPence,
    arOver90Pence: kpis.arOver90Pence,
    totalTrackedProducts: kpis.totalTrackedProducts,
    productsAboveReorderPoint: kpis.productsAboveReorderPoint,
    openHighAlerts: kpis.openHighAlerts,
  });

  // Compute business alerts
  const alerts = computeBusinessAlerts({
    gpPercent: kpis.gpPercent,
    totalSalesPence: kpis.totalSalesPence,
    arTotalPence: kpis.outstandingARPence,
    arOver60Pence: kpis.arOver60Pence,
    arOver90Pence: kpis.arOver90Pence,
    urgentReorderCount: kpis.urgentReorderCount,
    cashVarianceTotalPence: kpis.cashVarianceTotalPence,
    cashVarianceThresholdPence: business.cashVarianceRiskThresholdPence ?? 2000,
    thisWeekExpensesPence: kpis.thisWeekExpensesPence,
    fourWeekAvgExpensesPence: kpis.fourWeekAvgExpensesPence,
    forecastNegativeWithin14Days: forecast.summary.daysUntilNegative !== null,
    lowestProjectedBalancePence: forecast.summary.lowestPointPence,
    negativeMarginProductCount: kpis.negativeMarginProductCount,
    momoPendingCount: kpis.momoPendingCount,
    momoPendingThreshold: 5,
    stockoutImminentCount: kpis.stockoutImminentCount,
    discountOverrideCount: kpis.discountOverrideCount,
    discountOverrideThreshold: 10,
  });

  // Forecast mini data: next 7 days
  const forecastMini = forecast.days.slice(0, 7);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Command Center"
        subtitle="Your business at a glance. What's happening, why, and what to do next."
        actions={
          <div className="flex items-center gap-3">
            <Link href="/reports/dashboard" className="btn-secondary text-sm">Daily Dashboard</Link>
            <RefreshIndicator fetchedAt={new Date().toISOString()} autoRefreshMs={120_000} />
          </div>
        }
      />

      {/* Row 1: Health Score + Today KPIs */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Health Score Card */}
        <div className="card flex flex-col items-center justify-center p-6 shadow-card">
          <div className="text-xs font-medium uppercase tracking-wide text-muted mb-4">Business Health</div>
          <ProgressRing value={healthScore.score} grade={healthScore.grade} size={140} />
          <div className="mt-4 w-full space-y-2">
            {healthScore.dimensions.map((dim) => (
              <div key={dim.name} className="flex items-center justify-between text-xs">
                <span className="text-muted">{dim.name}</span>
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-16 rounded-full bg-gray-200">
                    <div
                      className={`h-1.5 rounded-full transition-all duration-500 ${
                        dim.score / dim.max >= 0.7 ? 'bg-emerald-500' :
                        dim.score / dim.max >= 0.4 ? 'bg-amber-500' : 'bg-rose-500'
                      }`}
                      style={{ width: `${(dim.score / dim.max) * 100}%` }}
                    />
                  </div>
                  <span className="w-6 text-right font-semibold tabular-nums">{dim.score}</span>
                </div>
              </div>
            ))}
          </div>
          {healthScore.actions.length > 0 && (
            <div className="mt-4 w-full border-t border-gray-100 pt-3">
              <div className="text-[10px] uppercase tracking-wider text-muted mb-2">Recommended</div>
              {healthScore.actions.map((action) => (
                <Link
                  key={action.href}
                  href={action.href}
                  className="block rounded-lg px-2 py-1.5 text-xs font-medium text-accent hover:bg-accentSoft transition-colors"
                >
                  {action.label} →
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Today's KPIs */}
        <div className="lg:col-span-2 space-y-4">
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

          {/* 7-Day Forecast Mini */}
          <div className="card p-4 shadow-card">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-ink">7-Day Cash Forecast</h3>
              <Link href="/reports/cashflow-forecast" className="text-xs text-accent hover:underline">
                Full forecast →
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
        </div>
      </div>

      {/* Row 2: Alerts */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-display font-semibold">
            Alerts
            {alerts.length > 0 && (
              <span className="ml-2 text-sm font-normal text-muted">({alerts.length})</span>
            )}
          </h2>
          <Link href="/reports/risk-monitor" className="text-xs text-accent hover:underline">
            All risk alerts →
          </Link>
        </div>
        {alerts.length === 0 ? (
          <div className="card flex items-center gap-3 p-4 shadow-card">
            <div className="rounded-full bg-emerald-50 p-2">
              <svg className="h-5 w-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <div className="text-sm font-semibold text-ink">All clear</div>
              <div className="text-xs text-muted">No alerts to action right now. Keep it up.</div>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {alerts.slice(0, 5).map((alert) => (
              <AlertCard key={alert.id} alert={alert} />
            ))}
            {alerts.length > 5 && (
              <div className="text-center text-xs text-muted">
                + {alerts.length - 5} more alert{alerts.length - 5 !== 1 ? 's' : ''}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Row 3: Top Drivers */}
      {healthScore.topDrivers.length > 0 && (
        <div className="card p-6 shadow-card">
          <h2 className="mb-3 text-sm font-semibold text-ink">Top 3 Score Drivers</h2>
          <div className="space-y-2">
            {healthScore.topDrivers.map((driver, i) => (
              <div key={i} className="flex items-start gap-3 rounded-lg bg-gray-50 px-3 py-2 text-sm">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-white text-xs font-bold">
                  {i + 1}
                </span>
                <span className="text-muted">{driver}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Row 4: Quick Links */}
      <div>
        <h2 className="mb-3 text-lg font-display font-semibold">Reports & Tools</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {quickLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="card flex items-center gap-3 p-4 shadow-card transition-all hover:shadow-soft hover:-translate-y-0.5"
            >
              <div className="flex-1">
                <div className="text-sm font-semibold text-ink">{link.label}</div>
                <div className="text-xs text-muted">{link.desc}</div>
              </div>
              <svg className="h-4 w-4 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
