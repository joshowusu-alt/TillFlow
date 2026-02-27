'use client';

import Link from 'next/link';
import { logout } from '@/app/actions/auth';
import { getFeatures } from '@/lib/features';
import InstallButton from './InstallButton';
import type { TopNavUser } from './TopNav';

interface NavMobileMenuProps {
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
  visibleGroups: Array<{
    id: string;
    label: string;
    items: Array<{ href: string; label: string; roles: string[] }>;
  }>;
  isOnline: boolean;
  user: TopNavUser;
  storeName?: string;
  features: ReturnType<typeof getFeatures>;
  pathname: string;
  advancedReportLinks: Set<string>;
}

export default function NavMobileMenu({
  mobileOpen,
  setMobileOpen,
  visibleGroups,
  isOnline,
  user,
  storeName,
  features,
  pathname,
  advancedReportLinks,
}: NavMobileMenuProps) {
  if (!mobileOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/20 lg:hidden" onClick={() => setMobileOpen(false)} />
      {/* Menu panel — fixed overlay with independent scroll */}
      <div className="fixed left-0 right-0 top-[65px] bottom-0 z-50 overflow-y-auto overscroll-contain bg-white px-6 pb-6 lg:hidden">
        <div className="mt-4 space-y-4">
          {/* Mobile user info */}
          <div className="flex items-center justify-between rounded-xl bg-gray-50 border border-gray-200 px-4 py-3">
            <div>
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${isOnline ? 'bg-success' : 'bg-rose'}`} />
                <span className="text-sm font-semibold text-ink">{user.name}</span>
              </div>
              <div className="text-[10px] uppercase tracking-[0.15em] text-muted mt-0.5">
                {user.role}{storeName ? ` · ${storeName}` : ''}
              </div>
            </div>
            <div className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${isOnline ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
              }`}>
              {isOnline ? 'Online' : 'Offline'}
            </div>
          </div>
          {visibleGroups.map((group) => (
            <div key={group.id}>
              <div className="text-xs uppercase tracking-[0.2em] text-black/50">{group.label}</div>
              <div className="mt-2 grid gap-2">
                {group.items.map((item) => {
                  const active = pathname === item.href;
                  const isAdvanced = group.id === 'reports' && advancedReportLinks.has(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`flex items-center justify-between rounded-xl px-3 py-2 text-sm font-medium ${active ? 'bg-accent text-white' : 'bg-white text-gray-600'
                        }`}
                      onClick={() => setMobileOpen(false)}
                    >
                      <span>{item.label}</span>
                      {!features.advancedReports && isAdvanced ? (
                        <span className="rounded-full bg-black/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] text-black/50">
                          Advanced
                        </span>
                      ) : null}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
          <div className="mt-4 flex justify-center">
            <InstallButton />
          </div>
          <form action={logout}>
            <button type="submit" className="btn-ghost w-full text-xs">
              Sign out
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
