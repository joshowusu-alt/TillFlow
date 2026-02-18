import PageHeader from '@/components/PageHeader';
import StatCard from '@/components/StatCard';
import EmptyState from '@/components/EmptyState';
import { requireBusiness } from '@/lib/auth';
import { formatMoney } from '@/lib/format';
import { getCashflow } from '@/lib/reports/financials';
import AdvancedModeNotice from '@/components/AdvancedModeNotice';
import { isAdvancedMode } from '@/lib/features';

export default async function CashflowPage({
  searchParams
}: {
  searchParams?: { from?: string; to?: string };
}) {
  const { user, business } = await requireBusiness(['MANAGER', 'OWNER']);
  if (!business) return <div className="card p-6">Seed data missing.</div>;
  if (!isAdvancedMode(business.mode as any)) {
    return <AdvancedModeNotice title="Cashflow is an advanced report" />;
  }

  const now = new Date();
  const start = searchParams?.from ? new Date(searchParams.from) : new Date(now.getFullYear(), now.getMonth(), 1);
  const end = searchParams?.to ? new Date(searchParams.to) : now;

  const cashflow = await getCashflow(business.id, start, end);
  const hasData = cashflow.beginningCash !== 0 || cashflow.netProfit !== 0 || cashflow.endingCash !== 0;

  const fromStr = start.toISOString().slice(0, 10);
  const toStr = end.toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cashflow"
        subtitle="Indirect cashflow (operations)."
        actions={
          <div className="flex gap-2">
            <a
              href={`/api/reports/financials?type=cashflow&from=${fromStr}&to=${toStr}`}
              className="btn-secondary text-sm"
            >
              Export CSV
            </a>
            <a href="/reports/cashflow-forecast" className="btn-secondary text-sm">Cashflow Forecast</a>
            <a href="/reports/command-center" className="btn-secondary text-sm">Command Center</a>
          </div>
        }
      />

      {/* KPI Summary */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Beginning Cash"
          value={formatMoney(cashflow.beginningCash, business.currency)}
        />
        <StatCard
          label="Net Cash from Ops"
          value={formatMoney(cashflow.netCashFromOps, business.currency)}
          tone={cashflow.netCashFromOps >= 0 ? 'success' : 'danger'}
        />
        <StatCard
          label="Ending Cash"
          value={formatMoney(cashflow.endingCash, business.currency)}
          tone="accent"
        />
        <StatCard
          label="Net Profit"
          value={formatMoney(cashflow.netProfit, business.currency)}
          tone={cashflow.netProfit >= 0 ? 'success' : 'danger'}
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
          title="No cashflow data"
          subtitle="Record transactions to see your cashflow statement."
        />
      ) : (
        <div className="card p-6 space-y-2 text-sm">
          <div className="flex justify-between text-black/60">
            <span>Beginning Cash Balance</span>
            <span className="font-semibold">{formatMoney(cashflow.beginningCash, business.currency)}</span>
          </div>
          {cashflow.openingCapital > 0 && (
            <div className="flex justify-between text-xs text-black/40 pl-4">
              <span>Includes owner&apos;s capital</span>
              <span>{formatMoney(cashflow.openingCapital, business.currency)}</span>
            </div>
          )}
          <div className="border-t border-black/5 pt-2" />
          <div className="flex justify-between">
            <span>Net Profit</span>
            <span className="font-semibold">{formatMoney(cashflow.netProfit, business.currency)}</span>
          </div>
          <div className="flex justify-between">
            <span>Change in Accounts Receivable</span>
            <span className="font-semibold">{formatMoney(cashflow.arChange, business.currency)}</span>
          </div>
          <div className="flex justify-between">
            <span>Change in Inventory</span>
            <span className="font-semibold">{formatMoney(cashflow.invChange, business.currency)}</span>
          </div>
          <div className="flex justify-between">
            <span>Change in Accounts Payable</span>
            <span className="font-semibold">{formatMoney(cashflow.apChange, business.currency)}</span>
          </div>
          <div className="flex justify-between border-t border-black/10 pt-2 font-semibold">
            <span>Net Cash from Operations</span>
            <span>{formatMoney(cashflow.netCashFromOps, business.currency)}</span>
          </div>
          <div className="flex justify-between border-t border-black/10 pt-2 text-base font-semibold">
            <span>Ending Cash Balance</span>
            <span>{formatMoney(cashflow.endingCash, business.currency)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
