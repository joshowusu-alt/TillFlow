import Link from 'next/link';
import { switchOperationalStoreAction } from '@/app/actions/operational-store';
import { withStoreQuery } from '@/lib/reliability/selected-store';
import { RetryButton } from './section-errors';
import { HomeActionCard, HomeIcon } from './home-chrome';
import type { ReactNode } from 'react';

export function HomeOverviewLayout({ businessName, figures, tills, attention, records, extras }: {
  businessName: string; figures: ReactNode; tills: ReactNode; attention: ReactNode; records: ReactNode; extras: ReactNode;
}) {
  const openPosAction = { label: 'Open POS', desc: 'Serve customers and record sales', href: '/pos', primary: true as const, icon: <HomeIcon name="pos" /> };
  return <div className="bg-[#f0f2f5] px-3 pb-4 pt-4 sm:px-6 lg:px-8 lg:pb-8">
    <div className="mx-auto max-w-[90rem] space-y-4">
      <h1 className="text-2xl font-bold text-ink [overflow-wrap:anywhere] sm:text-3xl">{businessName}</h1>
      {figures}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:items-start">
        <div className="order-1 lg:col-start-1 lg:row-start-1 space-y-3">
          <HomeActionCard action={openPosAction} className="w-full min-h-14" />
          {tills}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {[['Purchases', '/purchases'], ['Expenses', '/expenses'], ['Reports', '/reports']].map(([label, href]) =>
              <Link key={href} href={href} className="flex min-h-11 items-center justify-center rounded-xl border border-black/10 bg-white px-2 py-3 text-center text-sm font-semibold text-accent">{label}</Link>)}
          </div>
        </div>
        <div className="order-2 lg:col-start-2 lg:row-span-2 lg:row-start-1">{attention}</div>
        <div className="order-3 space-y-3 lg:col-start-1 lg:row-start-2">
          <details className="rounded-xl border border-black/10 bg-white px-3">
            <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold text-ink">Improve your records</summary>
            {records}
          </details>
          {extras}
        </div>
      </div>
    </div>
  </div>;
}

export type HomeFigure = {
  label: string;
  value: string | null;
  href?: string;
  note?: string;
  incomplete?: boolean;
  upgrade?: boolean;
};
export type HomeAttentionRow = { rank: number; title: string; detail: string; href: string; action: string; storeId?: string };

export function HomeFigures({ figures, scope }: { figures: HomeFigure[]; scope: string }) {
  return <section aria-label="Today's figures" className="space-y-2">
    <p className="text-sm text-muted">Today · {scope}</p>
    <div className="grid grid-cols-2 gap-2 xl:grid-cols-4 sm:gap-3">
      {figures.filter(figure => !figure.upgrade).map(figure => {
        const content = <>
          <p className="text-xs font-semibold text-muted">{figure.label}</p>
          {figure.incomplete ? <p className="mt-2 text-sm font-semibold text-amber-800">Profit incomplete — Fix now →</p> :
            <p className="mt-2 text-xl font-bold leading-tight text-ink [overflow-wrap:anywhere] sm:text-2xl">{figure.value ?? "Couldn't load"}</p>}
          {figure.note && <p className="mt-1 text-xs text-muted [overflow-wrap:anywhere]">{figure.note}</p>}
        </>;
        return figure.href ? <Link key={figure.label} href={figure.href} className="min-w-0 rounded-xl border border-black/10 bg-white p-3 min-h-11 hover:border-accent">{content}</Link> :
          <div key={figure.label} className="min-w-0 rounded-xl border border-black/10 bg-white p-3">{content}{figure.value === null && <RetryButton label="Retry" />}</div>;
      })}
    </div>
    {figures.some(figure => figure.upgrade) && <p className="text-xs text-muted">Profit · on Growth</p>}
  </section>;
}

function AttentionRow({ row }: { row: HomeAttentionRow }) {
  const content = <>
    <span className={row.rank <= 3 ? 'block font-semibold text-amber-900' : 'block font-semibold text-ink'}>{row.title}</span>
    <span className="mt-1 block text-xs text-muted">{row.detail}</span>
    <span className="mt-1 block text-xs font-semibold text-accent">{row.action} →</span>
  </>;
  return <li className="min-w-0 [overflow-wrap:anywhere]">
    {row.storeId ? <form action={switchOperationalStoreAction}>
      <input type="hidden" name="storeId" value={row.storeId} />
      <input type="hidden" name="returnTo" value={withStoreQuery(row.href, row.storeId)} />
      <button type="submit" className="min-h-11 w-full py-3 text-left text-sm">{content}</button>
    </form> : <Link href={row.href} className="block min-h-11 py-3 text-sm">{content}</Link>}
  </li>;
}

export function HomeAttentionList({ rows, reportsHref }: { rows: HomeAttentionRow[] | null; reportsHref: string }) {
  return <section aria-label="Needs your attention" className="min-w-0 rounded-xl border border-black/10 bg-white p-4">
    <h2 className="font-bold text-ink">Needs your attention</h2>
    {rows === null ? <div role="alert"><p className="mt-2 text-sm text-muted">Couldn&apos;t check right now — Retry</p><RetryButton label="Retry" /></div> :
      rows.length === 0 ? <p className="mt-2 text-sm text-muted">Nothing needs attention right now.</p> :
        <><ul className="divide-y divide-black/10">{rows.slice(0, 3).map((row, index) => <AttentionRow key={index} row={row} />)}</ul>
        {rows.length > 3 && <details><summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-accent">View all</summary><ul className="divide-y divide-black/10">{rows.slice(3).map((row, index) => <AttentionRow key={index} row={row} />)}</ul></details>}</>}
    <Link href={reportsHref} className="inline-flex min-h-11 items-center text-sm font-semibold text-accent">{rows && rows.length > 3 ? 'View reports' : 'View all'} →</Link>
  </section>;
}

export function HomeTills({ count, expected, href = '/shifts' }: { count: number; expected: string | null; href?: string }) {
  return <div className="rounded-xl border border-black/10 bg-white p-3 text-sm text-ink [overflow-wrap:anywhere]">
    <p>{count} {count === 1 ? 'till' : 'tills'} open{expected !== null ? ' · Expected cash ' + expected : ''}</p>
    <Link href={href} className="inline-flex min-h-11 items-center font-semibold text-accent">View tills →</Link>
  </div>;
}
