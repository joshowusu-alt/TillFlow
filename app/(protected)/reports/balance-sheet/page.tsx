import PageHeader from '@/components/PageHeader';
import { requireBusiness } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
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

  return (
    <div className="space-y-6">
      <PageHeader title="Balance Sheet" subtitle="Assets, liabilities, and equity." />
      <div className="card p-6">
        <form className="grid gap-4 md:grid-cols-3">
          <div>
            <label className="label">As of</label>
            <input className="input" name="asOf" type="date" defaultValue={asOf.toISOString().slice(0, 10)} />
          </div>
          <div className="flex items-end">
            <button className="btn-primary w-full">Update</button>
          </div>
        </form>
      </div>

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
    </div>
  );
}
