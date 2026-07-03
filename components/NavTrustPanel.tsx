'use client';

import { logout } from '@/app/actions/auth';
import { formatMoney } from '@/lib/format';
import type { TopNavUser } from './TopNav';

interface NavTrustPanelProps {
  user: TopNavUser;
  storeName?: string;
  isOnline: boolean;
  todaySales?: { totalPence: number; txCount: number; currency: string };
}

export default function NavTrustPanel({ user, storeName, isOnline, todaySales }: NavTrustPanelProps) {
  return (
    <>
      <div className="hidden items-center gap-2 xl:flex">
        {todaySales ? (
          <div
            className="hidden h-9 items-center gap-3 rounded-xl border border-slate-200/75 bg-white/86 px-3 shadow-sm xl:flex"
            aria-label={`Today's sales ${formatMoney(todaySales.totalPence, todaySales.currency)}, ${todaySales.txCount} transactions`}
            title={`Today's sales: ${formatMoney(todaySales.totalPence, todaySales.currency)} · ${todaySales.txCount} transaction${todaySales.txCount !== 1 ? 's' : ''}`}
          >
            <div className="text-sm font-semibold tabular-nums leading-none text-ink">
              {formatMoney(todaySales.totalPence, todaySales.currency)}
            </div>
            <div className="h-5 w-px bg-slate-200" aria-hidden="true" />
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
              {todaySales.txCount} txn{todaySales.txCount !== 1 ? 's' : ''}
            </div>
          </div>
        ) : null}

        <div className="shell-context-card">
          <div className="flex min-w-0 items-center gap-2.5">
            <span
              className={isOnline ? 'status-dot-online' : 'status-dot-offline'}
              title={isOnline ? 'Online' : 'Offline — sales will sync when reconnected'}
            />
            <div className="min-w-0">
              <div className="max-w-[10rem] truncate text-sm font-semibold text-ink 2xl:max-w-[13rem]">{user.name}</div>
              <div className="truncate text-[10px] uppercase tracking-[0.18em] text-muted">
                {user.role}{storeName ? ` · ${storeName}` : ''}
              </div>
            </div>
          </div>
        </div>

        <form action={logout}>
          <button type="submit" className="inline-flex h-9 items-center rounded-xl border border-slate-200/75 bg-white/86 px-3 text-xs font-semibold text-ink shadow-sm transition hover:bg-slate-50" aria-label="Sign out">
            Sign out
          </button>
        </form>
      </div>

      {/* Trust panel: compact tablet variant */}
      <div className="hidden text-right text-xs sm:block xl:hidden">
        <div className="flex items-center justify-end gap-2">
          <span
            className={isOnline ? 'status-dot-online' : 'status-dot-offline'}
            title={isOnline ? 'Online' : 'Offline — sales will sync when reconnected'}
          />
          <span className="font-semibold text-ink">{user.name}</span>
          <span className={isOnline ? 'status-badge-online' : 'status-badge-offline'}>
            {isOnline ? 'Online' : 'Offline'}
          </span>
        </div>
        <div className="text-gray-500 uppercase tracking-[0.15em]">
          {user.role}{storeName ? ` · ${storeName}` : ''}
        </div>
        {todaySales ? (
          <div className="text-gray-400 tabular-nums">
            {formatMoney(todaySales.totalPence, todaySales.currency)}
            {' · '}{todaySales.txCount} txn{todaySales.txCount !== 1 ? 's' : ''} today
          </div>
        ) : null}
      </div>

      <form action={logout} className="hidden sm:block xl:hidden">
        <button type="submit" className="btn-ghost text-xs" aria-label="Sign out">
          Sign out
        </button>
      </form>
    </>
  );
}
