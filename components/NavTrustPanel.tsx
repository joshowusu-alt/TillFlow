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
      {/* Trust panel: user, role, branch, connectivity */}
      <div className="hidden text-right text-xs sm:block">
        <div className="flex items-center justify-end gap-1.5">
          {/* Online/offline indicator dot */}
          <span
            className={`inline-block h-2 w-2 rounded-full transition-colors ${isOnline ? 'bg-success' : 'bg-rose'
              }`}
            title={isOnline ? 'Online' : 'Offline — sales will sync when reconnected'}
          />
          <span className="font-semibold text-ink">{user.name}</span>
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
      <form action={logout} className="hidden sm:block">
        <button type="submit" className="btn-ghost text-xs" aria-label="Sign out">
          Sign out
        </button>
      </form>
    </>
  );
}
