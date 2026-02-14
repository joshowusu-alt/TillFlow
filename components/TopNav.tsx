'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { logout } from '@/app/actions/auth';
import { getFeatures, type BusinessMode } from '@/lib/features';
import InstallButton from './InstallButton';

const navGroups = [
  {
    id: 'operations',
    label: 'Operations',
    items: [
      { href: '/pos', label: 'POS', roles: ['CASHIER', 'MANAGER', 'OWNER'] },
      { href: '/shifts', label: 'Shifts', roles: ['CASHIER', 'MANAGER', 'OWNER'] },
      { href: '/sales', label: 'Sales', roles: ['MANAGER', 'OWNER'] },
      { href: '/purchases', label: 'Purchases', roles: ['MANAGER', 'OWNER'] },
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
      { href: '/payments/expense-payments', label: 'Expense Payments', roles: ['MANAGER', 'OWNER'] }
    ]
  },
  {
    id: 'reports',
    label: 'Reports',
    items: [
      { href: '/reports/dashboard', label: 'Dashboard', roles: ['MANAGER', 'OWNER'] },
      { href: '/reports/margins', label: 'Profit Margins', roles: ['MANAGER', 'OWNER'] },
      { href: '/reports/exports', label: 'Exports', roles: ['MANAGER', 'OWNER'] },
      { href: '/reports/income-statement', label: 'Income Statement', roles: ['MANAGER', 'OWNER'] },
      { href: '/reports/balance-sheet', label: 'Balance Sheet', roles: ['MANAGER', 'OWNER'] },
      { href: '/reports/cashflow', label: 'Cashflow', roles: ['MANAGER', 'OWNER'] }
    ]
  },
  {
    id: 'admin',
    label: 'Administration',
    items: [
      { href: '/settings', label: 'Settings', roles: ['OWNER', 'MANAGER'] },
      { href: '/users', label: 'Users', roles: ['OWNER'] }
    ]
  }
];

export type TopNavUser = {
  name: string;
  role: 'CASHIER' | 'MANAGER' | 'OWNER';
};

export default function TopNav({ user, mode }: { user: TopNavUser; mode?: BusinessMode }) {
  const pathname = usePathname();
  const features = getFeatures(mode ?? 'SIMPLE');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const navRef = useRef<HTMLDivElement>(null);
  const advancedReportLinks = new Set([
    '/reports/income-statement',
    '/reports/balance-sheet',
    '/reports/cashflow'
  ]);

  const visibleGroups = useMemo(() => {
    return navGroups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => item.roles.includes(user.role))
      }))
      .filter((group) => group.items.length > 0);
  }, [user.role]);

  useEffect(() => {
    setOpenGroup(null);
    setMobileOpen(false);
  }, [pathname]);

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
    <header className="sticky top-0 z-30 border-b border-black/5 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4 px-6 py-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <img src="/icon.svg" alt="TillFlow" width="32" height="32" className="h-8 w-8 rounded-lg" />
            <div className="text-lg font-display font-bold">
              <span className="text-emerald-600">Till</span>
              <span className="text-gray-700">Flow</span>
            </div>
          </div>
        </div>

        <nav ref={navRef} className="hidden items-center gap-3 lg:flex">
          {visibleGroups.map((group) => {
            const isActive = group.items.some(
              (item) => pathname === item.href || pathname.startsWith(item.href + '/')
            );
            return (
              <div key={group.id} className="relative">
                <button
                  type="button"
                  onClick={() => setOpenGroup((prev) => (prev === group.id ? null : group.id))}
                  className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${isActive ? 'bg-accent text-white shadow-soft' : 'text-black/70 hover:bg-black/5'
                    }`}
                >
                  {group.label}
                </button>
                {openGroup === group.id ? (
                  <div
                    className="absolute left-0 mt-2 min-w-[220px] rounded-2xl border border-black/10 bg-white p-2 shadow-soft"
                    onMouseLeave={() => setOpenGroup(null)}
                  >
                    {group.items.map((item) => {
                      const active = pathname === item.href;
                      const isAdvanced = group.id === 'reports' && advancedReportLinks.has(item.href);
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          className={`flex items-center justify-between rounded-xl px-3 py-2 text-sm font-semibold transition ${active ? 'bg-black/5 text-black' : 'text-black/70 hover:bg-black/5'
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
          <div className="hidden text-right text-xs text-black/50 sm:block">
            <div className="font-semibold text-black">{user.name}</div>
            <div className="uppercase tracking-[0.2em]">{user.role}</div>
          </div>
          <form action={logout} className="hidden sm:block">
            <button type="submit" className="btn-ghost text-xs">
              Sign out
            </button>
          </form>
          <button
            type="button"
            className="btn-ghost text-xs lg:hidden"
            onClick={() => setMobileOpen((prev) => !prev)}
          >
            {mobileOpen ? 'Close' : 'Menu'}
          </button>
        </div>
      </div>

      {mobileOpen ? (
        <div className="border-t border-black/10 bg-white/95 px-6 pb-6 lg:hidden">
          <div className="mt-4 space-y-4">
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
                        className={`flex items-center justify-between rounded-xl px-3 py-2 text-sm font-semibold ${active ? 'bg-accent text-white shadow-soft' : 'bg-white text-black/70'
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
      ) : null}
    </header>
  );
}
