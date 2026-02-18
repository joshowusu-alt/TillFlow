import PageHeader from '@/components/PageHeader';
import StatCard from '@/components/StatCard';
import EmptyState from '@/components/EmptyState';
import { requireBusiness } from '@/lib/auth';
import { formatMoney } from '@/lib/format';
import { getBalanceSheet } from '@/lib/reports/financials';
import AdvancedModeNotice from '@/components/AdvancedModeNotice';
import { isAdvancedMode } from '@/lib/features';

export default async function BalanceSheetPage({
  searchParams
}: {
  searchParams?: { asOf?: string };
}) {
  const { user, business } = await requireBusiness(['MANAGER', 'OWNER']);
  if (!business) return <div className="card p-6">Seed data missing.</div>;
  if (!isAdvancedMode(business.mode as any)) {
    return <AdvancedModeNotice title="Balance Sheet is an advanced report" />;
  }

  const asOf = searchParams?.asOf ? new Date(searchParams.asOf) : new Date();
  const sheet = await getBalanceSheet(business.id, asOf);
  const hasData = sheet.totalAssets !== 0 || sheet.totalLiabilities !== 0 || sheet.totalEquity !== 0;
  const asOfStr = asOf.toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Balance Sheet"
        subtitle="Assets, liabilities, and equity."
        actions={
          <div className="flex gap-2">
            <a
              href={`/api/reports/financials?type=balance-sheet&asOf=${asOfStr}`}
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
          label="Total Assets"
          value={formatMoney(sheet.totalAssets, business.currency)}
          tone="accent"
        />
        <StatCard
          label="Total Liabilities"
          value={formatMoney(sheet.totalLiabilities, business.currency)}
          tone={sheet.totalLiabilities > 0 ? 'warn' : 'default'}
        />
        <StatCard
          label="Total Equity"
          value={formatMoney(sheet.totalEquity, business.currency)}
          tone={sheet.totalEquity >= 0 ? 'success' : 'danger'}
        />
      </div>

      <div className="card p-6">
        <form className="grid gap-4 md:grid-cols-3">
          <div>
            <label className="label">As of</label>
            <input className="input" name="asOf" type="date" defaultValue={asOfStr} />
          </div>
          <div className="flex items-end">
            <button className="btn-primary w-full">Update</button>
          </div>
        </form>
      </div>

      {!hasData ? (
        <EmptyState
          icon="chart"
          title="No balance sheet data"
          subtitle="Record transactions to see your financial position."
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="card p-6">
            <h2 className="text-lg font-display font-semibold">Assets</h2>
            <div className="mt-4 space-y-2 text-sm">
              {sheet.assets.map((line) => (
                <div key={line.accountCode} className="flex justify-between">
                  <span>{line.name}</span>
                  <span className="font-semibold">{formatMoney(line.balancePence, business.currency)}</span>
                </div>
              ))}
              <div className="flex justify-between border-t border-black/10 pt-2 text-sm font-semibold">
                <span>Total Assets</span>
                <span>{formatMoney(sheet.totalAssets, business.currency)}</span>
              </div>
            </div>
          </div>

          <div className="card p-6">
            <h2 className="text-lg font-display font-semibold">Liabilities</h2>
            <div className="mt-4 space-y-2 text-sm">
              {sheet.liabilities.map((line) => (
                <div key={line.accountCode} className="flex justify-between">
                  <span>{line.name}</span>
                  <span className="font-semibold">{formatMoney(line.balancePence, business.currency)}</span>
                </div>
              ))}
              <div className="flex justify-between border-t border-black/10 pt-2 text-sm font-semibold">
                <span>Total Liabilities</span>
                <span>{formatMoney(sheet.totalLiabilities, business.currency)}</span>
              </div>
            </div>
          </div>

          <div className="card p-6">
            <h2 className="text-lg font-display font-semibold">Equity</h2>
            <div className="mt-4 space-y-2 text-sm">
              {sheet.equity.map((line) => (
                <div key={line.accountCode} className="flex justify-between">
                  <span>{line.name}</span>
                  <span className="font-semibold">{formatMoney(line.balancePence, business.currency)}</span>
                </div>
              ))}
              <div className="flex justify-between border-t border-black/10 pt-2 text-sm font-semibold">
                <span>Total Equity</span>
                <span>{formatMoney(sheet.totalEquity, business.currency)}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
