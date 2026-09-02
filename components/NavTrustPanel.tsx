'use client';

import LogoutForm from '@/components/LogoutForm';
import { formatMoney } from '@/lib/format';
import type { TopNavUser } from './TopNav';

interface NavTrustPanelProps {
  user: TopNavUser;
  storeName?: string;
  isOnline: boolean;
  todaySales?: { totalPence: number; txCount: number; currency: string };
}

/**
 * One identity tree for every viewport. CSS rearranges this row; it does not
 * mount a second name/status/Sign out copy.
 */
export default function NavTrustPanel({ user, storeName, isOnline, todaySales }: NavTrustPanelProps) {
  const roleBranch = `${user.role}${storeName ? ` · ${storeName}` : ''}`;
  const salesLabel = todaySales
    ? `Today's sales ${formatMoney(todaySales.totalPence, todaySales.currency)}, ${todaySales.txCount} transactions`
    : undefined;

  return (
    <div className="nav-trust flex min-w-0 items-center gap-2" data-nav-trust="true">
      <span
        className={isOnline ? 'status-dot-online' : 'status-dot-offline'}
        aria-hidden="true"
      />
      <div className="min-w-0">
        <div className="truncate text-xs font-semibold leading-tight text-ink sm:text-sm" data-nav-trust-name="true">
          {user.name}
        </div>
        <div className="truncate text-[10px] uppercase tracking-[0.12em] text-muted" data-nav-trust-role="true">
          {roleBranch}
          <span className="nav-trust-status-compact sm:hidden">
            {` · ${isOnline ? 'Online' : 'Offline'}`}
          </span>
        </div>
      </div>
      {todaySales ? (
        <span
          className="nav-trust-sales hidden shrink-0 text-xs font-semibold tabular-nums text-ink sm:inline"
          aria-label={salesLabel}
          title={salesLabel}
        >
          {formatMoney(todaySales.totalPence, todaySales.currency)}
        </span>
      ) : null}
      <span
        className={`nav-trust-status-label hidden sm:inline-flex ${
          isOnline ? 'status-badge-online' : 'status-badge-offline'
        }`}
      >
        {isOnline ? 'Online' : 'Offline'}
      </span>
      <LogoutForm className="nav-trust-signout hidden md:block">
        <button
          type="submit"
          className="inline-flex h-11 min-h-11 items-center rounded-xl border border-slate-200/75 bg-white px-3 text-xs font-semibold text-ink shadow-sm transition hover:bg-slate-50"
          aria-label="Sign out"
          data-shell-signout="header"
        >
          Sign out
        </button>
      </LogoutForm>
    </div>
  );
}
