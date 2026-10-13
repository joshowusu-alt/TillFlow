import Link from 'next/link';
import PageHeader from '@/components/PageHeader';
import { openLiveReport } from '@/lib/entitlements/live-report';
import { prisma } from '@/lib/prisma';
import { formatMoney } from '@/lib/format';
import { formatBusinessLocalDateKey } from '@/lib/notifications/utils';
import { getMonthlyAccountEntries, getMonthlyBalanceReview, monthlyReviewWindow } from '@/lib/reports/monthly-balance-review';

export const dynamic = 'force-dynamic';

export default async function MonthlyBalanceReviewPage({ searchParams }: { searchParams?: { month?: string; account?: string; page?: string } }) {
  const now = new Date();
  const opened = await openLiveReport({
    surfaceId: 'monthly_balance_review', search: searchParams,
    range: ({ timezone }) => {
      const selected = searchParams?.month ?? formatBusinessLocalDateKey(now, timezone).slice(0, 7);
      try {
        const window = monthlyReviewWindow(selected, timezone, now);
        return { fromLocalDate: `${selected}-01`, toLocalDate: formatBusinessLocalDateKey(new Date(window.endExclusive.getTime() - 1), timezone), preset: 'CUSTOM' };
      } catch {
        return { fromLocalDate: `${selected}-01`, toLocalDate: `${selected}-01`, preset: 'CUSTOM' };
      }
    },
  });
  if (!opened.ok) return opened.denial;
  const { business } = opened;
  const timezone = business.timezone!;
  const month = searchParams?.month ?? formatBusinessLocalDateKey(now, timezone).slice(0, 7);
  try { monthlyReviewWindow(month, timezone, now); } catch {
    return <div className="card p-5"><h1 className="text-xl font-semibold">Choose a valid month</h1><p>Select a month that has started.</p><Link className="btn-secondary mt-3" href="/payments/reconciliation/balances">Back to monthly review</Link></div>;
  }
  const requestedPage = Number(searchParams?.page ?? '1');
  const validPage = Number.isSafeInteger(requestedPage) && requestedPage >= 1 && requestedPage <= 1000000;
  // One consistent read: a backdated posting must not land between opening,
  // movement and detail reads and create a misleading comparison.
  const { review, entries } = await prisma.$transaction(async tx => {
    const snapshot = await getMonthlyBalanceReview(tx, business.id, month, timezone, now);
    const validAccount = searchParams?.account && snapshot.rows.some(row => row.code === searchParams.account);
    const detail = validAccount && validPage ? await getMonthlyAccountEntries(tx, business.id, searchParams!.account!, month, timezone, now, requestedPage) : null;
    return { review: snapshot, entries: detail };
  }, { isolationLevel: 'Serializable', maxWait: 5000, timeout: 15000 });
  const money = (amount: number) => formatMoney(amount, business.currency);
  const openingDate = formatBusinessLocalDateKey(new Date(review.window.start.getTime() - 1), timezone);
  return <div className="space-y-5">
    <PageHeader title="Monthly balance review" subtitle="Compare recorded balances with your statements and supporting records." secondaryCta={{ label: 'Back to reconciliation', href: '/payments/reconciliation' }} />
    <div className="card space-y-2 p-5">
      <p className="font-semibold">Awaiting evidence — balances are not yet reconciled</p>
      <p className="text-sm text-black/70">Whole business · all branches · {business.timezone}. {review.window.partial ? `Partial month through ${review.throughLocalDate}; later entries are excluded.` : `Complete calendar month through ${review.throughLocalDate}.`}</p>
      <p className="text-sm text-black/70">These are ledger balances. Matching totals alone does not confirm cash, stock or debts. This page makes no corrections and does not mark a month reconciled.</p>
    </div>
    <form method="GET" className="card flex flex-wrap items-end gap-3 p-4">
      <div><label className="label" htmlFor="review-month">Month</label><input className="input" id="review-month" type="month" name="month" defaultValue={month} required /></div>
      <button className="btn-secondary" type="submit">Review month</button>
    </form>
    <div className="card space-y-2 p-5">
      <h2 className="font-semibold">Differences to investigate</h2>
      <p>Month’s debits minus credits: <strong>{money(review.movementDifferencePence)}</strong></p>
      <p>Closing debit balances minus credit balances: <strong>{money(review.closingDifferencePence)}</strong></p>
      <p className="text-sm text-black/70">Zero means the recorded entries balance mathematically. It does not mean they match statements or that every transaction was recorded.</p>
      {review.legacyCapitalPence !== 0 ? <p className="text-sm text-amber-800">A legacy opening-capital field of {money(review.legacyCapitalPence)} also exists. It is not added to these ledger balances; its date, supporting evidence and possible overlap with opening journals need review.</p> : null}
    </div>
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">Recorded account balances</h2>
      <p className="text-sm text-black/70">Assets and expenses show debit balances as positive. Liabilities, equity and income show credit balances as positive. Negative balances remain visible.</p>
      {review.rows.length === 0 ? <p className="card p-5">No ledger accounts found. No balance is confirmed.</p> : review.rows.map(row => <article key={row.id} className="card p-4">
        <h3 className="font-semibold">{row.name} <span className="text-sm text-black/50">({row.code})</span></h3>
        <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div><dt className="text-xs text-black/60">Opening</dt><dd className="font-semibold">{money(row.openingPence)}</dd></div>
          <div><dt className="text-xs text-black/60">Debits in month</dt><dd>{money(row.debitPence)}</dd></div>
          <div><dt className="text-xs text-black/60">Credits in month</dt><dd>{money(row.creditPence)}</dd></div>
          <div><dt className="text-xs text-black/60">Closing</dt><dd className="font-semibold">{money(row.closingPence)}</dd></div>
        </dl>
        <Link className="btn-ghost mt-3 text-sm" href={`/payments/reconciliation/balances?month=${encodeURIComponent(month)}&account=${row.code}#account-entries`}>View recorded entries</Link>
      </article>)}
    </div>
    {searchParams?.account && !entries ? <p role="alert" className="card p-4">Choose an account shown above and a valid page.</p> : null}
    {entries ? <section id="account-entries" className="card space-y-3 p-5">
      <h2 className="text-lg font-semibold">{entries.account.name}: recorded entries</h2>
      <p className="text-sm text-black/70">{entries.total} entries in this month · showing up to {entries.pageSize} per page. Month totals above include all entries, not just this page.</p>
      {entries.rows.length === 0 ? <p>No entries on this page.</p> : entries.rows.map(line => <article key={line.id} className="space-y-1 rounded-xl border border-black/10 p-3">
        <p className="text-xs text-black/60">{new Intl.DateTimeFormat('en-GB', { timeZone: timezone, dateStyle: 'medium', timeStyle: 'short' }).format(line.journalEntry.entryDate)}</p>
        <p className="font-semibold break-words">{line.journalEntry.description}</p>
        <p className="text-sm">Debit {money(line.debitPence)} · Credit {money(line.creditPence)}</p>
        {line.memo ? <p className="text-sm break-words">{line.memo}</p> : null}
        <p className="text-xs text-black/60 break-all">Record: {line.journalEntry.referenceType ?? 'Journal'} {line.journalEntry.referenceId ?? line.id}</p>
      </article>)}
      <div className="flex flex-wrap gap-3">
        {entries.page > 1 ? <Link className="btn-secondary" href={`/payments/reconciliation/balances?month=${encodeURIComponent(month)}&account=${entries.account.code}&page=${entries.page - 1}#account-entries`}>Previous entries</Link> : null}
        {entries.page * entries.pageSize < entries.total ? <Link className="btn-secondary" href={`/payments/reconciliation/balances?month=${encodeURIComponent(month)}&account=${entries.account.code}&page=${entries.page + 1}#account-entries`}>Next entries</Link> : null}
      </div>
    </section> : null}
    <div className="card space-y-3 p-5">
      <h2 className="font-semibold">Evidence needed for this month</h2>
      <p className="text-sm">Bank and MoMo: statements with opening and closing balances, receipts, payments, fees and transfers. The Bank ledger currently combines electronic money; it does not establish a separate balance for each bank account or wallet.</p>
      <p className="text-sm">Cash: till counts and shift records. Stock: dated counts and confirmed costs. Customers and suppliers: invoices, returns, receipts and payments supporting the outstanding balances.</p>
      <p className="text-sm">Start with balances at the end of {openingDate}. Missing historical counts must remain an evidence gap. This page does not accept or store statements yet.</p>
      <Link className="btn-secondary" href="/payments/reconciliation/card-transfer">Review daily card and transfer receipts</Link>
    </div>
  </div>;
}
