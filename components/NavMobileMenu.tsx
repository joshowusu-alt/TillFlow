'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { logout } from '@/app/actions/auth';
import { getFeatures, hasPlanAccess, type BusinessPlan } from '@/lib/features';
import { getFeatureLockLabel, type FeatureKey } from '@/lib/navigation-config';
import {
  getCashierMenu,
  getManagerMenu,
  getOwnerLauncherMenu,
  MOBILE_TAB_NAV_HREFS_BY_ROLE,
  type MobileBrowseArea,
  type MobileNavContext,
  type MobileNavLink,
  type OwnerQuickAction,
} from '@/lib/navigation/mobile-menu-config';
import InstallButton from './InstallButton';
import NavIcon from './navigation/NavIcon';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';
import type { TopNavUser } from './TopNav';

interface NavMobileMenuProps {
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
  pendingHref?: string | null;
  onNavigateStart?: (href: string) => void;
  isOnline: boolean;
  user: TopNavUser;
  storeName?: string;
  businessName?: string;
  features: ReturnType<typeof getFeatures>;
  pathname: string;
  planGatedLinks: Map<string, BusinessPlan>;
  featureGatedLinks?: Map<string, FeatureKey>;
  onlineOrdersCount?: number;
  momoEnabled?: boolean;
}

function roleLabel(role: TopNavUser['role']) {
  if (role === 'OWNER') return 'Owner';
  if (role === 'MANAGER') return 'Manager';
  return 'Cashier';
}

function pathIsActive(pathname: string, href: string) {
  return pathname === href || (href !== '/reports' && pathname.startsWith(`${href}/`));
}

function quickActionIconTone(actionId: string) {
  switch (actionId) {
    case 'open-pos':
      return 'bg-blue-50 text-blue-700';
    case 'sales':
      return 'bg-emerald-50 text-emerald-700';
    case 'inventory':
      return 'bg-indigo-50 text-indigo-700';
    case 'purchases':
      return 'bg-amber-50 text-amber-800';
    case 'reports':
      return 'bg-violet-50 text-violet-700';
    case 'business-settings':
      return 'bg-slate-100 text-slate-700';
    default:
      return 'bg-slate-100 text-slate-700';
  }
}

export default function NavMobileMenu({
  mobileOpen,
  setMobileOpen,
  pendingHref,
  onNavigateStart,
  isOnline,
  user,
  storeName,
  businessName,
  features,
  pathname,
  planGatedLinks,
  featureGatedLinks,
  onlineOrdersCount = 0,
  momoEnabled = true,
}: NavMobileMenuProps) {
  useBodyScrollLock(mobileOpen);
  const [expandedAreas, setExpandedAreas] = useState<Record<string, boolean>>({});

  const menuContext = useMemo<MobileNavContext>(
    () => ({
      role: user.role,
      features,
      momoEnabled,
    }),
    [features, momoEnabled, user.role],
  );

  const hiddenTabHrefs = MOBILE_TAB_NAV_HREFS_BY_ROLE[user.role];

  const ownerMenu = useMemo(
    () => (user.role === 'OWNER' ? getOwnerLauncherMenu(menuContext, hiddenTabHrefs) : null),
    [hiddenTabHrefs, menuContext, user.role],
  );

  const managerSections = useMemo(
    () => (user.role === 'MANAGER' ? getManagerMenu(menuContext, hiddenTabHrefs) : []),
    [hiddenTabHrefs, menuContext, user.role],
  );

  const cashierItems = useMemo(
    () => (user.role === 'CASHIER' ? getCashierMenu(menuContext, hiddenTabHrefs) : []),
    [hiddenTabHrefs, menuContext, user.role],
  );

  useEffect(() => {
    if (!mobileOpen) return;

    const closeMenu = () => setMobileOpen(false);
    const mediaQuery = window.matchMedia('(min-width: 1024px)');
    const handleMediaChange = (event: MediaQueryListEvent) => {
      if (event.matches) setMobileOpen(false);
    };

    window.addEventListener('orientationchange', closeMenu);
    mediaQuery.addEventListener('change', handleMediaChange);

    return () => {
      window.removeEventListener('orientationchange', closeMenu);
      mediaQuery.removeEventListener('change', handleMediaChange);
    };
  }, [mobileOpen, setMobileOpen]);

  if (!mobileOpen) return null;

  const handleNavigateStart = (href: string) => {
    onNavigateStart?.(href);
  };

  const toggleArea = (areaId: string) => {
    setExpandedAreas((current) => ({ ...current, [areaId]: !current[areaId] }));
  };

  const renderLockBadge = (href: string) => {
    const requiredFeature = featureGatedLinks?.get(href);
    const featureLocked = requiredFeature ? !features[requiredFeature] : false;
    const minimumPlan = planGatedLinks.get(href);
    const planLocked = !requiredFeature && minimumPlan ? !hasPlanAccess(features.plan, minimumPlan) : false;
    const lockLabel =
      featureLocked && requiredFeature
        ? getFeatureLockLabel(requiredFeature, features.plan)
        : planLocked
          ? minimumPlan
          : null;

    if (lockLabel) {
      return (
        <span className="rounded-full bg-black/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] text-black/50">
          {lockLabel}
        </span>
      );
    }

    if (href === '/online-orders' && onlineOrdersCount > 0) {
      return (
        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 text-[10px] font-bold leading-none text-white">
          {onlineOrdersCount > 99 ? '99+' : onlineOrdersCount}
        </span>
      );
    }

    return null;
  };

  const renderNavLink = (item: MobileNavLink, variant: 'row' | 'compact' = 'row') => {
    const active = pathIsActive(pathname, item.href);
    const isPending = pendingHref === item.href;
    const badge = renderLockBadge(item.href);

    const baseClasses =
      variant === 'compact'
        ? 'flex min-h-11 items-center justify-between gap-3 rounded-xl border border-slate-200/70 bg-white px-3.5 py-2.5 text-sm font-medium text-ink'
        : 'flex min-h-11 items-center justify-between gap-3 rounded-xl border border-slate-200/70 bg-white px-3.5 py-3 text-sm font-medium text-ink';

    const stateClasses = [
      active ? 'border-blue-200 bg-blue-50/80 text-blue-950' : '',
      isPending ? 'border-blue-200 bg-blue-50/90 shadow-sm' : '',
      pendingHref && !isPending ? 'opacity-60' : '',
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <Link
        key={item.href + item.label}
        href={item.href}
        className={`${baseClasses} ${stateClasses}`.trim()}
        aria-busy={isPending || undefined}
        data-mobile-nav-pending={isPending ? 'true' : undefined}
        onClick={() => {
          handleNavigateStart(item.href);
          setMobileOpen(false);
        }}
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
            <NavIcon iconKey={item.iconKey} className="h-[18px] w-[18px]" />
          </span>
          <span className="min-w-0 truncate">{item.label}</span>
        </span>
        {badge}
      </Link>
    );
  };

  const renderQuickActionTile = (item: OwnerQuickAction) => {
    const active = pathIsActive(pathname, item.href);
    const isPending = pendingHref === item.href;
    const badge = renderLockBadge(item.href);
    const stateClasses = [
      active ? 'border-blue-200 bg-blue-50/80 text-blue-950' : '',
      isPending ? 'border-blue-200 bg-blue-50/90 shadow-sm' : '',
      pendingHref && !isPending ? 'opacity-60' : '',
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <Link
        key={item.href + item.label}
        href={item.href}
        className={`flex min-h-[4.75rem] flex-col items-start gap-2 rounded-2xl border border-slate-200/80 bg-white p-3 text-left shadow-sm transition active:scale-[0.99] ${stateClasses}`.trim()}
        aria-busy={isPending || undefined}
        data-mobile-nav-pending={isPending ? 'true' : undefined}
        onClick={() => {
          handleNavigateStart(item.href);
          setMobileOpen(false);
        }}
      >
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${quickActionIconTone(item.id)}`}
        >
          <NavIcon iconKey={item.iconKey} className="h-[17px] w-[17px]" />
        </span>
        <span className="min-w-0 text-[13px] font-medium leading-snug text-ink [overflow-wrap:anywhere]">
          {item.label}
        </span>
        {badge ? <span className="mt-auto">{badge}</span> : null}
      </Link>
    );
  };

  const renderBrowseArea = (area: MobileBrowseArea) => {
    const expanded = expandedAreas[area.id] ?? false;

    return (
      <section key={area.id} className="overflow-hidden rounded-2xl border border-slate-200/80 bg-slate-50/70">
        <button
          type="button"
          className="flex w-full items-start justify-between gap-3 px-4 py-3.5 text-left"
          aria-expanded={expanded}
          onClick={() => toggleArea(area.id)}
        >
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-ink">{area.label}</span>
            {area.description ? (
              <span className="mt-0.5 block text-xs leading-5 text-black/55">{area.description}</span>
            ) : null}
          </span>
          <svg
            className={`mt-0.5 h-4 w-4 shrink-0 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {expanded ? (
          <div className="grid gap-2 border-t border-slate-200/70 px-3 py-3">
            {area.items.map((item) => renderNavLink(item, 'compact'))}
          </div>
        ) : null}
      </section>
    );
  };

  return (
    <>
      <div className="fixed inset-0 z-40 bg-slate-950/25 backdrop-blur-[2px] lg:hidden" onClick={() => setMobileOpen(false)} />
      <div className="nav-mobile-panel fixed z-50 overflow-hidden rounded-[28px] border border-slate-200/80 bg-white/95 shadow-floating backdrop-blur-xl lg:hidden">
        <div className="flex h-full flex-col">
          <div className="border-b border-slate-200/80 bg-gradient-to-r from-slate-50 via-white to-blue-50/60 px-4 py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-base font-semibold text-ink">{businessName || 'Your business'}</div>
                <div className="mt-1 text-sm text-black/60">{storeName || 'Main branch'}</div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-800">
                    {roleLabel(user.role)}
                  </span>
                  <span className={isOnline ? 'status-badge-online' : 'status-badge-offline'}>
                    {isOnline ? 'Online' : 'Offline'}
                  </span>
                </div>
              </div>
            </div>
            <div className="mt-3">
              <InstallButton />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto overscroll-contain px-3.5 py-3.5 pb-6">
            {user.role === 'OWNER' && ownerMenu ? (
              <div className="space-y-4">
                <section>
                  <div className="px-0.5 pb-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">
                    Quick actions
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {ownerMenu.quickActions.map((item) => renderQuickActionTile(item))}
                  </div>
                </section>

                <section className="space-y-2">
                  <div className="px-0.5 pb-0.5 text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">
                    Browse by area
                  </div>
                  {ownerMenu.browseAreas.map((area) => renderBrowseArea(area))}
                </section>
              </div>
            ) : null}

            {user.role === 'MANAGER' ? (
              <div className="space-y-4">
                <div className="px-1 text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">Operations</div>
                {managerSections.map((section) => (
                  <section key={section.id} className="space-y-2">
                    {section.id !== 'operations' ? (
                      <div className="px-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-400">
                        {section.label}
                      </div>
                    ) : null}
                    <div className="grid gap-2">
                      {section.items.map((item) => renderNavLink(item, 'compact'))}
                    </div>
                  </section>
                ))}
              </div>
            ) : null}

            {user.role === 'CASHIER' ? (
              <div className="grid gap-2">
                {cashierItems.map((item) => renderNavLink(item, 'compact'))}
              </div>
            ) : null}
          </div>

          <div className="shrink-0 space-y-1.5 border-t border-slate-200/80 bg-slate-50/90 px-3.5 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
            <Link
              href="/help"
              className="btn-ghost w-full py-2 text-sm"
              onClick={() => {
                handleNavigateStart('/help');
                setMobileOpen(false);
              }}
            >
              Help & support
            </Link>
            <form action={logout}>
              <button type="submit" className="btn-ghost w-full py-2 text-sm text-black/70">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}
