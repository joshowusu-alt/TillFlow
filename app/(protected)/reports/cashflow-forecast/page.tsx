import PageHeader from '@/components/PageHeader';
import StatCard from '@/components/StatCard';
import EmptyState from '@/components/EmptyState';
import { requireBusiness } from '@/lib/auth';
import AdvancedModeNotice from '@/components/AdvancedModeNotice';
import { getFeatures } from '@/lib/features';
import { formatMoney } from '@/lib/format';
import { getCashflowForecast } from '@/lib/reports/forecast';

export const dynamic = 'force-dynamic';

export default async function CashflowForecastPage({
  searchParams,
}: {
  searchParams?: { days?: string; scenario?: string };
}) {
  const { business } = await requireBusiness(['OWNER']);
  if (!business) {
    return <EmptyState icon="chart" title="Business not found" cta={{ label: 'Go to Settings', href: '/settings' }} />;
  }
  const features = getFeatures((business as any).plan ?? (business.mode as any), (business as any).storeMode as any);
  if (!features.cashflowForecast) {
    return (
      <AdvancedModeNotice
        title="Cashflow Forecast is available on Pro"
        description="Forward-looking cash pressure forecasting is unlocked on businesses provisioned for Pro."
        featureName="Cashflow Forecast"
        minimumPlan="PRO"
      />
    );
  }

  const daysParam = parseInt(searchParams?.days ?? '14', 10);
  const days = ([7, 14, 30] as const).includes(daysParam as any) ? (daysParam as 7 | 14 | 30) : 14;
  const scenario = searchParams?.scenario ?? 'expected';

  const forecast = await getCashflowForecast(business.id, days);
  const currency = business.currency;

  const lowestBalance = forecast.summary.lowestPointPence;
  const isAtRisk = lowestBalance < 0;
  const daysNeg = forecast.summary.daysUntilNegative;

  // Local display helpers use existing forecast data only, no service changes.
  const largestOutflowDay = forecast.days.length > 0
    ? forecast.days.reduce((max, d) =>
        d.expectedOutflowPence > max.expectedOutflowPence ? d : max,
        forecast.days[0]
      )
    : null;

  const cashRecoveryDay = isAtRisk
    ? forecast.days.find(
        (d) =>
          d.date > forecast.summary.lowestPointDate &&
          d.projectedBalancePence > 0
      ) ?? null
    : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cashflow Forecast"
        subtitle={`${days}-day projection based on money owed to you, money you owe, and daily sales.`}
        actions={
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            {([7, 14, 30] as const).map((d) => (
              <a
                key={d}
                href={`?days=${d}&scenario=${scenario}`}
                className={`flex-1 rounded-lg px-3 py-2 text-center text-sm font-medium transition-colors sm:flex-none sm:py-1.5 ${
                  d === days ? 'bg-accent text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {d}d
              </a>
            ))}
          </div>
        }
      />

      {/* Risk Banner */}
      {isAtRisk && (
        <div className="animate-fade-in-up rounded-xl border border-rose-200 bg-rose-50 p-3.5 sm:p-4">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 rounded-full bg-rose-100 p-2">
              <svg className="h-5 w-5 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-semibold text-rose-800">
                Cash may run short - act before {forecast.summary.lowestPointDate}
              </h3>
              <p className="mt-1 text-sm text-rose-700">
                Your projected cash balance drops below zero on {forecast.summary.lowestPointDate}.{' '}
                Lowest expected point: {formatMoney(lowestBalance, currency)}.{' '}
                This is an estimate, not a guarantee.
              </p>
              {cashRecoveryDay && (
                <p className="mt-1 text-sm text-rose-700">
                  Cash is expected to recover by {cashRecoveryDay.date} if expected assumptions hold.
                </p>
              )}
              {largestOutflowDay && (
                <p className="mt-2 text-xs font-medium text-rose-700">
                  Largest expected outflow: {formatMoney(largestOutflowDay.expectedOutflowPence, currency)} on {largestOutflowDay.date} - check this is correct.
                </p>
              )}
              <div className="mt-3">
                <p className="text-xs font-semibold text-rose-800">Recommended actions</p>
                <ul className="mt-1.5 space-y-1 text-xs text-rose-700 list-disc pl-4">
                  <li>Chase overdue customer balances before that date.</li>
                  <li>Review large supplier payments due this week.</li>
                  <li>Delay non-urgent supplier payments where possible.</li>
                  <li>Check the largest outflow day in the table below for accuracy.</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Starting Cash"
          value={formatMoney(forecast.startingCashPence, currency)}
        />
        <StatCard
          label={`Projected (Day ${days})`}
          value={formatMoney(forecast.days[forecast.days.length - 1]?.projectedBalancePence ?? 0, currency)}
          tone={forecast.days[forecast.days.length - 1]?.projectedBalancePence >= 0 ? 'success' : 'danger'}
        />
        <StatCard
          label="Lowest Point"
          value={formatMoney(lowestBalance, currency)}
          tone={isAtRisk ? 'danger' : 'default'}
          helper={`on ${forecast.summary.lowestPointDate}`}
        />
        <StatCard
          label="Days at Risk"
          value={daysNeg !== null ? `${daysNeg}` : 'None'}
          tone={daysNeg !== null ? 'danger' : 'success'}
          helper={daysNeg !== null ? 'until negative balance' : 'Cash stays positive'}
        />
      </div>

      {/* What This Means */}
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-sm text-black/70">
        <p className="font-semibold text-ink mb-1">What this means</p>
        <p>
          This forecast estimates whether the business will have enough cash to cover upcoming payments.
          It is not the same as profit - sales on credit are not cash until the customer pays.
        </p>
        {isAtRisk ? (
          <p className="mt-1.5">
            Your forecast shows a possible cash gap. Focus on collecting outstanding customer balances and reviewing supplier payments before the risk date.
          </p>
        ) : (
          <p className="mt-1.5">
            Your forecast stays positive for this period. Keep checking customer collections and supplier payments regularly.
          </p>
        )}
      </div>

      {/* Scenario Toggle */}
      <div>
        <div className="flex flex-wrap gap-2">
          {(['expected', 'best', 'worst'] as const).map((s) => (
            <a
              key={s}
              href={`?days=${days}&scenario=${s}`}
              className={`flex-1 rounded-lg px-3 py-2 text-center text-sm font-medium capitalize transition-colors sm:flex-none sm:py-1.5 ${
                s === scenario ? 'bg-accent text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {s}
            </a>
          ))}
        </div>
        <p className="mt-2 text-xs text-black/50">
          Expected uses normal assumptions. Best assumes customers pay faster and sales are stronger. Worst assumes slower collections and weaker daily sales.
        </p>
      </div>

      {/* Forecast Table */}
      <div className="card overflow-hidden p-3.5 sm:p-6">
        <h2 className="text-base font-display font-semibold sm:text-lg">Daily Projection</h2>
        <p className="mt-1 mb-4 text-xs text-black/50">
          Use this to see which days may put pressure on cash. Green amounts are money expected in; red amounts are money expected out.
        </p>
        {forecast.days.length === 0 ? (
          <EmptyState icon="chart" title="No forecast data" subtitle="Record some sales and expenses to see projections." />
        ) : null}
        {forecast.days.length > 0 && (
          <div className="responsive-table-shell">
            <table className="table w-full min-w-[54rem] border-separate border-spacing-y-1 text-sm">
              <thead>
                <tr>
                  <th className="text-left">Date</th>
                  <th className="text-right">Money in</th>
                  <th className="text-right">Money out</th>
                  <th className="text-right">Expected balance</th>
                  <th className="text-right">Best Case</th>
                  <th className="text-right">Worst Case</th>
                </tr>
              </thead>
              <tbody>
                {forecast.days.map((day) => {
                  const isLowestDay = day.date === forecast.summary.lowestPointDate;
                  return (
                    <tr
                      key={day.date}
                      className={`rounded-lg ${isLowestDay ? 'bg-rose-50' : 'bg-white'}`}
                    >
                      <td className="px-3 py-2 font-medium">
                        {day.date}
                        {isLowestDay && (
                          <span className="ml-2 rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700">lowest</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right text-success">+{formatMoney(day.expectedInflowPence, currency)}</td>
                      <td className="px-3 py-2 text-right text-rose">-{formatMoney(day.expectedOutflowPence, currency)}</td>
                      <td className={`px-3 py-2 text-right font-semibold ${day.projectedBalancePence < 0 ? 'text-rose' : ''}`}>{formatMoney(day.projectedBalancePence, currency)}</td>
                      <td className="px-3 py-2 text-right text-muted">{formatMoney(day.scenarioBestPence, currency)}</td>
                      <td className={`px-3 py-2 text-right ${day.scenarioWorstPence < 0 ? 'text-rose' : 'text-muted'}`}>{formatMoney(day.scenarioWorstPence, currency)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Methodology Note */}
      <div className="card p-3.5 text-xs text-muted sm:p-4">
        <h3 className="font-semibold text-ink">How this forecast works</h3>
        <p className="mt-1.5 text-black/55 italic">
          This is an estimate based on current balances and recent trends, not a guaranteed prediction.
        </p>
        <ul className="mt-2 list-disc pl-4 space-y-1">
          <li><strong>Money in:</strong> Customer balances expected to be collected at 85% + average daily cash/MoMo sales (14-day trailing).</li>
          <li><strong>Money out:</strong> Supplier balances scheduled by due date + average daily expenses (30-day trailing).</li>
          <li><strong>Best case:</strong> 100% customer balance collection + 110% daily cash sales.</li>
          <li><strong>Worst case:</strong> 60% customer balance collection + 80% daily cash sales.</li>
          <li>Overdue customer balances are spread over the next 7 days. Supplier bills without a due date default to 14 days from creation.</li>
        </ul>
      </div>
    </div>
  );
}
