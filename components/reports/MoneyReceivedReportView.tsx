import Link from 'next/link';
import type { ReactNode } from 'react';
import { formatMoney } from '@/lib/format';
import type { MoneyReceivedBundle } from '@/lib/reports/money-received/service';
import type { DrillPageResult } from '@/lib/reports/money-received/query';
import type { MoneyReceivedMetricId, ReconcileResult } from '@/lib/reports/money-received/types';
import { classifyMoneyReceivedRowKind, moneyReceivedRowKindHint, moneyReceivedRowKindLabel } from '@/lib/reports/money-received/display';
import { methodLabel } from '@/lib/reports/money-received/reconcile';
import { reportPeriodOptions, readableReportPeriod } from './PeriodChips';
import ReportsDestinationHead from './ReportsDestinationHead';
import ReportsRefresh from './ReportsRefresh';
import ReportFilterCard from './ReportFilterCard';
import ReportTableCard from './ReportTableCard';
import ResponsiveDataTable from '@/components/ResponsiveDataTable';
import Pagination from '@/components/Pagination';

export const MONEY_DRILL_OPTIONS: { id: MoneyReceivedMetricId; label: string }[] = [
  { id: 'money_received', label: 'All money received' },
  { id: 'money_received_cash', label: 'Cash' },
  { id: 'money_received_momo', label: 'Mobile Money' },
  { id: 'money_received_card', label: 'Card' },
  { id: 'money_received_transfer', label: 'Bank transfer' },
  { id: 'money_received_other', label: 'Other methods' },
  { id: 'unverified_legacy_receipts', label: 'Needs MoMo confirmation' },
  { id: 'refund_outflows', label: 'Refund outflows' },
];
const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

export default function MoneyReceivedReportView({ bundle, drill, metric, from, to, now, periodChip, storeId, scopeLabel, choices, offerAll, pageSize, actions }: {
  bundle: MoneyReceivedBundle;
  drill: { page: DrillPageResult; reconcile: ReconcileResult };
  metric: MoneyReceivedMetricId;
  from: string; to: string; now: Date; periodChip?: string;
  storeId: string; scopeLabel: string; choices: { id: string; name: string }[]; offerAll: boolean;
  pageSize: number; actions?: ReactNode;
}) {
  const { currency, timeZone } = bundle.scope;
  const failed = bundle.quality.overall === 'QUERY_FAILED';
  const detailFailed = drill.page.queryFailed || drill.reconcile.reason === 'QUERY_FAILED';
  const amount = (id: MoneyReceivedMetricId) => failed || bundle.byId[id]?.valuePence == null
    ? 'Unavailable' : formatMoney(bundle.byId[id].valuePence!, currency);
  const query = (start: string, end: string, selected: MoneyReceivedMetricId = metric, chip?: string) =>
    '?' + new URLSearchParams({ from: start, to: end, storeId, metric: selected, pageSize: String(pageSize), ...(chip ? { periodChip: chip } : {}) });
  const momoHref = '/reports/momo-confirmation?' + new URLSearchParams({ from, to, storeId });
  const selectedLabel = metric === 'money_received' ? 'Recent payments' : MONEY_DRILL_OPTIONS.find(x => x.id === metric)?.label ?? 'Payments';
  const presets = reportPeriodOptions(now, timeZone);
  const active = periodChip === 'custom' ? 'custom' : (presets.find(x => x.key === periodChip && x.from === from && x.to === to) ?? presets.find(x => x.from === from && x.to === to))?.key ?? 'custom';
  const rows = drill.page.rows.map(row => {
    const kind = classifyMoneyReceivedRowKind(row);
    return { key: row.sourceType + ':' + row.sourceId,
      when: row.eventAt.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone }),
      kind: moneyReceivedRowKindLabel(kind), hint: moneyReceivedRowKindHint(kind),
      method: row.method ? methodLabel(row.method) : '—', sale: row.transactionNumber ?? '—',
      value: formatMoney(row.amountPence, currency), negative: row.amountPence < 0 };
  });
  return <div className="min-w-0 space-y-4" data-money-received-view>
    <ReportsDestinationHead title="Money received" scopeLabel={scopeLabel} periodLabel={readableReportPeriod(from, to)} showRefresh={false} />
    <section aria-label="Confirmed payments" data-first-figure className="min-w-0 rounded-2xl bg-gradient-to-br from-[#172554] to-accent p-4 text-white shadow-card sm:p-6">
      <h2 className="text-sm font-semibold text-blue-100">Confirmed payments</h2>
      <p className="mt-2 text-3xl font-bold leading-tight tabular-nums [overflow-wrap:anywhere] sm:text-4xl">{amount('money_received')}</p>
      <p className="mt-1 text-xs text-blue-100">Full refunds are shown separately.</p>
    </section>
    {failed ? <div role="alert" className="space-y-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900"><p>Money received could not be loaded. Refresh to try again.</p><ReportsRefresh fetchedAt={now.toISOString()} compact /></div> : null}
    <div className="grid grid-cols-2 gap-2 sm:gap-3">
      <Link href={query(from, to, 'refund_outflows') + '#payments'} className={`min-w-0 rounded-xl border border-slate-200 bg-white p-3 ${FOCUS}`}>
        <p className="text-xs font-semibold text-muted">Refunds paid</p>
        <p className="mt-1 text-lg font-bold tabular-nums [overflow-wrap:anywhere]">{amount('refund_outflows')}</p>
        <span className="text-xs text-accent">View refunds →</span>
      </Link>
      <Link href={momoHref} className={`min-w-0 rounded-xl border p-3 ${bundle.quality.legacyWarning ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-slate-200 bg-white'} ${FOCUS}`}>
        <p className="text-xs font-semibold">MoMo awaiting confirmation</p>
        <p className="mt-1 text-lg font-bold tabular-nums [overflow-wrap:anywhere]">{amount('unverified_legacy_receipts')}</p>
        <span className="text-xs font-medium">Not included · Review →</span>
      </Link>
    </div>
    {!failed && !bundle.methodReconcile.ok ? <p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Payment totals need checking. See More options for details.</p> : null}
    <section aria-label="Payment breakdown" className="min-w-0 rounded-2xl border border-slate-200 bg-white p-3 shadow-card sm:p-4">
      <h2 className="font-semibold text-ink">Payment breakdown</h2>
      <div className="mt-2 grid grid-cols-2 gap-2 lg:grid-cols-5">
        {MONEY_DRILL_OPTIONS.slice(1, 6).map(({ id, label }) => <Link key={id} href={query(from, to, id) + '#payments'} aria-current={metric === id ? 'page' : undefined}
          className={`min-h-11 min-w-0 rounded-lg border px-2.5 py-2 ${metric === id ? 'border-accent bg-accentSoft' : 'border-slate-200'} ${FOCUS}`}>
          <p className="text-xs font-medium text-muted">{label}</p>
          <p className="mt-1 font-semibold tabular-nums [overflow-wrap:anywhere]">{amount(id)}</p>
        </Link>)}
      </div>
    </section>
    <nav aria-label="Report period" className="flex flex-wrap gap-2">
      {[...presets, { key:'custom', label:'Custom', from, to }].map(option => <Link key={option.key}
        href={query(option.from, option.to, metric, option.key) + (option.key === 'custom' ? '#money-options' : '')}
        aria-current={active === option.key ? 'page' : undefined}
        className={`inline-flex min-h-11 items-center rounded-xl border px-3 text-sm font-semibold ${active === option.key ? 'border-accent bg-accent text-white' : 'border-slate-200 bg-white text-ink'} ${FOCUS}`}>{option.label}</Link>)}
    </nav>
    <details id="money-options" open={periodChip === 'custom' || undefined} className="min-w-0 rounded-xl border border-slate-200 bg-white px-3">
      <summary className={`min-h-11 cursor-pointer py-3 text-sm font-semibold text-accent ${FOCUS}`}>More options</summary>
      <div className="space-y-3 pb-3">
        <ReportFilterCard columnsClassName="sm:grid-cols-2 lg:grid-cols-5" submitLabel="Apply" submitExtraClassName="min-h-11">
          <input type="hidden" name="pageSize" value={pageSize} />
          {choices.length > 1 || offerAll ? <div><label className="label" htmlFor="storeId">Branch</label>
            <select id="storeId" className="input min-h-11 w-full" name="storeId" defaultValue={storeId}>
              {offerAll ? <option value="ALL">Consolidated — all branches</option> : null}
              {choices.map(choice => <option key={choice.id} value={choice.id}>{choice.name}</option>)}
            </select></div> : <input type="hidden" name="storeId" value={storeId} />}
          <div><label className="label" htmlFor="from">From</label><input id="from" className="input min-h-11 w-full" type="date" name="from" defaultValue={from} required /></div>
          <div><label className="label" htmlFor="to">To</label><input id="to" className="input min-h-11 w-full" type="date" name="to" defaultValue={to} required /></div>
          <div><label className="label" htmlFor="metric">Show transactions for</label><select id="metric" className="input min-h-11 w-full" name="metric" defaultValue={metric}>{MONEY_DRILL_OPTIONS.map(opt => <option key={opt.id} value={opt.id}>{opt.label}</option>)}</select></div>
        </ReportFilterCard>
        {actions}
        <div className="space-y-1 text-sm text-muted">
          <p>Confirmed payments are separate from sales totals and refunds. Sale edits that return money reduce confirmed payments; completed refunds are shown separately. Reports Today shows money received after completed refunds.</p>
          <p>{scopeLabel} · {from} to {to} ({timeZone})</p>
          <p>Method check: {failed ? 'Unavailable' : bundle.methodReconcile.ok ? 'Balances' : 'Check needed — ' + (bundle.methodReconcile.reason ?? 'Method totals do not match')}</p>
          {!drill.reconcile.ok && <p>Detail check: {drill.reconcile.reason ?? 'Needs review'}</p>}
          {bundle.quality.legacyWarning && <p>Payments awaiting MoMo confirmation are excluded from confirmed payments.</p>}
        </div>
      </div>
    </details>
    <section id="payments" aria-label="Payment records" className="min-w-0 scroll-mt-48 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold text-ink">{selectedLabel}</h2>
        {metric !== 'money_received' && <Link href={query(from, to, 'money_received') + '#payments'} className={`inline-flex min-h-11 items-center text-sm font-semibold text-accent ${FOCUS}`}>Show all →</Link>}
      </div>
      {detailFailed || failed ? <div role="alert" className="space-y-2 rounded-xl bg-rose-50 p-3 text-sm text-rose-900"><p>Payment records could not be loaded. Please refresh.</p>{!failed && <ReportsRefresh fetchedAt={now.toISOString()} compact />}</div> :
        <p className="text-sm text-muted [overflow-wrap:anywhere]">{drill.page.totalCount} matching {drill.page.totalCount === 1 ? 'transaction' : 'transactions'} · {amount(metric)} · Page {drill.page.page} of {drill.page.totalPages}</p>}
      {!detailFailed && !failed && !drill.reconcile.ok && <p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">These records need checking. See More options for details.</p>}
      {!detailFailed && !failed && rows.length === 0 ? <p className="rounded-xl bg-white p-4 text-sm text-muted">No transactions for this period and selection.</p> : null}
      {!detailFailed && !failed && rows.length > 0 && <ResponsiveDataTable mode="cards"
        mobile={<ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white px-3">{rows.map(row => <li key={row.key} className="min-w-0 py-3">
          <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-1"><span className="font-semibold text-ink">{row.method} · {row.kind}</span><span className={`font-bold tabular-nums [overflow-wrap:anywhere] ${row.negative ? 'text-rose-700' : 'text-ink'}`}>{row.value}</span></div>
          <p className="mt-1 text-xs text-muted [overflow-wrap:anywhere]">{row.when} · Sale {row.sale}</p>
          {row.hint && <p className="mt-1 text-xs text-muted">{row.hint}</p>}
        </li>)}</ul>}
        desktop={<ReportTableCard><thead><tr><th>When</th><th>Type</th><th>Method</th><th>Sale</th><th className="text-right">Amount</th></tr></thead><tbody>{rows.map(row => <tr key={row.key}><td>{row.when}</td><td>{row.kind}{row.hint && <span className="block text-xs text-muted">{row.hint}</span>}</td><td>{row.method}</td><td>{row.sale}</td><td className={`text-right tabular-nums ${row.negative ? 'text-rose-700' : 'text-ink'}`}>{row.value}</td></tr>)}</tbody></ReportTableCard>} />}
      {!detailFailed && !failed && <Pagination currentPage={drill.page.page} totalPages={drill.page.totalPages} basePath="/reports/money-received" pageSize={pageSize} searchParams={{ from, to, storeId, metric }} />}
    </section>
  </div>;
}
