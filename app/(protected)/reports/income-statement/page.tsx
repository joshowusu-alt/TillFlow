import PageHeader from '@/components/PageHeader';
import StatCard from '@/components/StatCard';
import EmptyState from '@/components/EmptyState';
import { requireBusiness } from '@/lib/auth';
import { formatMoney } from '@/lib/format';
import { getIncomeStatement } from '@/lib/reports/financials';

export default async function IncomeStatementPage({
  searchParams
}: {
  searchParams?: { from?: string; to?: string };
}) {
  const { user, business } = await requireBusiness(['MANAGER', 'OWNER']);
  if (!business) return <div className="card p-6">Seed data missing.</div>;

  const now = new Date();
  const start = searchParams?.from ? new Date(searchParams.from) : new Date(now.getFullYear(), now.getMonth(), 1);
  const end = searchParams?.to ? new Date(searchParams.to) : now;

  const statement = await getIncomeStatement(business.id, start, end);
  const gpPct = statement.revenue > 0 ? Math.round((statement.grossProfit / statement.revenue) * 100) : 0;
  const hasData = statement.revenue !== 0 || statement.cogs !== 0;

  const fromStr = start.toISOString().slice(0, 10);
  const toStr = end.toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Income Statement"
        subtitle="Revenue, COGS, and profit."
        actions={
          <div className="flex gap-2">
            <a
              href={`/api/reports/financials?type=income-statement&from=${fromStr}&to=${toStr}`}
              className="btn-secondary text-sm"
            >
              Export CSV
            </a>
            <a href="/reports/command-center" className="btn-secondary text-sm">Command Center</a>
          </div>
        }
      />

      {/* KPI Summary */}
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          label="Revenue"
          value={formatMoney(statement.revenue, business.currency)}
          tone="accent"
        />
        <StatCard
          label="COGS"
          value={formatMoney(statement.cogs, business.currency)}
        />
        <StatCard
          label={`Gross Profit (${gpPct}%)`}
          value={formatMoney(statement.grossProfit, business.currency)}
          tone={gpPct >= 20 ? 'success' : gpPct >= 0 ? 'warn' : 'danger'}
        />
      </div>

      <div className="card p-6">
        <form className="grid gap-4 md:grid-cols-3">
          <div>
            <label className="label">From</label>
            <input className="input" name="from" type="date" defaultValue={fromStr} />
          </div>
          <div>
            <label className="label">To</label>
            <input className="input" name="to" type="date" defaultValue={toStr} />
          </div>
          <div className="flex items-end">
            <button className="btn-primary w-full">Update</button>
          </div>
        </form>
      </div>

      {!hasData ? (
        <EmptyState
          icon="chart"
          title="No journal entries yet"
          subtitle="Record sales or expenses to see your income statement."
          cta={{ label: 'Open POS', href: '/pos' }}
          secondaryCta={{ label: 'Run Demo Day', href: '/onboarding#demo' }}
          hint="Demo Day generates a week of sample data so you can preview reports."
        />
      ) : (
        <div className="card p-6 space-y-3 text-sm">
          <div className="flex justify-between">
            <span>Sales Revenue</span>
            <span className="font-semibold">{formatMoney(statement.revenue, business.currency)}</span>
          </div>
          <div className="flex justify-between">
            <span>Cost of Goods Sold</span>
            <span className="font-semibold">{formatMoney(statement.cogs, business.currency)}</span>
          </div>
          <div className="flex justify-between border-t border-black/10 pt-2 text-base">
            <span>Gross Profit</span>
            <span className="font-semibold">{formatMoney(statement.grossProfit, business.currency)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
