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
      <div className="hidden items-center gap-3 xl:flex">
        <div className="shell-context-card">
          <div className="flex min-w-0 items-center gap-3">
            <span
              className={isOnline ? 'status-dot-online' : 'status-dot-offline'}
              title={isOnline ? 'Online' : 'Offline — sales will sync when reconnected'}
            />
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-ink">{user.name}</div>
              <div className="truncate text-[11px] uppercase tracking-[0.2em] text-muted">
                {user.role}{storeName ? ` · ${storeName}` : ''}
              </div>
            </div>
          </div>

          <div className="h-10 w-px bg-slate-200" aria-hidden="true" />

          <div className="text-right">
            <div className={isOnline ? 'status-badge-online' : 'status-badge-offline'}>
              <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" aria-hidden="true" />
              {isOnline ? 'Online' : 'Offline'}
            </div>
            {todaySales && (user.role === 'MANAGER' || user.role === 'OWNER') ? (
              <div className="mt-1 text-sm font-semibold tabular-nums text-ink">
                {formatMoney(todaySales.totalPence, todaySales.currency)}
                <span className="ml-2 text-xs font-medium text-muted">
                  {todaySales.txCount} txn{todaySales.txCount !== 1 ? 's' : ''} today
                </span>
              </div>
            ) : (
              <div className="mt-1 text-xs text-muted">Sales saved locally when connection drops</div>
            )}
          </div>
        </div>

        <form action={logout}>
          <button type="submit" className="btn-ghost text-xs" aria-label="Sign out">
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
        {todaySales && (user.role === 'MANAGER' || user.role === 'OWNER') && (
          <div className="text-gray-400 tabular-nums">
            {formatMoney(todaySales.totalPence, todaySales.currency)}
            {' · '}{todaySales.txCount} txn{todaySales.txCount !== 1 ? 's' : ''} today
          </div>
        )}
      </div>

      <form action={logout} className="hidden sm:block xl:hidden">
        <button type="submit" className="btn-ghost text-xs" aria-label="Sign out">
          Sign out
        </button>
      </form>
    </>
  );
}
