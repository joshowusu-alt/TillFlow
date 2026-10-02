import { Suspense } from 'react';
import { notFound, redirect } from 'next/navigation';
import TodayScreen, { scopeStoreLinks, TodayLoading, type TodayScreenProps } from '@/components/reports/today/TodayScreen';
import { branchFromAllow, inspectLiveReport, visibleReportHrefs, type ReportSearch } from '@/lib/entitlements/live-report';
import { measureServerOperation } from '@/lib/observability';
import { prisma } from '@/lib/prisma';
import { formatBusinessLocalDateKey } from '@/lib/notifications/utils';
import { agreeingReportScope, ScopeAgreementError, todayNextActions } from '@/lib/reports/today/model';
import { loadToday, type TodaySnapshot } from '@/lib/reports/today/load';
import { stage3aExploreNextSteps, stage3aLinks, stage3aSection, todayDetailHref, withStoreScope } from '@/lib/reports/today/stage3a-nav';
import { tradingReplacesSalesAnalytics } from '@/lib/reports/today/trading-parity';
import { buildTodayWindows, shiftLocalDateKey, type TodayPlan } from '@/lib/reports/today/windows';
import { requireReportTimeZone } from '@/lib/reports/reporting-clock';
import { ReportingScopeStoreError } from '@/lib/reports/reporting-scope';

export const dynamic = 'force-dynamic';

type Search = Record<string, string | string[] | undefined>;

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function todayPlan(plan: string): TodayPlan {
  if (plan === 'GROWTH' || plan === 'PRO') return plan;
  return 'STARTER';
}

function shell(props: Omit<TodayScreenProps, 'section' | 'links'> & { section?: TodayScreenProps['section']; links?: TodayScreenProps['links'] }): TodayScreenProps {
  return {
    section: props.section ?? 'today',
    links: props.links ?? [],
    exploreLinks: props.exploreLinks ?? [],
    moneyHref: props.moneyHref ?? null,
    cashHref: props.cashHref ?? null,
    nextActions: props.nextActions ?? [],
    scopeLabel: props.scopeLabel,
    dateLabel: props.dateLabel,
    zoneName: props.zoneName,
    updatedLabel: props.updatedLabel,
    readOnly: props.readOnly,
    currency: props.currency,
    storeId: props.storeId,
    salesHref: props.salesHref,
    snapshot: props.snapshot,
    blocked: props.blocked,
    failed: props.failed,
  };
}

export default function ReportsPage({ searchParams }: { searchParams?: Search }) {
  return (
    <Suspense fallback={<TodayLoading />}>
      <ReportsToday search={searchParams} />
    </Suspense>
  );
}

async function ReportsToday({ search }: { search?: Search }) {
  const now = new Date();
  const section = stage3aSection(one(search?.section));
  const hub = await inspectLiveReport({
    surfaceId: 'reports_hub',
    search: search as ReportSearch,
    now,
  });
  if (hub.page.outcome === 'redirect') redirect(hub.page.href);
  if (hub.page.outcome === 'notFound' || !hub.business) notFound();

  const zoneName = zoneLabel(hub.business.timezone, now);
  const base = {
    section,
    scopeLabel: '',
    dateLabel: dateLabel(now, hub.business.timezone),
    zoneName,
    updatedLabel: timeLabel(now, hub.business.timezone),
    readOnly: hub.page.outcome === 'allow' && hub.page.decision.readOnly === true,
    currency: hub.business.currency || 'GHS',
    storeId: null as string | null,
    salesHref: null as string | null,
    snapshot: null as TodaySnapshot | null,
    blocked: null as TodayScreenProps['blocked'],
    failed: false,
    links: [] as TodayScreenProps['links'],
    exploreLinks: [] as TodayScreenProps['exploreLinks'],
    nextActions: [] as TodayScreenProps['nextActions'],
  };

  if (hub.page.outcome !== 'allow') {
    return <TodayScreen {...shell({ ...base, blocked: noticeCopy(hub.page.reason) })} />;
  }

  let timeZone: string;
  try {
    timeZone = requireReportTimeZone(hub.business.timezone);
  } catch {
    return <TodayScreen {...shell({ ...base, failed: true })} />;
  }

  const plan = todayPlan(hub.business.canonicalPlan);
  const todayKey = formatBusinessLocalDateKey(now, timeZone);
  const requestedFrom = plan === 'STARTER' ? shiftLocalDateKey(todayKey, -6) : shiftLocalDateKey(todayKey, -59);
  let data = await inspectLiveReport({
    surfaceId: 'command_center',
    search: search as ReportSearch,
    now,
    range: { fromLocalDate: requestedFrom, toLocalDate: todayKey, preset: 'CUSTOM' },
  });
  if (data.page.outcome === 'notice' && data.page.reason === 'RANGE_EXCEEDS_PLAN' && plan !== 'STARTER') {
    data = await inspectLiveReport({
      surfaceId: 'command_center',
      search: search as ReportSearch,
      now,
      range: { fromLocalDate: shiftLocalDateKey(todayKey, -6), toLocalDate: todayKey, preset: 'CUSTOM' },
    });
  }

  if (data.page.outcome === 'redirect') redirect(data.page.href);
  if (data.page.outcome === 'notFound') {
    if (data.page.reason === 'SCOPE_STORE_INVALID') {
      return (
        <TodayScreen
          {...shell({
            ...base,
            blocked: {
              title: 'This branch is not part of the business',
              body: 'No figures are shown.',
              href: '/reports',
              action: 'Back to Today',
            },
          })}
        />
      );
    }
    notFound();
  }
  if (data.page.outcome === 'notice') {
    return <TodayScreen {...shell({ ...base, blocked: noticeCopy(data.page.reason) })} />;
  }

  const branch = branchFromAllow('command_center', plan, data.page.decision, data.stores);
  if (branch.kind !== 'stores' || branch.storeIds.length === 0) {
    return <TodayScreen {...shell({ ...base, blocked: noticeCopy('SCOPE_STORE_UNSELECTED') })} />;
  }
  if (branch.selected === 'ALL' && plan !== 'PRO') {
    return <TodayScreen {...shell({ ...base, blocked: noticeCopy('SCOPE_CONSOLIDATED_FORBIDDEN') })} />;
  }

  const applied = data.page.decision.appliedRange;
  const storeId = branch.selected;
  let agreed: { label: string; storeIds: string[] };
  try {
    agreed = agreeingReportScope({
      plan,
      selected: storeId,
      queriedStoreIds: branch.storeIds,
      ownedStores: data.stores,
    });
  } catch (error) {
    if (error instanceof ScopeAgreementError) {
      return <TodayScreen {...shell({ ...base, blocked: noticeCopy('SCOPE_STORE_UNSELECTED') })} />;
    }
    throw error;
  }
  const scopeLabel = agreed.label;
  const allowed = await visibleReportHrefs(now);
  const momoOn = (hub.business as { momoEnabled?: boolean | null }).momoEnabled !== false;
  const linkOptions = {
    tradingReplacesSalesAnalytics: tradingReplacesSalesAnalytics(),
    showNetworkQueue: momoOn && (hub.user?.role === 'OWNER' || hub.user?.role === 'MANAGER'),
  };
  const links = scopeStoreLinks(stage3aLinks(section, allowed, linkOptions), storeId);
  const readOnly = data.page.decision.readOnly === true || base.readOnly;
  const framed = {
    ...base,
    scopeLabel,
    storeId,
    readOnly,
    links,
    exploreLinks: scopeStoreLinks(stage3aExploreNextSteps(allowed, linkOptions), storeId),
    moneyHref: allowed.has('/reports/money-received')
      ? todayDetailHref('/reports/money-received', todayKey, storeId)
      : null,
    cashHref: allowed.has('/reports/cash-drawer')
      ? todayDetailHref('/reports/cash-drawer', todayKey, storeId)
      : null,
    nextActions: todayNextActions({ role: hub.user?.role ?? '', readOnly }),
    salesHref: allowed.has('/reports/dashboard')
      ? todayDetailHref('/reports/dashboard', todayKey, storeId)
      : null,
  };

  if (!applied || section !== 'today') {
    return <TodayScreen {...shell({ ...framed, failed: !applied && section === 'today' })} />;
  }

  try {
    const windows = buildTodayWindows({
      now,
      timeZone,
      plan,
      authorisedFrom: applied.fromLocalDate,
      authorisedTo: applied.toLocalDate,
    });
    const snapshot = await measureServerOperation('reports.today', () => loadToday(prisma, {
      businessId: hub.business!.id,
      ownedStoreIds: data.stores.map((store) => store.id),
      storeIds: agreed.storeIds,
      currency: framed.currency,
      timeZone,
      plan,
      windows,
      showProfit: plan !== 'STARTER' && allowed.has('/reports/margins'),
      consolidated: storeId === 'ALL',
      storeNames: data.stores,
      hrefForShift: '/shifts',
      hrefForCash: allowed.has('/reports/cash-drawer')
        ? todayDetailHref('/reports/cash-drawer', todayKey, storeId)
        : null,
      hrefForMomo: allowed.has('/reports/momo-confirmation')
        ? withStoreScope('/reports/momo-confirmation', storeId)
        : null,
      hrefForNetwork: '/payments/reconciliation',
      hrefForCustomers: '/payments/customer-receipts',
      hrefForSuppliers: allowed.has('/payments/supplier-aging')
        ? withStoreScope('/payments/supplier-aging', storeId)
        : null,
      hrefForBelowCost: allowed.has('/reports/margins')
        ? withStoreScope('/reports/margins', storeId)
        : null,
      hrefForLowStock: plan === 'STARTER'
        ? '/inventory'
        : allowed.has('/reports/reorder-suggestions')
          ? withStoreScope('/reports/reorder-suggestions', storeId)
          : null,
    }));
    return <TodayScreen {...shell({ ...framed, snapshot })} />;
  } catch (error) {
    if (error instanceof ReportingScopeStoreError) {
      return (
        <TodayScreen
          {...shell({
            ...framed,
            snapshot: null,
            blocked: {
              title: 'This branch is not part of the business',
              body: 'No figures are shown.',
              href: '/reports',
              action: 'Back to Today',
            },
          })}
        />
      );
    }
    return <TodayScreen {...shell({ ...framed, snapshot: null, failed: true })} />;
  }
}

function noticeCopy(reason: string): NonNullable<TodayScreenProps['blocked']> {
  if (reason === 'SCOPE_CONSOLIDATED_FORBIDDEN') {
    return {
      title: 'All branches is part of Pro',
      body: 'This plan reports on one branch. No combined total is shown.',
      href: '/reports',
      action: 'View this branch',
    };
  }
  if (reason === 'SCOPE_STORE_UNSELECTED' || reason === 'SCOPE_STORE_NOT_OPERATIONAL') {
    return {
      title: 'Choose a branch',
      body: 'Figures stay hidden until a branch is selected. Use the Working location control at the top of the screen.',
      focusBranch: true,
    };
  }
  if (reason === 'RANGE_EXCEEDS_PLAN') {
    return {
      title: 'That date range is outside this plan',
      body: 'No figures are shown.',
      href: '/reports',
      action: 'Back to Today',
    };
  }
  return {
    title: 'Today is not available',
    body: 'No figures are shown.',
    href: '/reports',
    action: 'Back to Today',
  };
}

function dateLabel(now: Date, timeZone: string | null) {
  const zone = timeZone?.trim() || 'UTC';
  try {
    return `${new Intl.DateTimeFormat('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: zone,
    }).format(now)} · Local time`;
  } catch {
    return 'Local time';
  }
}

function timeLabel(now: Date, timeZone: string | null) {
  const zone = timeZone?.trim() || 'UTC';
  try {
    return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: zone }).format(now);
  } catch {
    return '';
  }
}

function zoneLabel(timeZone: string | null, now: Date) {
  const zone = timeZone?.trim() || 'UTC';
  try {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: zone, timeZoneName: 'short' }).formatToParts(now);
    return parts.find((part) => part.type === 'timeZoneName')?.value ?? zone;
  } catch {
    return zone;
  }
}
