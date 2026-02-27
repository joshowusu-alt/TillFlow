'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { getFeatures, type BusinessMode, type StoreMode } from '@/lib/features';
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
      <header className="sticky top-0 z-30 border-b border-gray-200 bg-white/95 backdrop-blur shadow-sm" role="banner">
        <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-50 focus:rounded-lg focus:bg-accent focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white">
          Skip to content
        </a>
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-4">
            <a href="/pos" className="flex items-center gap-2" aria-label="TillFlow — go to POS">
              <img src="/icon.svg" alt="" width="32" height="32" className="h-8 w-8 rounded-lg" aria-hidden="true" />
              <div className="text-lg font-display font-bold">
                <span className="text-accent">Till</span>
                <span className="text-gray-700">Flow</span>
              </div>
            </a>
          </div>

          <nav ref={navRef} aria-label="Main navigation" className="hidden items-center gap-3 lg:flex">
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
                    className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors duration-150 ${isActive ? 'bg-accent text-white' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                      }`}
                  >
                    {group.label}
                  </button>
                  {openGroup === group.id ? (
                    <div
                      className="absolute left-0 mt-2 min-w-[220px] rounded-xl border border-gray-200 bg-white p-2 shadow-soft animate-scale-in"
                      onMouseLeave={() => setOpenGroup(null)}
                    >
                      {group.items.map((item) => {
                        const active = pathname === item.href;
                        const isAdvanced = group.id === 'reports' && advancedReportLinks.has(item.href);
                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors ${active ? 'bg-accentSoft text-accent font-semibold' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                              }`}
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

          <div className="flex items-center gap-3">
            <InstallButton />
            <NavTrustPanel user={user} storeName={storeName} isOnline={isOnline} todaySales={todaySales} />
            <button
              type="button"
              className="flex items-center justify-center h-11 w-11 rounded-xl bg-black/5 hover:bg-black/10 active:bg-black/15 transition lg:hidden"
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
      />
    </>
  );
}
