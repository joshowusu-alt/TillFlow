'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { refreshCurrentView } from '@/app/actions/refresh';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { getFeatures, hasPlanAccess, type BusinessPlan, type StoreMode } from '@/lib/features';
import { formatMoney } from '@/lib/format';
import { getFeatureLockLabel, NAV_GROUPS, type FeatureKey } from '@/lib/navigation-config';
import { getNavTodaySales } from '@/app/actions/nav-kpis';
import type { MerchantBrandProfile } from '@/lib/merchant-branding';
import InstallButton from './InstallButton';
import { Logo } from './Logo';
import MerchantBrandBadge from './MerchantBrandBadge';
import NavTrustPanel from './NavTrustPanel';
import NavMobileMenu from './NavMobileMenu';
import { OPEN_MOBILE_NAV_EVENT } from './BottomTabBar';

export type TopNavUser = {
  name: string;
  role: 'CASHIER' | 'MANAGER' | 'OWNER';
};

export default function TopNav({
  user,
  plan,
  storeMode,
  storeName,
  businessName,
  merchantBranding,
  momoEnabled,
  addonOnlineStorefront = false,
  todaySales,
  onlineOrdersCount = 0,
}: {
  user: TopNavUser;
  plan?: BusinessPlan;
  storeMode?: StoreMode;
  storeName?: string;
  businessName?: string;
  merchantBranding?: MerchantBrandProfile;
  momoEnabled?: boolean;
  addonOnlineStorefront?: boolean;
  todaySales?: { totalPence: number; txCount: number; currency: string };
  onlineOrdersCount?: number;
}){
  const pathname = usePathname() ?? '';
  const features = getFeatures(plan ?? 'STARTER', storeMode ?? 'SINGLE_STORE', { onlineStorefront: addonOnlineStorefront });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [liveTodaySales, setLiveTodaySales] = useState(todaySales);
  const lastSalesRefreshAtRef = useRef(0);
  const isOnline = useNetworkStatus();
  const router = useRouter();
  const [isRefreshing, startRefreshTransition] = useTransition();

  const handleRefresh = () => {
    if (isRefreshing || !isOnline) return;
    startRefreshTransition(async () => {
      await refreshCurrentView(pathname).catch(() => null);
      router.refresh();
    });
  };
  const navRef = useRef<HTMLDivElement>(null);
  const planGatedLinks = useMemo(
    () =>
      new Map(
        NAV_GROUPS.flatMap((group) =>
          group.items
            .filter((item): item is typeof item & { minimumPlan: BusinessPlan } => Boolean(item.minimumPlan))
            .map((item) => [item.href, item.minimumPlan] as const)
        )
      ),
    []
  );

  const featureGatedLinks = useMemo(
    () =>
      new Map(
        NAV_GROUPS.flatMap((group) =>
          group.items
            .filter((item): item is typeof item & { requiresFeature: FeatureKey } => Boolean(item.requiresFeature))
            .map((item) => [item.href, item.requiresFeature] as const)
        )
      ),
    []
  );

  const visibleGroups = useMemo(() => {
    const itemIsVisible = (item: (typeof NAV_GROUPS)[number]['items'][number]) =>
      item.roles.includes(user.role) &&
      (features.multiStore || item.href !== '/transfers') &&
      (momoEnabled !== false || item.href !== '/payments/reconciliation');

    return NAV_GROUPS
      .map((group) => {
        const items = group.items.filter(itemIsVisible);
        const sections = group.sections
          ?.map((section) => ({ ...section, items: section.items.filter(itemIsVisible) }))
          .filter((section) => section.items.length > 0);
        return { ...group, items, sections };
      })
      .filter((group) => group.items.length > 0);
  }, [user.role, features.multiStore, momoEnabled]);

  const showMobileSalesPulse =
    Boolean(liveTodaySales && (user.role === 'MANAGER' || user.role === 'OWNER')) &&
    !pathname.startsWith('/onboarding');
  const mobileSales = showMobileSalesPulse ? liveTodaySales : undefined;

  useEffect(() => {
    setLiveTodaySales(todaySales);
  }, [todaySales]);

  useEffect(() => {
    if (!(user.role === 'MANAGER' || user.role === 'OWNER')) return;

    let cancelled = false;
    const refreshSales = async (force = false) => {
      const now = Date.now();
      if (!force && now - lastSalesRefreshAtRef.current < 8_000) return;
      lastSalesRefreshAtRef.current = now;
      try {
        const fresh = await getNavTodaySales();
        if (!cancelled) {
          setLiveTodaySales({
            totalPence: fresh.totalPence,
            txCount: fresh.txCount,
            currency: fresh.currency,
          });
        }
      } catch {
        // Keep the server-rendered value if the lightweight refresh cannot complete.
      }
    };

    if (mobileOpen) {
      void refreshSales(true);
    }

    const handleFocus = () => void refreshSales(false);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void refreshSales(false);
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      cancelled = true;
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [mobileOpen, user.role]);

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

  // BottomTabBar's "More" tab opens the mobile drawer via this custom
  // event. Siblings in the layout tree can't share React state directly,
  // and a context would force the server-component layout to wrap.
  useEffect(() => {
    const handleOpen = () => setMobileOpen(true);
    window.addEventListener(OPEN_MOBILE_NAV_EVENT, handleOpen);
    return () => window.removeEventListener(OPEN_MOBILE_NAV_EVENT, handleOpen);
  }, []);

  return (
    <>
      <header
        className="app-shell-header border-b border-slate-200/80 bg-white/96 backdrop-blur-2xl shadow-nav"
        role="banner"
        style={{ position: 'sticky', top: 0, zIndex: 30 }}
      >
        <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-50 focus:rounded-lg focus:bg-accent focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white">
          Skip to content
        </a>
        <div className="flex w-full items-center justify-between gap-3 px-4 py-2.5 sm:px-6 lg:px-7 lg:py-2">
          <a
            href="/pos"
            aria-label="TillFlow — go to POS"
            className="shrink-0"
          >
            <Logo
              variant="lockup"
              size={32}
              className="gap-2.5"
              wordmarkClassName="h-8 w-auto"
              ariaHidden
            />
          </a>

          <nav
            ref={navRef}
            aria-label="Main navigation"
            className="hidden min-w-0 flex-1 items-center justify-center gap-1 lg:flex"
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                setOpenGroup(null);
              }
            }}
          >
            {visibleGroups.map((group) => {
              const isActive = group.items.some(
                (item) => pathname === item.href || pathname.startsWith(item.href + '/')
              );
              const groupHasOnlineOrders = group.items.some((i) => i.href === '/online-orders');
              const showGroupBadge = groupHasOnlineOrders && onlineOrdersCount > 0;
              const sections = group.sections?.length ? group.sections : [{ id: group.id, label: '', items: group.items }];
              const isReportsMenu = group.id === 'reports' && sections.length > 1;
              const reportLeftSections = sections.filter((section) => ['main', 'sales-stock', 'finance'].includes(section.id));
              const reportRightSections = sections.filter((section) => ['control', 'advanced'].includes(section.id));
              const sectionColumns = isReportsMenu
                ? [reportLeftSections, reportRightSections].filter((column) => column.length > 0)
                : [sections];

              const renderNavItem = (item: (typeof sections)[number]['items'][number]) => {
                const active = pathname === item.href;
                const requiredFeature = featureGatedLinks.get(item.href);
                const featureLocked = requiredFeature ? !features[requiredFeature] : false;
                const minimumPlan = planGatedLinks.get(item.href);
                const planLocked = !requiredFeature && minimumPlan ? !hasPlanAccess(features.plan, minimumPlan) : false;
                const lockLabel =
                  featureLocked && requiredFeature
                    ? getFeatureLockLabel(requiredFeature, features.plan)
                    : planLocked
                      ? minimumPlan
                      : null;
                const itemCount = item.href === '/online-orders' ? onlineOrdersCount : 0;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={
                      active
                        ? 'shell-nav-link shell-nav-link-active min-h-10'
                        : 'shell-nav-link min-h-10'
                    }
                    onClick={() => setOpenGroup(null)}
                  >
                    <span className="min-w-0 truncate">{item.label}</span>
                    {lockLabel ? (
                      <span className="ml-3 shrink-0 rounded-full bg-black/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] text-black/50">
                        {lockLabel}
                      </span>
                    ) : itemCount > 0 ? (
                      <span className="ml-3 inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-amber-500 px-1 text-[9px] font-bold leading-none text-white">
                        {itemCount > 99 ? '99+' : itemCount}
                      </span>
                    ) : null}
                  </Link>
                );
              };

              const renderSection = (section: (typeof sections)[number], sectionIndex: number) => (
                <div
                  key={section.id}
                  className={sectionIndex > 0 ? 'mt-2 border-t border-slate-100 pt-2' : undefined}
                >
                  {section.label ? (
                    <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-black/35">
                      {section.label}
                    </div>
                  ) : null}
                  <div className="space-y-0.5">
                    {section.items.map(renderNavItem)}
                  </div>
                </div>
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
                    {showGroupBadge ? (
                      <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[9px] font-bold leading-none text-white">
                        {onlineOrdersCount > 99 ? '99+' : onlineOrdersCount}
                      </span>
                    ) : null}
                  </button>
                  {openGroup === group.id ? (
                    <div
                      className={
                        isReportsMenu
                          ? 'shell-dropdown-panel fixed left-1/2 top-[calc(var(--app-header-offset-desktop)_+_0.75rem)] z-50 max-h-[calc(100vh_-_var(--app-header-offset-desktop)_-_1.5rem)] w-[min(40rem,calc(100vw_-_2rem))] -translate-x-1/2 animate-scale-in overflow-y-auto overscroll-contain p-3 [scrollbar-gutter:stable]'
                          : 'shell-dropdown-panel absolute left-0 z-50 mt-2.5 min-w-[260px] animate-scale-in'
                      }
                      onMouseLeave={() => setOpenGroup(null)}
                    >
                      <div className="px-3 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-muted">
                        {group.label}
                      </div>
                      {isReportsMenu ? (
                        <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                          {sectionColumns.map((column, columnIndex) => (
                            <div key={columnIndex} className="min-w-0">
                              {column.map((section, sectionIndex) => renderSection(section, sectionIndex))}
                            </div>
                          ))}
                        </div>
                      ) : (
                        sections.map(renderSection)
                      )}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </nav>

          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            {isOnline ? (
              <button
                type="button"
                onClick={handleRefresh}
                disabled={isRefreshing}
                title="Refresh data"
                className="hidden 2xl:inline-flex status-badge-online cursor-pointer transition-opacity hover:opacity-75 active:opacity-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <svg
                  aria-hidden="true"
                  className={`-ml-0.5 h-3 w-3 ${isRefreshing ? 'animate-spin' : ''}`}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 12a9 9 0 0 1-15.3 6.4" />
                  <path d="M3 12a9 9 0 0 1 15.3-6.4" />
                  <path d="M18 2v4h-4" />
                  <path d="M6 22v-4h4" />
                </svg>
                {isRefreshing ? 'Refreshing…' : 'Sync ready'}
              </button>
            ) : (
              <span className="hidden 2xl:inline-flex status-badge-offline">
                Offline mode
              </span>
            )}
            {(merchantBranding || storeName) ? (
              <span
                className="hidden h-9 items-center gap-2 rounded-xl border border-slate-200/80 bg-white/80 px-2.5 text-xs font-medium text-ink shadow-sm xl:inline-flex"
                title={businessName ? `${businessName} · ${storeName ?? 'Main branch'}` : storeName}
              >
                {merchantBranding ? (
                  <MerchantBrandBadge
                    branding={merchantBranding}
                    surface="admin-shell"
                    className="!h-6 !w-6 !rounded-md"
                  />
                ) : (
                  <span className="h-2 w-2 rounded-full bg-accent" aria-hidden="true" />
                )}
                <span className="max-w-[10rem] truncate">
                  {storeName || 'Main branch'}
                </span>
              </span>
            ) : null}
            <InstallButton />
            <NavTrustPanel user={user} storeName={storeName} isOnline={isOnline} todaySales={liveTodaySales} />
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
              {storeName || 'Main branch'}
            </span>
            <span className={isOnline ? 'status-badge-online' : 'status-badge-offline'}>
              {isOnline ? 'Sync ready' : 'Offline mode'}
            </span>
          </div>
          {mobileSales ? (
            <div className="mt-1 text-xs font-semibold tabular-nums text-ink">
              {formatMoney(mobileSales.totalPence, mobileSales.currency)} · {mobileSales.txCount} txn{mobileSales.txCount !== 1 ? 's' : ''} today
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
        planGatedLinks={planGatedLinks}
        featureGatedLinks={featureGatedLinks}
        todaySales={liveTodaySales}
        onlineOrdersCount={onlineOrdersCount}
      />
    </>
  );
}
