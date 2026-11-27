import Link from 'next/link';
import { requireBusiness } from '@/lib/auth';
import { formatMoney } from '@/lib/format';
import PageHeader from '@/components/PageHeader';
import { loadCostResolutionBatch } from '@/lib/services/cost-resolution-batch';
import { guardLiveReport } from '@/lib/entitlements/live-report';
import { formatBusinessLocalDateKey } from '@/lib/notifications/utils';
import { getIncomeStatementBreakdown } from '@/lib/reports/financials';
import { incomeStatementEntriesHref } from '@/lib/reports/income-statement-breakdown';
import { resolveReportDateRange } from '@/lib/reports/date-parsing';
import { businessMonthWindow, requireReportTimeZone } from '@/lib/reports/reporting-clock';

export const dynamic = 'force-dynamic';

export default async function CostResolutionPage(props:{searchParams:Promise<{after?:string;review?:string}>}) {
  const {business}=await requireBusiness(['OWNER','MANAGER']);
  const params=await props.searchParams;
  const after=typeof params.after==='string' && params.after.length<=128 ? params.after : undefined;
  const review=params.review==='1';
  const data=await loadCostResolutionBatch(business.id,after,review);
  // Use the same authorised period and completeness signal as the Income Statement.
  const now = new Date();
  const report = await guardLiveReport({ surfaceId: 'income_statement', action: 'VIEW', now,
    range: ({ timezone, now: instant }) => {
      const today = formatBusinessLocalDateKey(instant, timezone);
      return { fromLocalDate: today.slice(0, 7) + '-01', toLocalDate: today, preset: 'MONTH_TO_DATE' };
    },
  });
  let profitFixHref: string | null = null;
  if (report.ok && report.business.id === business.id) {
    const zone = requireReportTimeZone(report.business.timezone);
    const month = businessMonthWindow(now, zone);
    const applied = report.decision.appliedRange;
    const { start, end, fromInputValue: from, toInputValue: to } = resolveReportDateRange(
      applied ? { from: applied.fromLocalDate, to: applied.toLocalDate } : undefined, month.startInclusive, now, zone,
    );
    const statement = await getIncomeStatementBreakdown(business.id, start, end);
    if (statement.cogs === null || statement.grossProfit === null || statement.netProfit === null) {
      profitFixHref = incomeStatementEntriesHref('grossProfit', from, to) + '&issues=1';
    }
  }
  const href=(cursor?:string,run=false)=>'/products/cost-resolution?'+new URLSearchParams({...cursor?{after:cursor}:{},...run?{review:'1'}:{}});
  const money=(amount:number)=>formatMoney(amount,business.currency);
  return <div className="space-y-4 min-w-0">
    <PageHeader title="Check stock costs" subtitle="Stock value check — these products have no confirmed stock value yet. This doesn't affect this month's profit." secondaryCta={{label:'← Products',href:'/products?issue=MISSING_COST'}} />
    {profitFixHref ? <Link className="inline-flex min-h-11 items-center font-semibold text-accent underline" href={profitFixHref}>Fixing this month&apos;s profit? Go to Fix missing costs →</Link> : null}
    <section className="card p-4 space-y-3">
      <p className="text-sm text-slate-600">Product and branch stock balances awaiting review</p>
      <p className="text-2xl font-semibold tabular-nums">{data.total}</p>
      <p className="text-sm">This is a separate stock value check, not an urgent list of sales blocking profit. You can review these products when you have time.</p>
      <div className="flex flex-wrap gap-3">
        <Link className="btn-secondary inline-flex min-h-11 items-center" href="/reports/income-statement">Check this month&apos;s profit first</Link>
        {!review && data.rows.length ? <Link className="btn-primary inline-flex min-h-11 items-center" href={href(after,true)}>Check these products →</Link> : null}
        {after ? <Link className="btn-secondary inline-flex min-h-11 items-center" href={href()}>Start again</Link> : null}
      </div>
    </section>
    <section className="space-y-3" aria-label="Stock evidence batch">
      {data.rows.map(row=><article key={row.id} className="card p-4 space-y-2">
        <h2 className="font-semibold break-words">{row.product.name}</h2>
        <p className="text-sm text-slate-600">{row.store.name} · Quantity {row.qtyOnHandBase} (stock units)</p>
        {row.preview?.status==='REVIEWABLE' ? <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-950">
          <p className="font-semibold">Evidence candidate — not posted</p>
          <p>Proposed stock value: {money(row.preview.stockValue)}</p>
          <p>Extra cost of earlier sales: {money(row.preview.cogsDelta)}</p>
          <p>{row.preview.corrections.length} affected sale {row.preview.corrections.length === 1 ? 'line' : 'lines'}</p>
        </div> : row.preview?.status==='BLOCKED' ? <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-950">
          <p className="font-semibold">We can&apos;t work this cost out automatically</p><p>{row.preview.reason}</p>
        </div> : <p className="text-sm">Not reviewed yet.</p>}
        <Link className="inline-flex min-h-11 items-center font-semibold text-accent underline" href={`/products/${encodeURIComponent(row.productId)}/cost-review/preview?${new URLSearchParams({storeId:row.storeId})}`}>Review proposed correction →</Link>
      </article>)}
      {!data.rows.length ? <p className="card p-4">No more unconfirmed stock positions in this queue.</p> : null}
    </section>
    {data.next ? <Link className="btn-secondary inline-flex min-h-11 items-center" href={href(data.next)}>Next batch →</Link> : null}
    <p className="text-xs text-slate-600">Read-only: stock quantity, balances, sales, customer payments and journals are never changed by this review.</p>
  </div>;
}
