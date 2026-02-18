import PageHeader from '@/components/PageHeader';
import StatCard from '@/components/StatCard';
import Badge from '@/components/Badge';
import EmptyState from '@/components/EmptyState';
import { requireBusiness } from '@/lib/auth';
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

  const daysParam = parseInt(searchParams?.days ?? '14', 10);
  const days = ([7, 14, 30] as const).includes(daysParam as any) ? (daysParam as 7 | 14 | 30) : 14;
  const scenario = searchParams?.scenario ?? 'expected';

  const forecast = await getCashflowForecast(business.id, days);
  const currency = business.currency;

  const lowestBalance = forecast.summary.lowestPointPence;
  const isAtRisk = lowestBalance < 0;
  const daysNeg = forecast.summary.daysUntilNegative;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cashflow Forecast"
        subtitle={`${days}-day projection based on current AR, AP, and daily revenue.`}
        actions={
          <div className="flex gap-2">
            {([7, 14, 30] as const).map((d) => (
              <a
                key={d}
                href={`?days=${d}&scenario=${scenario}`}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
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
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 animate-fade-in-up">
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-rose-100 p-2">
              <svg className="h-5 w-5 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-rose-800">Cash forecast goes negative</h3>
              <p className="mt-1 text-sm text-rose-700">
                {daysNeg !== null
                  ? `Your projected cash balance turns negative in ${daysNeg} day${daysNeg !== 1 ? 's' : ''} (${forecast.summary.lowestPointDate}). Lowest point: ${formatMoney(lowestBalance, currency)}.`
                  : `Lowest projected balance: ${formatMoney(lowestBalance, currency)} on ${forecast.summary.lowestPointDate}.`}
              </p>
              <p className="mt-2 text-xs text-rose-600">
                Consider delaying supplier payments or chasing overdue receivables.
              </p>
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

      {/* Scenario Toggle */}
      <div className="flex gap-2">
        {(['expected', 'best', 'worst'] as const).map((s) => (
          <a
            key={s}
            href={`?days=${days}&scenario=${s}`}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium capitalize transition-colors ${
              s === scenario ? 'bg-accent text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {s}
          </a>
        ))}
      </div>

      {/* Forecast Table */}
      <div className="card overflow-x-auto p-6">
        <h2 className="mb-4 text-lg font-display font-semibold">Daily Projection</h2>
        {forecast.days.length === 0 ? (
          <EmptyState icon="chart" title="No forecast data" subtitle="Record some sales and expenses to see projections." />
        ) : (
          <table className="table w-full border-separate border-spacing-y-1 text-sm">
            <thead>
              <tr>
                <th className="text-left">Date</th>
                <th className="text-right">Inflow</th>
                <th className="text-right">Outflow</th>
                <th className="text-right">Balance (Expected)</th>
                <th className="text-right">Best Case</th>
                <th className="text-right">Worst Case</th>
              </tr>
            </thead>
            <tbody>
              {forecast.days.map((day) => {
                const balanceField = scenario === 'best'
                  ? day.scenarioBestPence
                  : scenario === 'worst'
                    ? day.scenarioWorstPence
                    : day.projectedBalancePence;
                return (
                  <tr key={day.date} className="rounded-lg bg-white">
                    <td className="px-3 py-2 font-medium">{day.date}</td>
                    <td className="px-3 py-2 text-right text-success">
                      +{formatMoney(day.expectedInflowPence, currency)}
                    </td>
                    <td className="px-3 py-2 text-right text-rose">
                      -{formatMoney(day.expectedOutflowPence, currency)}
                    </td>
                    <td className={`px-3 py-2 text-right font-semibold ${
                      day.projectedBalancePence < 0 ? 'text-rose' : ''
                    }`}>
                      {formatMoney(day.projectedBalancePence, currency)}
                    </td>
                    <td className="px-3 py-2 text-right text-muted">
                      {formatMoney(day.scenarioBestPence, currency)}
                    </td>
                    <td className={`px-3 py-2 text-right ${
                      day.scenarioWorstPence < 0 ? 'text-rose' : 'text-muted'
                    }`}>
                      {formatMoney(day.scenarioWorstPence, currency)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Methodology Note */}
      <div className="card p-4 text-xs text-muted">
        <h3 className="font-semibold text-ink">How this forecast works</h3>
        <ul className="mt-2 list-disc pl-4 space-y-1">
          <li><strong>Inflows:</strong> AR collections at 85% expected rate + average daily cash/MoMo sales (14-day trailing).</li>
          <li><strong>Outflows:</strong> AP payments by due date + average daily expenses (30-day trailing).</li>
          <li><strong>Best case:</strong> 100% AR collection + 110% daily cash sales.</li>
          <li><strong>Worst case:</strong> 60% AR collection + 80% daily cash sales.</li>
          <li>Overdue AR is spread over the next 7 days. AP without due dates defaults to 14 days from creation.</li>
        </ul>
      </div>
    </div>
  );
}
