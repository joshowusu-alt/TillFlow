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
      <div className="fixed inset-0 z-40 bg-slate-950/25 backdrop-blur-[2px] lg:hidden" onClick={() => setMobileOpen(false)} />
      <div className="fixed inset-x-3 bottom-3 top-[76px] z-50 overflow-hidden rounded-[28px] border border-slate-200/80 bg-white/95 shadow-floating backdrop-blur-xl lg:hidden">
        <div className="flex h-full flex-col">
          <div className="border-b border-slate-200/80 bg-gradient-to-r from-slate-50 via-white to-blue-50/60 px-4 py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className={isOnline ? 'status-dot-online' : 'status-dot-offline'} />
                  <span className="truncate text-base font-semibold text-ink">{user.name}</span>
                </div>
                <div className="mt-1 text-[11px] uppercase tracking-[0.22em] text-muted">
                  {user.role}{storeName ? ` · ${storeName}` : ''}
                </div>
              </div>
              <span className={isOnline ? 'status-badge-online' : 'status-badge-offline'}>
                {isOnline ? 'Online' : 'Offline'}
              </span>
            </div>
            <div className="mt-4 flex items-center justify-between gap-3">
              <div className="metric-chip">
                <span className="h-2 w-2 rounded-full bg-accent" aria-hidden="true" />
                Navigation
              </div>
              <InstallButton />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4">
            <div className="space-y-5">
              {visibleGroups.map((group) => (
                <section key={group.id}>
                  <div className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-muted">{group.label}</div>
                  <div className="grid gap-2">
                    {group.items.map((item) => {
                      const active = pathname === item.href || pathname.startsWith(item.href + '/');
                      const isAdvanced = group.id === 'reports' && advancedReportLinks.has(item.href);
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          className={active ? 'shell-nav-link shell-nav-link-active border border-blue-100' : 'shell-nav-link border border-slate-200/70 bg-white'}
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
                </section>
              ))}
            </div>
          </div>

          <div className="border-t border-slate-200/80 bg-slate-50/80 p-4">
            <form action={logout}>
              <button type="submit" className="btn-ghost w-full text-sm">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}
