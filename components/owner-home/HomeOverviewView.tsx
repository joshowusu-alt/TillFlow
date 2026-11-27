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
  return <div className="px-0 pb-4 pt-2 sm:pt-3 lg:pb-8">
    <div className="mx-auto max-w-[90rem] space-y-4">
      <div data-testid="home-brand-hero" className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#0f172a] via-[#1e3a8a] to-accent p-4 shadow-soft sm:p-6 lg:rounded-3xl lg:p-7">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.19),transparent_65%)]" aria-hidden="true" />
        <div className="relative min-w-0 space-y-3">
          <h1 className="text-2xl font-bold leading-tight text-white [overflow-wrap:anywhere] sm:text-3xl">{businessName}</h1>
          {figures}
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:items-start">
        <div className="order-1 lg:col-start-1 lg:row-start-1 space-y-3">
          <HomeActionCard action={openPosAction} className="w-full min-h-14" />
          {tills}
          <div className="grid grid-cols-3 gap-2">
            {([{ label: 'Purchases', href: '/purchases', icon: 'purchases' }, { label: 'Expenses', href: '/expenses', icon: 'receipt' }, { label: 'Reports', href: '/reports', icon: 'chart' }] as const).map(({ label, href, icon }) =>
              <Link key={href} href={href} className="flex min-h-11 min-w-0 flex-col items-center justify-center gap-1 rounded-xl border border-accent/15 bg-accentSoft px-1 py-3 text-center text-xs font-semibold text-accent hover:border-accent/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:text-sm"><span aria-hidden="true"><HomeIcon name={icon} /></span><span className="[overflow-wrap:anywhere]">{label}</span></Link>)}
          </div>
        </div>
        <div className="order-2 lg:col-start-2 lg:row-span-2 lg:row-start-1">{attention}</div>
        <div className="order-3 space-y-3 lg:col-start-1 lg:row-start-2">
          <details className="rounded-xl border border-accent/15 bg-white px-3 shadow-card">
            <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold text-accent">Improve your records</summary>
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
    <p className="text-sm font-medium text-blue-100">Today · {scope}</p>
    <div className="grid grid-cols-2 gap-2 xl:grid-cols-4 sm:gap-3">
      {figures.filter(figure => !figure.upgrade).map(figure => {
        const tile = 'min-w-0 rounded-xl border border-white/20 bg-black/[0.15] p-3';
        const content = <>
          <p className="text-xs font-semibold text-blue-100">{figure.label}</p>
          {figure.incomplete ? <p className="mt-2 text-sm font-semibold text-amber-200">Profit incomplete — Fix now →</p> :
            <p className="mt-2 text-xl font-bold leading-tight text-white tabular-nums [overflow-wrap:anywhere] sm:text-2xl">{figure.value ?? "Couldn't load"}</p>}
          {figure.note && <p className="mt-1 text-xs text-blue-100 [overflow-wrap:anywhere]">{figure.note}</p>}
        </>;
        return figure.href ? <Link key={figure.label} href={figure.href} className={tile + ' min-h-11 hover:border-white/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white'}>{content}</Link> :
          <div key={figure.label} className={tile}>{content}{figure.value === null && <RetryButton tone="onDark" label="Retry" />}</div>;
      })}
    </div>
    {figures.some(figure => figure.upgrade) && <p className="text-xs text-blue-100">Profit · on Growth</p>}
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
  return <section aria-label="Needs your attention" className="min-w-0 rounded-xl border border-accent/15 bg-white p-4 shadow-card">
    <h2 className="flex items-center gap-2 font-bold text-accent"><span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accentSoft"><HomeIcon name="alert" /></span>Needs your attention</h2>
    {rows === null ? <div role="alert"><p className="mt-2 text-sm text-muted">Couldn&apos;t check right now — Retry</p><RetryButton label="Retry" /></div> :
      rows.length === 0 ? <p className="mt-2 text-sm text-muted">Nothing needs attention right now.</p> :
        <><ul className="divide-y divide-black/10">{rows.slice(0, 3).map((row, index) => <AttentionRow key={index} row={row} />)}</ul>
        {rows.length > 3 && <details><summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-accent">View all</summary><ul className="divide-y divide-black/10">{rows.slice(3).map((row, index) => <AttentionRow key={index} row={row} />)}</ul></details>}</>}
    <Link href={reportsHref} className="inline-flex min-h-11 items-center text-sm font-semibold text-accent">{rows && rows.length > 3 ? 'View reports' : 'View all'} →</Link>
  </section>;
}

export function HomeTills({ count, expected, href = '/shifts' }: { count: number; expected: string | null; href?: string }) {
  return <div className="rounded-xl border border-accent/15 bg-white p-3 text-sm text-ink shadow-card [overflow-wrap:anywhere]">
    <p>{count} {count === 1 ? 'till' : 'tills'} open{expected !== null ? ' · Expected cash ' + expected : ''}</p>
    <Link href={href} className="inline-flex min-h-11 items-center font-semibold text-accent">View tills →</Link>
  </div>;
}
