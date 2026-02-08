'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { logout } from '@/app/actions/auth';
import { getFeatures, type BusinessMode } from '@/lib/features';

const navGroups = [
  {
    id: 'operations',
    label: 'Operations',
    items: [
      { href: '/pos', label: 'POS', roles: ['CASHIER', 'MANAGER', 'OWNER'] },
      { href: '/sales', label: 'Sales', roles: ['MANAGER', 'OWNER'] },
      { href: '/purchases', label: 'Purchases', roles: ['MANAGER', 'OWNER'] }
    ]
  },
  {
    id: 'catalog',
    label: 'Catalog',
    items: [
      { href: '/inventory', label: 'Inventory', roles: ['MANAGER', 'OWNER'] },
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
      { href: '/payments/supplier-payments', label: 'Supplier Payments', roles: ['MANAGER', 'OWNER'] }
    ]
  },
  {
    id: 'reports',
    label: 'Reports',
    items: [
      { href: '/reports/dashboard', label: 'Dashboard', roles: ['MANAGER', 'OWNER'] },
      { href: '/reports/analytics', label: 'Analytics', roles: ['MANAGER', 'OWNER'] },
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
      { href: '/settings/backup', label: 'Data Backup', roles: ['OWNER'] },
      { href: '/settings/receipt-design', label: 'Receipt Design', roles: ['OWNER', 'MANAGER'] },
      { href: '/users', label: 'Users', roles: ['OWNER'] }
    ]
  },
  {
    id: 'help',
    label: 'Help',
    items: [
      { href: '/onboarding', label: 'Setup Guide', roles: ['CASHIER', 'MANAGER', 'OWNER'] }
    ]
  }
];

export type SidebarUser = {
  name: string;
  role: 'CASHIER' | 'MANAGER' | 'OWNER';
};

export default function Sidebar({ user, mode }: { user: SidebarUser; mode?: BusinessMode }) {
  const pathname = usePathname();
  const features = getFeatures(mode ?? 'SIMPLE');
  const advancedReportLinks = new Set([
    '/reports/income-statement',
    '/reports/balance-sheet',
    '/reports/cashflow'
  ]);
  const initialOpen = useMemo(() => {
    const openState: Record<string, boolean> = {};
    navGroups.forEach((group) => {
      openState[group.id] =
        group.id === 'operations' ||
        group.items.some((item) => pathname === item.href || pathname.startsWith(item.href + '/'));
    });
    return openState;
  }, [pathname]);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(initialOpen);

  useEffect(() => {
    const activeGroup = navGroups.find((group) =>
      group.items.some((item) => pathname === item.href || pathname.startsWith(item.href + '/'))
    );
    if (activeGroup) {
      setOpenGroups((prev) =>
        prev[activeGroup.id] ? prev : { ...prev, [activeGroup.id]: true }
      );
    }
  }, [pathname]);
  return (
    <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:shrink-0 lg:border-r lg:border-black/5 lg:bg-white/70">
      <div className="px-6 py-8">
        <div className="flex items-center gap-3">
          <img src="/icon.svg" alt="TillFlow" className="h-10 w-10 rounded-xl" />
          <div>
            <div className="text-xl font-display font-bold">
              <span className="text-emerald-600">Till</span>
              <span className="text-gray-700">Flow</span>
            </div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-black/40">Sales made simple</div>
          </div>
        </div>
      </div>
      <nav className="flex-1 space-y-2 px-4">
        {navGroups.map((group) => {
          const visibleItems = group.items.filter((item) => item.roles.includes(user.role));
          if (visibleItems.length === 0) return null;
          const isOpen = openGroups[group.id];
          return (
            <div key={group.id} className="pt-1">
              <button
                type="button"
                onClick={() => setOpenGroups((prev) => ({ ...prev, [group.id]: !prev[group.id] }))}
                className="flex w-full items-center justify-between rounded-xl px-4 py-2 text-sm font-semibold text-black/70 hover:bg-black/5"
              >
                <span>{group.label}</span>
                <span className="text-xs text-black/40">{isOpen ? '-' : '+'}</span>
              </button>
              {isOpen ? (
                <div className="mt-1 space-y-1 pl-3">
                  {visibleItems.map((item) => {
                    const active = pathname === item.href;
                    const isAdvanced = group.id === 'reports' && advancedReportLinks.has(item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={`block rounded-xl px-3 py-2 text-sm font-semibold transition ${active ? 'bg-accent text-white shadow-soft' : 'text-black/70 hover:bg-black/5'
                          }`}
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span>{item.label}</span>
                          {!features.advancedReports && isAdvanced ? (
                            <span className="rounded-full bg-black/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] text-black/50">
                              Advanced
                            </span>
                          ) : null}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
      </nav>
      <div className="px-6 py-6 text-sm text-black/60">
        <div className="font-semibold text-black">{user.name}</div>
        <div className="text-xs uppercase tracking-[0.2em]">{user.role}</div>
        <form action={logout} className="mt-4">
          <button type="submit" className="btn-ghost w-full text-xs">
            Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}
