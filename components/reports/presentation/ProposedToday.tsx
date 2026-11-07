'use client';

import Link from 'next/link';
import FinancialAmount from '@/components/reports/FinancialAmount';
import TodayHelpControl from '@/components/reports/TodayHelpControl';
import { CASH_ATTENTION_THRESHOLD_PENCE } from '@/lib/reports/today/attention';
import { paymentMixPresentation } from '@/lib/reports/today/method-share';
import {
  isQuietToday,
  type TodayNextAction,
  type TodaySnapshot,
} from '@/lib/reports/today/model';
import { CONSOLIDATED_LABEL } from '@/lib/reports/scope-labels';
import type { Stage3aLink, Stage3aSection } from '@/lib/reports/today/stage3a-nav';
import { ReportsCanvas } from '@/components/reports/presentation/canvas';
import { HubHead } from '@/components/reports/presentation/HubHead';

const FOCUS =
  'scroll-mb-[calc(var(--mobile-bottom-nav-height)+1.5rem)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

const MIX_BAR_COLORS = ['bg-accent', 'bg-sky-700', 'bg-emerald-700', 'bg-amber-700', 'bg-slate-500'];

export type ProposedTodayProps = {
  section?: Stage3aSection;
  scopeLabel: string;
  dateLabel: string;
  zoneName: string;
  updatedLabel: string;
  currency: string;
  storeId: string | null;
  salesHref: string | null;
  moneyHref: string | null;
  snapshot: TodaySnapshot;
  exploreLinks: Stage3aLink[];
  nextActions: TodayNextAction[];
  readOnly: boolean;
  onStay?: (event: React.MouseEvent<HTMLAnchorElement>) => void;
};

function HelpBody({ scopeLabel, zoneName }: { scopeLabel: string; zoneName: string }) {
  return (
    <>
      <p>Dates are the business local date in {zoneName}. The phone or browser clock is not used.</p>
      <p>
        {scopeLabel === CONSOLIDATED_LABEL
          ? `This page is ${scopeLabel}. Every figure uses only the branches this account is allowed to see.`
          : `This page is for ${scopeLabel}. Other branches are not included.`}
      </p>
      <p>Sales is the total of invoices, excluding voided and returned sales. Money received is confirmed payments, with completed refunds paid back today deducted. Pending Mobile Money is not included, and a returned sale is not deducted unless the refund was actually paid.</p>
      <p>Cash difference is the counted difference on tills closed today. An amount below GH₵5.00 stays in that figure and is not listed as needing attention.</p>
      <p>Estimated profit is shown only when every product cost is recorded. If a cost is missing, the profit figure is hidden.</p>
    </>
  );
}

export function ProposedToday(props: ProposedTodayProps) {
  const quiet = isQuietToday(props.snapshot);
  const localMarker = ' · Local time';
  const showsLocalTime = props.dateLabel.endsWith(localMarker);
  const dateLabel = showsLocalTime ? props.dateLabel.slice(0, -localMarker.length) : props.dateLabel;
  const updatedLabel = showsLocalTime ? `${props.updatedLabel}${localMarker}` : props.updatedLabel;
  return (
    <ReportsCanvas>
      <HubHead
        title="Today"
        section="today"
        storeId={props.storeId}
        dateLabel={dateLabel}
        scopeLabel={props.scopeLabel}
        updatedLabel={updatedLabel}
        showDate
        lead="Sales, confirmed money and counted cash."
        onStay={props.onStay}
      />
      {quiet ? (
        <QuietToday {...props} />
      ) : (
        <ActiveToday {...props} />
      )}
    </ReportsCanvas>
  );
}

function QuietToday(props: ProposedTodayProps) {
  const primary = props.nextActions[0];
  const later = props.nextActions.slice(1);
  return (
    <div className="mt-3 min-w-0" data-today-state="empty">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card" role="status" data-primary-card="true">
        <h2 className="font-display text-xl font-semibold text-ink" data-first-figure="true">No sales yet today</h2>
        <p className="mt-2 max-w-[65ch] text-sm leading-5 text-ink">
          No sales have been recorded for {props.scopeLabel} today. Once you make a sale, Today will show sales, confirmed money received, payment methods and anything needing attention.
        </p>
        {primary ? (
          <div className="mt-3 flex flex-col gap-2 lg:flex-row">
            <ActionLink action={primary} primary onStay={props.onStay} />
            {later.map((action) => (
              <ActionLink key={action.href} action={action} className="hidden lg:inline-flex" onStay={props.onStay} />
            ))}
          </div>
        ) : props.readOnly ? (
          <p className="mt-3 text-sm text-muted">Selling and stock changes stay off while the account is read-only.</p>
        ) : null}
        <p className="mt-3 max-w-[65ch] text-sm leading-6 text-muted">
          Nothing is wrong. This scope simply has no sales, confirmed receipts, closed till or items needing attention yet.
        </p>
      </section>
      <Explore links={props.exploreLinks} later={later} onStay={props.onStay} />
    </div>
  );
}

function ActionLink({
  action,
  primary = false,
  className = '',
  onStay,
}: {
  action: TodayNextAction;
  primary?: boolean;
  className?: string;
  onStay?: (event: React.MouseEvent<HTMLAnchorElement>) => void;
}) {
  return (
    <Link
      href={action.href}
      data-today-action="true"
      data-today-primary-action={primary ? 'true' : undefined}
      onClick={onStay}
      className={`${primary ? 'btn-primary' : 'btn-secondary'} inline-flex min-h-11 items-center justify-center ${FOCUS} ${className}`}
    >
      {action.label}
    </Link>
  );
}

function Explore({
  links,
  later,
  onStay,
}: {
  links: Stage3aLink[];
  later: TodayNextAction[];
  onStay?: (event: React.MouseEvent<HTMLAnchorElement>) => void;
}) {
  if (links.length === 0 && later.length === 0) return null;
  return (
    <section id="explore-reports" aria-labelledby="explore-reports-title" className="mt-4 min-w-0">
      <h2 id="explore-reports-title" className="font-display text-lg font-semibold text-ink">Other ways to get started</h2>
      <p className="mt-1 max-w-[65ch] text-sm text-muted">
        {later.length > 0 ? 'Stock changes and a few reports sit here.' : 'A few reports you can open from here.'}
      </p>
      {later.length > 0 ? (
        <div className="mt-3 flex flex-col gap-2 lg:hidden">
          {later.map((action) => (
            <ActionLink key={action.href} action={action} onStay={onStay} />
          ))}
        </div>
      ) : null}
      {links.length > 0 ? (
        <ul className="mt-3 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-card">
          {links.map((link) => (
            <li key={link.href} className="border-b border-slate-100 last:border-0">
              <Link href={link.href} data-today-action="true" onClick={onStay} className={`flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left hover:bg-slate-50 ${FOCUS}`}>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-ink">{link.label}</span>
                  <span className="block text-xs leading-5 text-muted">{link.purpose}</span>
                </span>
                <span className="shrink-0 text-slate-400" aria-hidden="true">›</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function ActiveToday(props: ProposedTodayProps) {
  const { snapshot, currency } = props;
  const cashDiff = snapshot.cashDifferencePence;
  const cashNeedsLook = cashDiff != null && Math.abs(cashDiff) >= CASH_ATTENTION_THRESHOLD_PENCE;
  const saleWord = snapshot.salesCount === 1 ? 'sale' : 'sales';
  const showWeek = snapshot.days.some((day) => day.salesPence !== 0);
  return (
    <div className="mt-1 min-w-0 space-y-3" data-today-state="ready">
      <div
        className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card md:grid md:grid-cols-3 md:gap-3 md:overflow-visible md:rounded-none md:border-0 md:bg-transparent md:shadow-none"
        data-reconciliation-grid=""
        data-primary-card="true"
      >
        <section className="min-w-0 px-4 pb-1 pt-1 md:rounded-2xl md:border md:border-slate-200 md:bg-white md:p-4 md:shadow-card" data-today-sales-card data-metric-block="sales">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Sales today</h2>
          <div className="mt-1 flex items-center justify-between gap-2">
            <div className="financial-fit min-w-0 flex-1" data-first-figure="true">
              <FinancialAmount pence={snapshot.salesTodayPence} currency={currency} variant="hero" />
            </div>
            {props.salesHref ? (
              <Link href={props.salesHref} onClick={props.onStay} className={`btn-secondary min-h-11 shrink-0 px-3 text-xs ${FOCUS}`}>
                Open trading
              </Link>
            ) : null}
          </div>
          <p className="mt-1 text-sm text-ink">
            {snapshot.salesCount} {saleWord}
            <span className="text-muted">
              {' · '}
              {snapshot.yesterdayPence === 0
                ? 'No sales yesterday.'
                : <>Yesterday <FinancialAmount pence={snapshot.yesterdayPence} currency={currency} variant="compact" /></>}
            </span>
          </p>
        </section>
        <section className="min-w-0 border-t border-slate-100 px-4 py-1 md:rounded-2xl md:border md:border-slate-200 md:bg-white md:p-4 md:shadow-card" data-metric-block="money">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Money received</h2>
            <p className="text-xs text-muted">Confirmed · not sales</p>
          </div>
          <div className="financial-fit mt-1 min-w-0" data-today-money>
            {props.moneyHref ? (
              <Link href={props.moneyHref} onClick={props.onStay} className={`block ${FOCUS}`}>
                <FinancialAmount pence={snapshot.moneyReceivedPence} currency={currency} variant="prominent" />
              </Link>
            ) : (
              <FinancialAmount pence={snapshot.moneyReceivedPence} currency={currency} variant="prominent" />
            )}
          </div>
        </section>
        <section data-metric-block="cash" className={`min-w-0 border-t px-4 py-1 md:rounded-2xl md:border md:p-4 md:shadow-card ${cashNeedsLook ? 'border-amber-200 bg-amber-50' : 'border-slate-100 md:border-slate-200 md:bg-white'}`}>
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Cash difference</h2>
            {cashDiff == null ? null : (
              <p className="text-xs text-muted">{cashNeedsLook ? 'Needs a look' : 'Within GH₵5.00'}</p>
            )}
          </div>
          {cashDiff == null ? (
            <p className="mt-2 text-sm text-ink">No till closed today</p>
          ) : (
            <div className="financial-fit mt-1 min-w-0" data-today-cash>
              <FinancialAmount pence={cashDiff} currency={currency} variant="prominent" />
            </div>
          )}
        </section>
      </div>
      <TodayHelpControl>
        <HelpBody scopeLabel={props.scopeLabel} zoneName={props.zoneName} />
      </TodayHelpControl>
      <Attention snapshot={snapshot} onStay={props.onStay} />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {showWeek ? <Week days={snapshot.days} currency={currency} /> : (
          <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-ink">Last seven dates</h2>
            <p className="mt-3 text-sm text-muted">No sales in the last seven dates.</p>
          </section>
        )}
        <Methods snapshot={snapshot} currency={currency} />
      </div>

      {snapshot.branches ? (
        <ul className="grid min-w-0 gap-2 sm:grid-cols-2">
          {snapshot.branches.map((branch) => (
            <li key={branch.storeId} className="min-w-0 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm">
              <span className="block truncate font-semibold text-ink">{branch.name}</span>
              <FinancialAmount pence={branch.salesPence} currency={currency} variant="compact" className="text-muted" />
            </li>
          ))}
        </ul>
      ) : null}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {snapshot.topProducts.length > 0 ? (
          <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
            <h2 className="text-sm font-semibold text-ink">Top products today</h2>
            <ol className="mt-2 space-y-2">
              {snapshot.topProducts.map((product) => (
                <li key={product.name} className="flex min-w-0 items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 break-words text-ink">{product.name}</span>
                  <FinancialAmount pence={product.salesPence} currency={currency} variant="compact" className="shrink-0 text-muted" />
                </li>
              ))}
            </ol>
          </section>
        ) : null}
        <Profit profit={snapshot.profit} currency={currency} comparison={snapshot.comparison} />
      </div>
    </div>
  );
}

function Attention({
  snapshot,
  onStay,
}: {
  snapshot: TodaySnapshot;
  onStay?: (event: React.MouseEvent<HTMLAnchorElement>) => void;
}) {
  return (
    <section aria-labelledby="today-attention" data-today-attention>
      <h2 id="today-attention" className="font-display text-base font-semibold text-ink">Needs attention</h2>
      {snapshot.attention.length === 0 ? (
        <p className="mt-2 flex min-h-11 items-center gap-2 rounded-xl border border-emerald-100 bg-white px-3 text-sm text-ink shadow-card">
          <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-emerald-100 px-1 text-xs font-bold text-emerald-800" aria-hidden="true">OK</span>
          Nothing needs attention right now.
        </p>
      ) : (
        <ul className="mt-2 space-y-2">
          {snapshot.attention.map((row) => (
            <li key={`${row.rank}-${row.title}`}>
              <Link href={row.href} onClick={onStay} className={`flex min-h-11 w-full items-center gap-3 rounded-xl border border-slate-200/80 bg-white px-3 py-2 shadow-sm hover:bg-slate-50 ${FOCUS}`}>
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold uppercase ${row.severity === 'high' ? 'bg-rose-50 text-rose-800' : 'bg-amber-50 text-amber-800'}`}>
                  {row.severity === 'high' ? 'High' : 'Check'}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block break-words text-sm font-semibold leading-5 text-ink">{row.title}</span>
                  <span className="block break-words text-xs leading-5 text-muted">{row.detail}</span>
                </span>
                <span className="shrink-0 text-sm font-semibold text-accent">{row.action}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Week({ days, currency }: { days: TodaySnapshot['days']; currency: string }) {
  const peak = Math.max(1, ...days.map((day) => day.salesPence));
  return (
    <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
      <h2 className="text-sm font-semibold text-ink">Last seven dates</h2>
      <ul className="mt-3 space-y-3">
        {days.map((day) => (
          <li key={day.key} className="min-w-0 text-sm">
            <div className="flex min-w-0 items-baseline justify-between gap-3">
              <span className="shrink-0 text-muted">{day.label}</span>
              <span className="min-w-0 text-right">
                <FinancialAmount pence={day.salesPence} currency={currency} variant="compact" />
              </span>
            </div>
            <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
              <span className="block h-1.5 rounded-full bg-accent" style={{ width: `${Math.round((day.salesPence / peak) * 100)}%` }} />
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Methods({ snapshot, currency }: { snapshot: TodaySnapshot; currency: string }) {
  const mix = paymentMixPresentation(snapshot.methods.map((row) => row.amountPence));
  const total = snapshot.methods.reduce((sum, row) => sum + row.amountPence, 0);
  return (
    <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
      <h2 className="text-sm font-semibold text-ink">Payment methods</h2>
      {snapshot.methods.length === 0 ? (
        <p className="mt-3 text-sm text-muted">No confirmed payments yet today, so there is no payment mix.</p>
      ) : (
        <>
          {mix.showBar ? (
            <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-slate-100" data-payment-mix-bar="visible" aria-hidden="true">
              {snapshot.methods.map((row, index) => (
                row.amountPence > 0 ? (
                  <span
                    key={row.method}
                    className={`block h-2 ${MIX_BAR_COLORS[index % MIX_BAR_COLORS.length]}`}
                    style={{ width: `${(row.amountPence / total) * 100}%` }}
                  />
                ) : null
              ))}
            </div>
          ) : null}
          <ul className="mt-3 space-y-2">
            {snapshot.methods.map((row, index) => {
              const share = mix.shares[index];
              return (
                <li key={row.method} className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="text-ink">{row.label}</span>
                  <span className="shrink-0 text-right">
                    <FinancialAmount pence={row.amountPence} currency={currency} variant="compact" />
                    {share == null ? null : <span> · {share}%</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}

function Profit({
  profit,
  currency,
  comparison,
}: {
  profit: TodaySnapshot['profit'];
  currency: string;
  comparison: TodaySnapshot['comparison'];
}) {
  if (profit.state === 'omitted' && !comparison) return null;
  return (
    <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
      <h2 className="text-sm font-semibold text-ink">Profit</h2>
      {comparison ? (
        comparison.last30Pence === 0 && comparison.previous30Pence === 0 ? (
          <p className="mt-2 max-w-[65ch] text-sm text-ink">There is no earlier 30-day period with sales to compare.</p>
        ) : (
          <p className="mt-2 max-w-[65ch] text-sm text-ink">
            Last 30 days <FinancialAmount pence={comparison.last30Pence} currency={currency} variant="compact" /> · previous{' '}
            <FinancialAmount pence={comparison.previous30Pence} currency={currency} variant="compact" />
          </p>
        )
      ) : null}
      {profit.state === 'incomplete' ? (
        <p className="mt-2 max-w-[65ch] text-sm text-ink" data-profit-state="incomplete">Profit is hidden because some product costs are missing.</p>
      ) : profit.state === 'ready' && profit.grossProfitPence != null ? (
        <p className="mt-2 max-w-[65ch] text-sm text-ink" data-profit-state="ready">
          Estimated gross profit today <FinancialAmount pence={profit.grossProfitPence} currency={currency} variant="compact" />. Every product cost used here is recorded.
        </p>
      ) : null}
    </section>
  );
}
