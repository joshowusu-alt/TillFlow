import PageHeader from '@/components/PageHeader';
import { requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { formatMoney } from '@/lib/format';
import { getIncomeStatement } from '@/lib/reports/financials';
import AdvancedModeNotice from '@/components/AdvancedModeNotice';
import { isAdvancedMode } from '@/lib/features';

export default async function IncomeStatementPage({
  searchParams
}: {
  searchParams?: { from?: string; to?: string };
}) {
  await requireRole(['MANAGER', 'OWNER']);
  const business = await prisma.business.findFirst();
  if (!business) return <div className="card p-6">Seed data missing.</div>;
  if (!isAdvancedMode(business.mode as any)) {
    return <AdvancedModeNotice title="Income Statement is an advanced report" />;
  }

  const now = new Date();
  const start = searchParams?.from ? new Date(searchParams.from) : new Date(now.getFullYear(), now.getMonth(), 1);
  const end = searchParams?.to ? new Date(searchParams.to) : now;

  const statement = await getIncomeStatement(business.id, start, end);

  return (
    <div className="space-y-6">
      <PageHeader title="Income Statement" subtitle="Revenue, COGS, and profit." />
      <div className="card p-6">
        <form className="grid gap-4 md:grid-cols-3">
          <div>
            <label className="label">From</label>
            <input className="input" name="from" type="date" defaultValue={start.toISOString().slice(0, 10)} />
          </div>
          <div>
            <label className="label">To</label>
            <input className="input" name="to" type="date" defaultValue={end.toISOString().slice(0, 10)} />
          </div>
          <div className="flex items-end">
            <button className="btn-primary w-full">Update</button>
          </div>
        </form>
      </div>

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
    </div>
  );
}
