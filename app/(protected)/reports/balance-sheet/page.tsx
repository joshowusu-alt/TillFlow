import PageHeader from '@/components/PageHeader';
import StatCard from '@/components/StatCard';
import EmptyState from '@/components/EmptyState';
import { requireBusiness } from '@/lib/auth';
import { formatMoney } from '@/lib/format';
import { getBalanceSheet } from '@/lib/reports/financials';
import BalanceSheetDatePicker from './BalanceSheetDatePicker';

export default async function BalanceSheetPage({
  searchParams
}: {
  searchParams?: { asOf?: string };
}) {
  const { user, business } = await requireBusiness(['MANAGER', 'OWNER']);
  if (!business) return <div className="card p-6">Seed data missing.</div>;

  const asOf = searchParams?.asOf ? new Date(searchParams.asOf) : new Date();
  const sheet = await getBalanceSheet(business.id, asOf);
  // Check if any individual account line has activity, not just the net total.
  // (Buying inventory with cash nets totalAssets to 0, but data still exists.)
  const hasData = sheet.assets.some(l => l.balancePence !== 0)
    || sheet.liabilities.some(l => l.balancePence !== 0)
    || sheet.equity.some(l => l.balancePence !== 0);
  const asOfStr = asOf.toISOString().slice(0, 10);

  // Detect negative cash: cash from journals before opening capital was added.
  // openingCapital is already baked into the Cash on Hand line by getBalanceSheet,
  // so raw journal cash = cashLine.balancePence - openingCapitalPence.
  const openingCapitalPence = (business as any).openingCapitalPence ?? 0;
  const cashLine = sheet.assets.find(a => a.accountCode === '1000');
  const rawCashBalance = cashLine ? cashLine.balancePence - openingCapitalPence : 0;
  // Suggested Opening Capital = amount needed to bring cash to zero (in whole units)
  const suggestedCapital = rawCashBalance < 0 ? Math.abs(rawCashBalance) / 100 : 0;

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
        <BalanceSheetDatePicker defaultValue={asOfStr} />
      </div>

      {/* Smart banner: negative cash = missing Opening Capital entry */}
      {rawCashBalance < 0 && openingCapitalPence === 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <p className="font-semibold mb-1">Cash on Hand is showing negative — here&apos;s why and how to fix it</p>
          <p className="mb-2">
            When you buy inventory with your own money, the system correctly records:
            Inventory ↑ and Cash ↓. But it doesn&apos;t yet know WHERE that cash came from (your pocket =
            your capital investment). So Cash goes negative.
          </p>
          <p className="mb-3">
            The fix: record your <strong>Opening Capital</strong> — the money you personally put into this business.
            This creates a matching <em>Owner&apos;s Capital</em> entry in Equity, and your balance sheet will
            balance: Inventory on one side, Owner&apos;s Capital on the other.
          </p>
          <a
            href={`/settings#opening-capital`}
            className="inline-block rounded bg-red-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-800"
          >
            Set Opening Capital (suggested: {business.currency} {suggestedCapital.toLocaleString()}) →
          </a>
        </div>
      )}

      {/* Generic tip for the zero-net-assets case (opening capital already set, assets net to 0) */}
      {rawCashBalance >= 0 && hasData && sheet.totalAssets === 0 && sheet.assets.some(l => l.balancePence > 0) && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <strong>Why is Total Assets 0?</strong>{' '}
          Buying inventory with cash moves value between two asset accounts (Inventory ↑, Cash ↓) so they
          cancel in the total. Your books are balanced — see the breakdown below.
        </div>
      )}

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
                  <span className={`font-semibold ${line.balancePence < 0 ? 'text-red-600' : ''}`}>
                    {formatMoney(line.balancePence, business.currency)}
                  </span>
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
