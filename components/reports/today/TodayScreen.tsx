import Link from 'next/link';
import NavIcon from '@/components/navigation/NavIcon';
import { formatMoney } from '@/lib/format';
import { cashDifferenceLabel, type TodaySnapshot } from '@/lib/reports/today/load';
import { stage3aSection, withStoreScope, type Stage3aLink, type Stage3aSection } from '@/lib/reports/today/stage3a-nav';
import RefreshToday from '@/components/reports/today/RefreshToday';

const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

export function TodayLoading() {
  return (
    <div className="mx-auto min-w-0 max-w-6xl overflow-x-hidden px-4 py-6" aria-busy="true" aria-live="polite">
      <h1 className="font-display text-2xl font-semibold text-ink">Reports</h1>
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
  salesHref: string | null;
  snapshot: TodaySnapshot | null;
  blocked: { title: string; body: string; href: string; action: string } | null;
  failed: boolean;
};

export default function TodayScreen(props: TodayScreenProps) {
  const section = stage3aSection(props.section);
  return (
    <div className="mx-auto min-w-0 max-w-6xl overflow-x-hidden px-4 py-6 pb-36 lg:pb-8">
      <h1 className="font-display text-2xl font-semibold text-ink">Reports</h1>
      <ReportsNav section={section} storeId={props.storeId} />
      {props.readOnly ? (
        <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-ink" role="status">
          Read-only. You can look at reports. Downloads and changes stay off until billing is sorted.
        </p>
      ) : null}
      {props.failed ? <TodayFailed /> : null}
      {props.blocked ? <BlockedPanel blocked={props.blocked} /> : null}
      {!props.failed && !props.blocked && section === 'today' && props.snapshot ? (
        <TodayBody {...props} snapshot={props.snapshot} />
      ) : null}
      {!props.failed && !props.blocked && section !== 'today' ? (
        <SectionLanding section={section} links={props.links} scopeLabel={props.scopeLabel} />
      ) : null}
      <ReportsNav section={section} storeId={props.storeId} mobile />
    </div>
  );
}

function ReportsNav({ section, storeId, mobile = false }: { section: Stage3aSection; storeId: string | null; mobile?: boolean }) {
  const items: Array<{ id: Stage3aSection; label: string }> = [
    { id: 'today', label: 'Today' },
    { id: 'activity', label: 'Activity' },
    { id: 'more', label: mobile ? 'More' : 'More reports' },
  ];
  const className = mobile
    ? 'fixed inset-x-0 z-30 border-t border-slate-200 bg-white lg:hidden'
    : 'mt-4 hidden gap-2 lg:flex';
  return (
    <nav
      aria-label={mobile ? 'Reports mobile' : 'Reports'}
      className={className}
      style={mobile ? { bottom: 'var(--mobile-bottom-nav-height)' } : undefined}
    >
      <ul className={mobile ? 'mx-auto flex max-w-lg items-stretch justify-around' : 'flex gap-2'}>
        {items.map((item) => {
          const current = item.id === section;
          const href = sectionHref(item.id, storeId);
          return (
            <li key={item.id} className={mobile ? 'flex-1' : undefined}>
              <Link
                href={href}
                aria-current={current ? 'page' : undefined}
                className={`inline-flex min-h-11 w-full items-center justify-center rounded-full px-3 text-sm font-semibold ${FOCUS} ${
                  current ? 'bg-accent text-white' : 'bg-white text-ink hover:bg-slate-100'
                } ${mobile ? '' : 'border'} ${current ? 'border-accent' : 'border-slate-200'}`}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function sectionHref(section: Stage3aSection, storeId: string | null) {
  const params = new URLSearchParams();
  if (section !== 'today') params.set('section', section);
  if (storeId) params.set('storeId', storeId);
  const query = params.toString();
  return query ? `/reports?${query}` : '/reports';
}

function TodayFailed() {
  return (
    <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6" role="alert">
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
    <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6" role="status">
      <h2 className="font-display text-xl font-semibold text-ink">{blocked.title}</h2>
      <p className="mt-2 max-w-xl text-sm text-muted">{blocked.body}</p>
      <Link href={blocked.href} className={`btn-primary mt-4 inline-flex min-h-11 items-center ${FOCUS}`}>
        {blocked.action}
      </Link>
    </div>
  );
}

function TodayBody(props: TodayScreenProps & { snapshot: TodaySnapshot }) {
  const { snapshot, currency, scopeLabel } = props;
  const sales = formatMoney(snapshot.salesTodayPence, currency);
  const received = formatMoney(snapshot.moneyReceivedPence, currency);
  const cash = cashDifferenceLabel(snapshot.cashDifferencePence, currency);
  const saleWord = snapshot.salesCount === 1 ? 'sale' : 'sales';
  return (
    <div className="mt-6 min-w-0">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-xl font-semibold text-ink">Today</h2>
          <p className="mt-1 text-sm text-muted">{props.dateLabel}</p>
          <p className="mt-2 inline-flex max-w-full rounded-full bg-accentSoft px-3 py-1 text-sm font-medium text-accent">
            <span className="truncate">{scopeLabel}</span>
          </p>
        </div>
        <RefreshToday label={props.updatedLabel} />
      </div>

      <div className="mt-5 grid min-w-0 gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-muted">Sales</h3>
          {props.salesHref ? (
            <Link href={props.salesHref} className={`mt-2 inline-flex min-h-11 min-w-0 items-center break-words font-display text-[clamp(1.75rem,8vw,3rem)] font-semibold leading-tight text-ink ${FOCUS}`}>
              {sales}
            </Link>
          ) : (
            <p className="mt-2 inline-flex min-h-11 min-w-0 items-center break-words font-display text-[clamp(1.75rem,8vw,3rem)] font-semibold leading-tight text-ink">{sales}</p>
          )}
          <p className="mt-2 text-sm text-ink">
            {snapshot.salesCount === 0 ? 'No sales recorded yet today' : `${snapshot.salesCount} ${saleWord}`}
          </p>
          <p className="mt-1 text-sm text-muted">
            {snapshot.yesterdayPence === 0 ? 'No sales yesterday.' : `Yesterday ${formatMoney(snapshot.yesterdayPence, currency)}`}
          </p>
          <div className="mt-5 grid min-w-0 gap-4 sm:grid-cols-2">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-muted">Money received</h3>
              <p className="mt-1 break-words text-lg font-semibold text-ink">{received}</p>
              {snapshot.moneyReceivedPence === 0 ? (
                <p className="text-sm text-muted">No confirmed payments yet today</p>
              ) : (
                <p className="text-sm text-muted">Confirmed payments. This is not sales.</p>
              )}
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-muted">Cash difference</h3>
              {cash == null ? (
                <p className="mt-1 text-sm text-ink">No till has been closed today, so there is no cash difference to show.</p>
              ) : (
                <p className="mt-1 break-words text-lg font-semibold text-ink">{cash}</p>
              )}
            </div>
          </div>
        </section>
        <Attention snapshot={snapshot} />
      </div>

      <div className="mt-4 grid min-w-0 gap-4 lg:grid-cols-2">
        <Week days={snapshot.days} currency={currency} />
        <Methods snapshot={snapshot} currency={currency} />
      </div>
      {snapshot.comparison ? (
        <p className="mt-4 text-sm text-ink">
          Last 30 days {formatMoney(snapshot.comparison.last30Pence, currency)}. The 30 days before that were {formatMoney(snapshot.comparison.previous30Pence, currency)}.
        </p>
      ) : null}
      {snapshot.branches ? (
        <ul className="mt-4 grid min-w-0 gap-2 sm:grid-cols-2">
          {snapshot.branches.map((branch) => (
            <li key={branch.storeId} className="min-w-0 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm">
              <span className="block truncate font-semibold text-ink">{branch.name}</span>
              <span className="break-words text-muted">{formatMoney(branch.salesPence, currency)}</span>
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
                <span className="shrink-0 text-muted">{formatMoney(product.salesPence, currency)}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
      <Profit profit={snapshot.profit} currency={currency} />
      <Help scopeLabel={scopeLabel} zoneName={props.zoneName} />
    </div>
  );
}

function Attention({ snapshot }: { snapshot: TodaySnapshot }) {
  return (
    <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5" aria-labelledby="today-attention">
      <h2 id="today-attention" className="font-display text-lg font-semibold text-ink">Needs attention</h2>
      {snapshot.attention.length === 0 ? (
        <p className="mt-3 text-sm text-muted">Nothing needs attention right now.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {snapshot.attention.map((row) => (
            <li key={`${row.rank}-${row.title}`} className="min-w-0 border-t border-slate-100 pt-3 first:border-t-0 first:pt-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">{row.severity === 'high' ? 'High' : 'Review'}</p>
              <p className="mt-1 text-sm font-semibold text-ink">{row.title}</p>
              <p className="text-sm text-muted">{row.detail}</p>
              <Link href={row.href} className={`mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-accent ${FOCUS}`}>
                {row.action}
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
    <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5">
      <h3 className="text-sm font-semibold text-ink">Last seven dates</h3>
      <ul className="mt-3 space-y-3">
        {days.map((day) => (
          <li key={day.key} className="min-w-0 text-sm">
            <div className="flex min-w-0 items-baseline justify-between gap-3">
              <span className="shrink-0 text-muted">{day.label}</span>
              <span className="min-w-0 break-words text-right text-ink">{formatMoney(day.salesPence, currency)}</span>
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
    <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5">
      <h3 className="text-sm font-semibold text-ink">Payment methods</h3>
      {snapshot.methods.length === 0 ? (
        <p className="mt-3 text-sm text-muted">No confirmed payments yet today</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {snapshot.methods.map((row) => {
            const share = total > 0 ? Math.round((row.amountPence / total) * 100) : 0;
            return (
              <li key={row.method} className="min-w-0 text-sm">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-ink">{row.label}</span>
                  <span className="break-words text-right text-ink">{formatMoney(row.amountPence, currency)} · {share}%</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Profit({ profit, currency }: { profit: TodaySnapshot['profit']; currency: string }) {
  if (profit.state === 'omitted') return null;
  if (profit.state === 'incomplete' || profit.grossProfitPence == null) {
    return <p className="mt-4 text-sm text-ink">Profit is hidden because some product costs are missing.</p>;
  }
  return (
    <p className="mt-4 text-sm text-ink">
      Estimated gross profit {formatMoney(profit.grossProfitPence, currency)}. Every product cost used here is recorded.
    </p>
  );
}

function Help({ scopeLabel, zoneName }: { scopeLabel: string; zoneName: string }) {
  return (
    <details className="mt-6 rounded-2xl border border-slate-200 bg-white p-4">
      <summary className={`min-h-11 cursor-pointer text-sm font-semibold text-ink ${FOCUS}`}>How Today is calculated</summary>
      <div className="mt-3 space-y-2 text-sm text-muted">
        <p>Dates are the business local date in {zoneName}. The phone or browser clock is not used.</p>
        <p>This page is for {scopeLabel}. It does not switch to a whole-business total.</p>
        <p>Sales is the total of invoices, excluding voided and returned sales. Money received is confirmed payments, with completed refunds paid back today deducted. Pending Mobile Money is not included, and a returned sale is not deducted unless the refund was actually paid.</p>
        <p>Cash difference is the counted difference on tills closed today. An amount below GH₵5.00 stays in that figure and is not listed as needing attention.</p>
        <p>Estimated profit is shown only when every product cost is recorded. If a cost is missing, the profit figure is hidden.</p>
      </div>
    </details>
  );
}

function SectionLanding({ section, links, scopeLabel }: { section: Stage3aSection; links: Stage3aLink[]; scopeLabel: string }) {
  const title = section === 'activity' ? 'Activity' : 'More reports';
  const groups = new Map<string, Stage3aLink[]>();
  for (const link of links) {
    const rows = groups.get(link.group) ?? [];
    rows.push(link);
    groups.set(link.group, rows);
  }
  return (
    <div className="mt-6 min-w-0">
      <h2 className="font-display text-xl font-semibold text-ink">{title}</h2>
      <p className="mt-2 inline-flex rounded-full bg-accentSoft px-3 py-1 text-sm font-medium text-accent">{scopeLabel}</p>
      <p className="mt-3 max-w-xl text-sm text-muted">
        {section === 'activity'
          ? 'Open a report or queue that is already available. This is not a new Activity design.'
          : 'Statements, downloads and owner tools that are already available.'}
      </p>
      {links.length === 0 ? (
        <p className="mt-4 text-sm text-ink">Nothing in this list is available on the current plan.</p>
      ) : (
        [...groups.entries()].map(([group, rows]) => (
          <section key={group} className="mt-5">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
              <NavIcon iconKey="reports" />
              {group}
            </h3>
            <ul className="mt-2 divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
              {rows.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className={`flex min-h-11 flex-col justify-center px-4 py-3 ${FOCUS}`}>
                    <span className="text-sm font-semibold text-ink">{link.label}</span>
                    <span className="text-sm text-muted">{link.purpose}</span>
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
