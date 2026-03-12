'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { getFeatures, type BusinessMode, type StoreMode } from '@/lib/features';
import { formatMoney } from '@/lib/format';
import InstallButton from './InstallButton';
import NavTrustPanel from './NavTrustPanel';
import NavMobileMenu from './NavMobileMenu';

const navGroups = [
  {
    id: 'operations',
    label: 'Operations',
    items: [
      { href: '/pos', label: 'POS', roles: ['CASHIER', 'MANAGER', 'OWNER'] },
      { href: '/shifts', label: 'Shifts', roles: ['CASHIER', 'MANAGER', 'OWNER'] },
      { href: '/sales', label: 'Sales', roles: ['MANAGER', 'OWNER'] },
      { href: '/purchases', label: 'Purchases', roles: ['MANAGER', 'OWNER'] },
      { href: '/transfers', label: 'Transfers', roles: ['MANAGER', 'OWNER'] },
      { href: '/expenses', label: 'Expenses', roles: ['MANAGER', 'OWNER'] }
    ]
  },
  {
    id: 'catalog',
    label: 'Catalog',
    items: [
      { href: '/inventory', label: 'Inventory', roles: ['MANAGER', 'OWNER'] },
      { href: '/inventory/adjustments', label: 'Stock Adjustments', roles: ['MANAGER', 'OWNER'] },
      { href: '/products', label: 'Products', roles: ['CASHIER', 'MANAGER', 'OWNER'] },
      { href: '/customers', label: 'Customers', roles: ['MANAGER', 'OWNER'] },
      { href: '/suppliers', label: 'Suppliers', roles: ['MANAGER', 'OWNER'] }
    ]
  },
  {
    id: 'payments',
    label: 'Payments',
    items: [
      { href: '/payments/customer-receipts', label: 'Customer Receipts', roles: ['MANAGER', 'OWNER'] },
      { href: '/payments/supplier-payments', label: 'Supplier Payments', roles: ['MANAGER', 'OWNER'] },
      { href: '/payments/reconciliation', label: 'MoMo Reconciliation', roles: ['MANAGER', 'OWNER'] }
    ]
  },
  {
    id: 'reports',
    label: 'Reports',
    items: [
      { href: '/reports/owner', label: '⚡ Owner Intelligence', roles: ['OWNER'] },
      { href: '/reports/dashboard', label: 'Dashboard', roles: ['MANAGER', 'OWNER'] },
      { href: '/reports/analytics', label: 'Analytics', roles: ['MANAGER', 'OWNER'] },
      { href: '/reports/cash-drawer', label: 'Cash Drawer', roles: ['MANAGER', 'OWNER'] },
      { href: '/reports/margins', label: 'Profit Margins', roles: ['MANAGER', 'OWNER'] },
      { href: '/reports/reorder-suggestions', label: 'Reorder Suggestions', roles: ['MANAGER', 'OWNER'] },
      { href: '/reports/cashflow-forecast', label: 'Cashflow Forecast', roles: ['OWNER'] },
      { href: '/reports/exports', label: 'Exports', roles: ['MANAGER', 'OWNER'] },
      { href: '/reports/risk-monitor', label: 'Risk Monitor', roles: ['MANAGER', 'OWNER'] },
      { href: '/reports/income-statement', label: 'Income Statement', roles: ['MANAGER', 'OWNER'] },
      { href: '/reports/balance-sheet', label: 'Balance Sheet', roles: ['MANAGER', 'OWNER'] },
      { href: '/reports/cashflow', label: 'Cashflow', roles: ['MANAGER', 'OWNER'] },
      { href: '/reports/audit-log', label: 'Audit Log', roles: ['OWNER'] }
    ]
  },
  {
    id: 'admin',
    label: 'Administration',
    items: [
      { href: '/account', label: 'My Account', roles: ['CASHIER', 'MANAGER', 'OWNER'] },
      { href: '/settings', label: 'Settings', roles: ['OWNER', 'MANAGER'] },
      { href: '/users', label: 'Users', roles: ['OWNER'] },
      { href: '/onboarding', label: 'Setup Guide', roles: ['OWNER'] }
    ]
  }
];

export type TopNavUser = {
  name: string;
  role: 'CASHIER' | 'MANAGER' | 'OWNER';
};

export default function TopNav({
  user,
  mode,
  storeMode,
  storeName,
  momoEnabled,
  todaySales,
}: {
  user: TopNavUser;
  mode?: BusinessMode;
  storeMode?: StoreMode;
  storeName?: string;
  momoEnabled?: boolean;
  todaySales?: { totalPence: number; txCount: number; currency: string };
}) {
  const pathname = usePathname();
  const features = getFeatures(mode ?? 'SIMPLE', storeMode ?? 'SINGLE_STORE');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const isOnline = useNetworkStatus();
  const navRef = useRef<HTMLDivElement>(null);
  const advancedReportLinks = new Set<string>();

  const visibleGroups = useMemo(() => {
    return navGroups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) =>
          item.roles.includes(user.role) &&
          (features.multiStore || item.href !== '/transfers') &&
          (momoEnabled !== false || item.href !== '/payments/reconciliation')
        )
      }))
      .filter((group) => group.items.length > 0);
  }, [user.role, features.multiStore, momoEnabled]);

  useEffect(() => {
    setOpenGroup(null);
    setMobileOpen(false);
  }, [pathname]);

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [mobileOpen]);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (!navRef.current) return;
      if (!navRef.current.contains(event.target as Node)) {
        setOpenGroup(null);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/88 backdrop-blur-2xl shadow-nav" role="banner">
        <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-50 focus:rounded-lg focus:bg-accent focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white">
          Skip to content
        </a>
        <div className="flex w-full items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex min-w-0 flex-1 items-center gap-3 lg:gap-6">
            <a href="/pos" className="flex min-w-0 items-center gap-3" aria-label="TillFlow — go to POS">
              <img src="/icon.svg" alt="" width="36" height="36" className="h-9 w-9 rounded-xl shadow-sm" aria-hidden="true" />
              <div className="min-w-0">
                <div className="text-lg font-display font-bold leading-none">
                <span className="bg-gradient-to-r from-blue-800 to-blue-500 bg-clip-text text-transparent">Till</span>
                <span className="text-gray-800">Flow</span>
                </div>
                <div className="hidden text-[11px] font-medium uppercase tracking-[0.24em] text-muted sm:block">
                  Executive retail operations
                </div>
              </div>
            </a>

            <div className="hidden xl:flex items-center gap-2">
              <span className="metric-chip">
                <span className="h-2 w-2 rounded-full bg-accent" aria-hidden="true" />
                {storeName || 'Main store'}
              </span>
              <span className={isOnline ? 'status-badge-online' : 'status-badge-offline'}>
                {isOnline ? 'Sync ready' : 'Offline mode'}
              </span>
            </div>
          </div>

          <nav ref={navRef} aria-label="Main navigation" className="hidden items-center gap-2 lg:flex">
            {visibleGroups.map((group) => {
              const isActive = group.items.some(
                (item) => pathname === item.href || pathname.startsWith(item.href + '/')
              );
              return (
                <div key={group.id} className="relative">
                  <button
                    type="button"
                    onClick={() => setOpenGroup((prev) => (prev === group.id ? null : group.id))}
                    aria-expanded={openGroup === group.id}
                    aria-haspopup="true"
                    className={isActive ? 'shell-nav-trigger shell-nav-trigger-active' : 'shell-nav-trigger'}
                  >
                    {group.label}
                  </button>
                  {openGroup === group.id ? (
                    <div
                      className="shell-dropdown-panel absolute left-0 mt-2.5 min-w-[240px] animate-scale-in"
                      onMouseLeave={() => setOpenGroup(null)}
                    >
                      <div className="px-3 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-muted">
                        {group.label}
                      </div>
                      {group.items.map((item) => {
                        const active = pathname === item.href;
                        const isAdvanced = group.id === 'reports' && advancedReportLinks.has(item.href);
                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            className={active ? 'shell-nav-link shell-nav-link-active' : 'shell-nav-link'}
                            onClick={() => setOpenGroup(null)}
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
                  ) : null}
                </div>
              );
            })}
          </nav>

          <div className="flex items-center gap-2 sm:gap-3">
            <InstallButton />
            <NavTrustPanel user={user} storeName={storeName} isOnline={isOnline} todaySales={todaySales} />
            <button
              type="button"
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200/80 bg-white/90 shadow-sm transition hover:bg-slate-50 active:bg-slate-100 lg:hidden"
              onClick={() => setMobileOpen((prev) => !prev)}
              aria-expanded={mobileOpen}
              aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
            >
              {mobileOpen ? (
                <svg className="h-5 w-5 text-ink" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="h-5 w-5 text-ink" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
          </div>
        </div>

        <div className="border-t border-slate-200/60 bg-white/80 px-4 py-2 lg:hidden sm:px-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className="metric-chip">
              <span className="h-2 w-2 rounded-full bg-accent" aria-hidden="true" />
              {storeName || 'Main store'}
            </span>
            <span className={isOnline ? 'status-badge-online' : 'status-badge-offline'}>
              {isOnline ? 'Sync ready' : 'Offline mode'}
            </span>
          </div>
          {todaySales && (user.role === 'MANAGER' || user.role === 'OWNER') ? (
            <div className="mt-1 text-xs font-semibold tabular-nums text-ink">
              {formatMoney(todaySales.totalPence, todaySales.currency)} · {todaySales.txCount} txn{todaySales.txCount !== 1 ? 's' : ''} today
            </div>
          ) : null}
        </div>
      </header>

      <NavMobileMenu
        mobileOpen={mobileOpen}
        setMobileOpen={setMobileOpen}
        visibleGroups={visibleGroups}
        isOnline={isOnline}
        user={user}
        storeName={storeName}
        features={features}
        pathname={pathname}
        advancedReportLinks={advancedReportLinks}
        todaySales={todaySales}
      />
    </>
  );
}
