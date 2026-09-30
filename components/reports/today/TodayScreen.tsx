import Link from 'next/link';
import NavIcon from '@/components/navigation/NavIcon';
import FinancialAmount from '@/components/reports/FinancialAmount';
import ReportsSectionHead from '@/components/reports/ReportsSectionHead';
import TodayHelpControl from '@/components/reports/TodayHelpControl';
import { CASH_ATTENTION_THRESHOLD_PENCE } from '@/lib/reports/today/attention';
import { CONSOLIDATED_LABEL } from '@/lib/reports/scope-labels';
import {
  isQuietToday,
  todayPartialKinds,
  type TodayNextAction,
  type TodaySnapshot,
} from '@/lib/reports/today/model';
import {
  activityGroupHeading,
  stage3aSection,
  withStoreScope,
  type Stage3aLink,
  type Stage3aSection,
} from '@/lib/reports/today/stage3a-nav';
import RefreshToday from '@/components/reports/today/RefreshToday';

const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

export function TodayLoading() {
  return (
    <div className="mx-auto min-w-0 max-w-6xl overflow-x-hidden px-4 py-6" aria-busy="true" aria-live="polite">
      <h1 className="font-display text-2xl font-semibold text-ink">Today</h1>
      <p className="mt-4 text-sm text-muted">Loading Today</p>
    </div>
  );
}

export type TodayScreenProps = {
  section: Stage3aSection;
  scopeLabel: string;
  dateLabel: string;
  zoneName: string;
  updatedLabel: string;
  readOnly: boolean;
  currency: string;
  storeId: string | null;
  links: Stage3aLink[];
  exploreLinks?: Stage3aLink[];
  nextActions?: TodayNextAction[];
  salesHref: string | null;
  moneyHref?: string | null;
  cashHref?: string | null;
  snapshot: TodaySnapshot | null;
  blocked: { title: string; body: string; href: string; action: string } | null;
  failed: boolean;
};

function TodayHelpBody({ scopeLabel, zoneName }: { scopeLabel: string; zoneName: string }) {
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

export default function TodayScreen(props: TodayScreenProps) {
  const section = stage3aSection(props.section);
  const title = section === 'today' ? 'Today' : section === 'activity' ? 'Activity' : 'More reports';
  return (
    <div className="mx-auto min-w-0 max-w-6xl overflow-x-hidden px-4 py-3 sm:px-6 sm:py-6">
      <ReportsSectionHead
        title={title}
        section={section}
        storeId={props.storeId}
        dateLabel={props.dateLabel}
        scopeLabel={props.scopeLabel}
        updatedLabel={props.failed ? '' : props.updatedLabel}
        showDate={section === 'today'}
        help={section === 'today' ? (
          <TodayHelpControl>
            <TodayHelpBody scopeLabel={props.scopeLabel} zoneName={props.zoneName} />
          </TodayHelpControl>
        ) : undefined}
      />
      {props.readOnly ? (
        <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950" role="status">
          Read-only. You can look at reports. Downloads and changes stay off until billing is sorted.
        </p>
      ) : null}
      {props.failed ? <TodayFailed /> : null}
      {props.blocked ? <BlockedPanel blocked={props.blocked} /> : null}
      {!props.failed && !props.blocked && section === 'today' && props.snapshot ? (
        <TodayBody {...props} snapshot={props.snapshot} />
      ) : null}
      {!props.failed && !props.blocked && section !== 'today' ? (
        <SectionLanding section={section} links={props.links} />
      ) : null}
    </div>
  );
}

function TodayFailed() {
  return (
    <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-card" role="alert">
      <h2 className="font-display text-xl font-semibold text-ink">Today could not be loaded</h2>
      <p className="mt-2 text-sm text-muted">The figures were not loaded. Refresh to try this scope again.</p>
      <div className="mt-4">
        <RefreshToday retry />
      </div>
    </div>
  );
}

function BlockedPanel({ blocked }: { blocked: NonNullable<TodayScreenProps['blocked']> }) {
  return (
    <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-card" role="status">
      <h2 className="font-display text-xl font-semibold text-ink">{blocked.title}</h2>
      <p className="mt-2 max-w-xl text-sm text-muted">{blocked.body}</p>
      <Link href={blocked.href} className={`btn-primary mt-4 inline-flex min-h-11 items-center ${FOCUS}`}>
        {blocked.action}
      </Link>
    </div>
  );
}

function TodayBody(props: TodayScreenProps & { snapshot: TodaySnapshot }) {
  if (isQuietToday(props.snapshot)) {
    return (
      <QuietToday
        scopeLabel={props.scopeLabel}
        nextActions={props.nextActions ?? []}
        exploreLinks={props.exploreLinks ?? []}
        readOnly={props.readOnly}
      />
    );
  }
  return <ActiveToday {...props} />;
}

function QuietToday({
  scopeLabel,
  nextActions,
  exploreLinks,
  readOnly,
}: {
  scopeLabel: string;
  nextActions: TodayNextAction[];
  exploreLinks: Stage3aLink[];
  readOnly: boolean;
}) {
  return (
    <div className="mt-3 min-w-0 space-y-3 sm:mt-6 sm:space-y-4" data-today-state="empty">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card sm:p-6" role="status">
        <h2 className="font-display text-xl font-semibold text-ink">No sales yet today</h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-ink">
          No sales have been recorded for {scopeLabel} today. Once you make a sale, Today will show sales, confirmed money received, payment methods and anything needing attention.
        </p>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
          Nothing is wrong. This scope simply has no sales, confirmed receipts, closed till or items needing attention yet.
        </p>
        {nextActions.length > 0 ? (
          <div className="mt-3 flex flex-col gap-2 sm:mt-5 sm:flex-row">
            {nextActions.map((action, index) => (
              <Link
                key={action.href}
                href={action.href}
                data-today-primary-action={index === 0 ? 'true' : undefined}
                className={`${index === 0 ? 'btn-primary' : 'btn-secondary'} inline-flex min-h-11 items-center justify-center ${FOCUS}`}
              >
                {action.label}
              </Link>
            ))}
          </div>
        ) : readOnly ? (
          <p className="mt-4 text-sm text-muted">Selling and stock changes stay off while the account is read-only.</p>
        ) : null}
      </section>
      <ExploreReports links={exploreLinks} />
    </div>
  );
}

function ExploreReports({ links }: { links: Stage3aLink[] }) {
  if (links.length === 0) return null;
  return (
    <section id="explore-reports" aria-labelledby="explore-reports-title" className="min-w-0">
      <h2 id="explore-reports-title" className="font-display text-lg font-semibold text-ink">Next steps</h2>
      <p className="mt-1 max-w-2xl text-sm text-muted">A few reports you can open from here.</p>
      <ul className="mt-3 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-card">
        {links.map((link) => (
          <li key={link.href} className="border-b border-slate-100 last:border-0">
            <Link href={link.href} className={`flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left hover:bg-slate-50 ${FOCUS}`}>
              <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accentSoft text-accent">
                <NavIcon iconKey={link.iconKey} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-ink">{link.label}</span>
                <span className="block text-xs leading-5 text-muted">{link.purpose}</span>
              </span>
              <span className="shrink-0 text-slate-400" aria-hidden="true">›</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ActiveToday(props: TodayScreenProps & { snapshot: TodaySnapshot }) {
  const { snapshot, currency } = props;
  const partial = todayPartialKinds(snapshot);
  const salesKnownZero = snapshot.salesCount === 0 && snapshot.salesTodayPence === 0;
  const receiptsKnownZero = snapshot.moneyReceivedPence === 0 && snapshot.methods.length === 0;
  const saleWord = snapshot.salesCount === 1 ? 'sale' : 'sales';
  const showWeek = snapshot.days.some((day) => day.salesPence !== 0);
  const cashDiff = snapshot.cashDifferencePence;
  const cashNeedsLook = cashDiff != null && Math.abs(cashDiff) >= CASH_ATTENTION_THRESHOLD_PENCE;
  return (
    <div className="mt-6 min-w-0" data-today-state={partial.length > 0 ? 'partial' : 'ready'} data-partial={partial.join(' ')}>
      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(16rem,0.85fr)] lg:items-start">
        <section data-today-sales-card className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-card sm:p-5">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Sales today</p>
            {props.salesHref ? (
              <Link href={props.salesHref} data-today-primary-action className={`btn-secondary shrink-0 px-3 text-xs ${FOCUS}`}>
                Open trading
              </Link>
            ) : null}
          </div>
          {salesKnownZero ? (
            <p className="mt-2 text-base font-semibold text-ink">No sales recorded yet today</p>
          ) : props.salesHref ? (
            <Link href={props.salesHref} className={`mt-1 block min-w-0 financial-fit ${FOCUS}`}>
              <FinancialAmount pence={snapshot.salesTodayPence} currency={currency} variant="hero" />
            </Link>
          ) : (
            <div className="mt-1 min-w-0 financial-fit">
              <FinancialAmount pence={snapshot.salesTodayPence} currency={currency} variant="hero" />
            </div>
          )}
          {salesKnownZero ? null : (
            <p className="mt-2 text-sm text-ink">{snapshot.salesCount} {saleWord}</p>
          )}
          <p className="mt-1 text-sm text-muted">
            {snapshot.yesterdayPence === 0 ? 'No sales yesterday.' : <>Yesterday <FinancialAmount pence={snapshot.yesterdayPence} currency={currency} variant="compact" /></>}
          </p>
          <div className="mt-3 grid min-w-0 gap-2 border-t border-slate-100 pt-3 sm:grid-cols-2">
            {props.moneyHref ? (
              <Link href={props.moneyHref} className={`min-w-0 rounded-xl bg-slate-50 px-3 py-2 text-left hover:bg-slate-100 ${FOCUS}`}>
                <span className="text-xs font-semibold uppercase tracking-wide text-muted">Money received</span>
                {receiptsKnownZero ? (
                  <p className="mt-1 text-sm text-ink">No confirmed payments yet today</p>
                ) : (
                  <>
                    <div className="mt-1 min-w-0 financial-fit" data-today-money>
                      <FinancialAmount pence={snapshot.moneyReceivedPence} currency={currency} variant="prominent" />
                    </div>
                    <p className="mt-0.5 text-xs text-muted">Confirmed · not sales</p>
                  </>
                )}
              </Link>
            ) : (
              <div className="min-w-0 rounded-xl bg-slate-50 px-3 py-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted">Money received</span>
                {receiptsKnownZero ? (
                  <p className="mt-1 text-sm text-ink">No confirmed payments yet today</p>
                ) : (
                  <div className="mt-1 min-w-0 financial-fit" data-today-money>
                    <FinancialAmount pence={snapshot.moneyReceivedPence} currency={currency} variant="prominent" />
                  </div>
                )}
              </div>
            )}
            <div className={`min-w-0 rounded-xl px-3 py-2 ${cashNeedsLook ? 'bg-amber-50' : 'bg-slate-50'}`}>
              <span className="text-xs font-semibold uppercase tracking-wide text-muted">Cash difference</span>
              {cashDiff == null ? (
                <p className="mt-1 text-sm text-ink">No till closed today</p>
              ) : (
                <>
                  <div className="mt-1 min-w-0 financial-fit" data-today-cash>
                    <FinancialAmount pence={cashDiff} currency={currency} variant="prominent" />
                  </div>
                  <p className="mt-0.5 text-xs text-muted">{cashNeedsLook ? 'Needs a look' : 'Within GH₵5.00'}</p>
                </>
              )}
            </div>
          </div>
        </section>
        <Attention snapshot={snapshot} />
      </div>

      <div className="mt-4 grid min-w-0 gap-4 lg:grid-cols-2">
        {showWeek ? <Week days={snapshot.days} currency={currency} /> : (
          <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5">
            <h3 className="text-sm font-semibold text-ink">Last seven dates</h3>
            <p className="mt-3 text-sm text-muted">No sales in the last seven dates.</p>
          </section>
        )}
        <Methods snapshot={snapshot} currency={currency} />
      </div>
      {snapshot.branches ? (
        <ul className="mt-4 grid min-w-0 gap-2 sm:grid-cols-2">
          {snapshot.branches.map((branch) => (
            <li key={branch.storeId} className="min-w-0 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm">
              <span className="block truncate font-semibold text-ink">{branch.name}</span>
              <FinancialAmount pence={branch.salesPence} currency={currency} variant="compact" className="text-muted" />
            </li>
          ))}
        </ul>
      ) : null}
      {snapshot.topProducts.length > 0 ? (
        <section className="mt-4 min-w-0">
          <h3 className="text-sm font-semibold text-ink">Top products today</h3>
          <ol className="mt-2 space-y-2">
            {snapshot.topProducts.map((product) => (
              <li key={product.name} className="flex min-w-0 items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate text-ink">{product.name}</span>
                <FinancialAmount pence={product.salesPence} currency={currency} variant="compact" className="shrink-0 text-muted" />
              </li>
            ))}
          </ol>
        </section>
      ) : null}
      <Profit profit={snapshot.profit} currency={currency} comparison={snapshot.comparison} />
    </div>
  );
}

function Attention({ snapshot }: { snapshot: TodaySnapshot }) {
  return (
    <section className="min-w-0 lg:mt-0" aria-labelledby="today-attention" data-today-attention>
      <h2 id="today-attention" className="font-display text-base font-semibold text-ink">Needs attention</h2>
      {snapshot.attention.length === 0 ? (
        <p className="mt-2 flex min-h-11 items-center gap-2 rounded-xl border border-emerald-100 bg-white px-3 text-sm text-ink shadow-card">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-800" aria-hidden="true">OK</span>
          Nothing needs attention right now.
        </p>
      ) : (
        <ul className="mt-2 space-y-2">
          {snapshot.attention.map((row) => (
            <li key={`${row.rank}-${row.title}`} className="min-w-0">
              <Link href={row.href} className={`flex min-h-11 w-full items-center gap-3 rounded-xl border border-slate-200/80 bg-white px-3 py-2 shadow-sm hover:bg-slate-50 ${FOCUS}`}>
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold uppercase ${row.severity === 'high' ? 'bg-rose-50 text-rose-800' : 'bg-amber-50 text-amber-800'}`}>
                  {row.severity === 'high' ? 'High' : 'Check'}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold leading-5 text-ink">{row.title}</span>
                  <span className="block text-xs leading-5 text-muted">{row.detail}</span>
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
    <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
      <h3 className="text-sm font-semibold text-ink">Last seven dates</h3>
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
  const total = snapshot.methods.reduce((sum, row) => sum + row.amountPence, 0);
  return (
    <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
      <h3 className="text-sm font-semibold text-ink">Payment methods</h3>
      {snapshot.methods.length === 0 ? (
        <p className="mt-3 text-sm text-muted">No confirmed payments yet today, so there is no payment mix.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {snapshot.methods.map((row) => {
            const share = total > 0 ? Math.round((row.amountPence / total) * 100) : 0;
            return (
              <li key={row.method} className="min-w-0 text-sm">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-ink">{row.label}</span>
                  <span className="text-right">
                    <FinancialAmount pence={row.amountPence} currency={currency} variant="compact" /> · {share}%
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
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
    <section className="mt-4 min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
      {comparison ? (
        comparison.last30Pence === 0 && comparison.previous30Pence === 0 ? (
          <p className="text-sm text-ink">There is no earlier 30-day period with sales to compare.</p>
        ) : (
          <p className="text-sm text-ink">
            Last 30 days <FinancialAmount pence={comparison.last30Pence} currency={currency} variant="compact" /> · previous{' '}
            <FinancialAmount pence={comparison.previous30Pence} currency={currency} variant="compact" />
          </p>
        )
      ) : null}
      {profit.state === 'incomplete' ? (
        <p className="mt-2 text-sm text-ink" data-profit-state="incomplete">Profit is hidden because some product costs are missing.</p>
      ) : profit.state === 'ready' && profit.grossProfitPence != null ? (
        <p className="mt-2 text-sm text-ink" data-profit-state="ready">
          Estimated gross profit today <FinancialAmount pence={profit.grossProfitPence} currency={currency} variant="compact" />. Every product cost used here is recorded.
        </p>
      ) : null}
    </section>
  );
}

function SectionLanding({ section, links }: { section: Stage3aSection; links: Stage3aLink[] }) {
  const groups = new Map<string, Stage3aLink[]>();
  for (const link of links) {
    const rows = groups.get(link.group) ?? [];
    rows.push(link);
    groups.set(link.group, rows);
  }
  return (
    <div className="mt-6 min-w-0 space-y-4">
      {links.length === 0 ? (
        <p className="text-sm text-ink" role="status">Nothing in this list is available on the current plan.</p>
      ) : (
        [...groups.entries()].map(([group, rows]) => (
          <section key={group} aria-labelledby={`group-${group}`}>
            <h2 id={`group-${group}`} className="px-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
              {activityGroupHeading(group as Stage3aLink['group'])}
            </h2>
            <ul className="mt-1.5 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-card">
              {rows.map((link) => (
                <li key={link.href} className="border-b border-slate-100 last:border-0">
                  <Link href={link.href} className={`flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left hover:bg-slate-50 ${FOCUS}`}>
                    <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accentSoft text-accent">
                      <NavIcon iconKey={link.iconKey} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-ink">{link.label}</span>
                      {link.useWhen ? (
                        <span className="mt-0.5 block text-xs leading-5 text-muted">{link.useWhen}</span>
                      ) : (
                        <span className="mt-0.5 block text-xs leading-5 text-muted">{link.purpose}</span>
                      )}
                    </span>
                    <span className="shrink-0 text-slate-400" aria-hidden="true">›</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}

export function scopeStoreLinks(links: Stage3aLink[], storeId: string | null) {
  return links.map((link) => ({ ...link, href: withStoreScope(link.href, storeId) }));
}
