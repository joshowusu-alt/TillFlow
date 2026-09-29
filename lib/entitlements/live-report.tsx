import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { cache, type ReactNode } from 'react';
import ReportSurfaceDenial from '@/components/reports/ReportSurfaceDenial';
import { getUser } from '@/lib/auth';
import { findBusinessForAuth } from '@/lib/billing-db-compat';
import { ACTIVE_BUSINESS_COOKIE, SESSION_COOKIE_PREFIX } from '@/lib/business-scope';
import type { BusinessPlan } from '@/lib/features';
import { prisma } from '@/lib/prisma';
import { OPERATIONAL_STORE_COOKIE } from '@/lib/reliability/operational-store';
import { readOperationalStoreCookie } from '@/lib/reliability/operational-store-cookie';
import { computeBillingAccessState } from '@/lib/subscription-lifecycle';
import { guardSurfaceRoute, requireSurface, type PageAccessResult } from '@/lib/entitlements/adapters';
import { resolveCanonicalPlan } from '@/lib/entitlements/plan';
import { SURFACE_CATALOGUE, type SurfaceId } from '@/lib/entitlements/surface-catalogue';
import type { AllowDecision, SurfaceAccessInput } from '@/lib/entitlements/types';

/**
 * Live report adapter. It loads the trusted session and calls the Stage 1
 * decision. It does not apply a second plan, role or store policy.
 * `selectedPlan` is never copied into the decision input.
 */

export type ReportSearch = Record<string, string | string[] | undefined> | undefined;

export type LiveReportRange = {
  fromLocalDate: string;
  toLocalDate: string;
  preset?: 'MONTH_TO_DATE' | 'LAST_30_DAYS' | 'CUSTOM';
};

export type LoadedReportContext = {
  now: Date;
  timezone: string;
  canonicalPlan: BusinessPlan;
  ownedStores: { id: string; name: string }[];
  cookieStoreId: string | null;
};

type RawBusiness = {
  id: string;
  name: string;
  currency: string;
  timezone: string | null;
  plan?: string | null;
  mode?: string | null;
  storeMode?: string | null;
  addonOnlineStorefront?: boolean | null;
  isDemo?: boolean | null;
  selectedPlan?: string | null;
};

export type LiveBranch =
  | {
      kind: 'stores';
      selected: string;
      storeIds: string[];
      choices: { id: string; name: string }[];
      offerAll: boolean;
      label: null;
    }
  | {
      kind: 'label';
      label: string;
      storeIds: null;
    }
  | {
      kind: 'none';
      label: null;
      storeIds: null;
    };

export type OpenedReport = {
  ok: true;
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
    active: boolean;
    businessId: string;
  };
  business: RawBusiness & { canonicalPlan: BusinessPlan; billingAccessState: string };
  stores: { id: string; name: string }[];
  decision: AllowDecision;
  branch: LiveBranch;
  readOnly: boolean;
};

function firstParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function paramPresent(search: ReportSearch, key: string): boolean {
  return Boolean(search) && Object.prototype.hasOwnProperty.call(search, key);
}

export function requestedStoreId(search: ReportSearch): string | undefined {
  if (!paramPresent(search, 'storeId')) return undefined;
  const value = firstParam(search?.storeId);
  return value ?? '';
}

export function requestedBusinessId(search: ReportSearch): string | undefined {
  if (!paramPresent(search, 'businessId')) return undefined;
  const value = firstParam(search?.businessId);
  return value ?? '';
}

/**
 * Builds the Stage 1 input from already-loaded trusted records.
 * `selectedPlan` on the raw row is ignored.
 */
export function buildSurfaceAccessInput(input: {
  surfaceId: string;
  action: string;
  user: { id: string; businessId: string; role: string; active: boolean } | null;
  business: RawBusiness | null;
  billing: string;
  ownedStoreIds: readonly string[];
  cookieStoreId: string | null;
  search?: ReportSearch;
  range?: LiveReportRange;
  now: Date;
  timezone: string;
}): SurfaceAccessInput {
  const raw = input.business;
  const requestedBusiness = requestedBusinessId(input.search);
  const storeId = requestedStoreId(input.search);
  return {
    surfaceId: input.surfaceId,
    action: input.action,
    actor: input.user
      ? {
          kind: 'USER',
          userId: input.user.id,
          businessId: input.user.businessId,
          role: input.user.role,
          active: input.user.active,
        }
      : null,
    business: {
      id: raw?.id ?? '',
      plan: raw?.plan ?? null,
      mode: raw?.mode ?? null,
      storeMode: raw?.storeMode ?? null,
      addonOnlineStorefront: raw?.addonOnlineStorefront ?? null,
      isDemo: raw?.isDemo ?? null,
      billing: input.billing,
    },
    scope: {
      ...(storeId !== undefined ? { requestedStoreId: storeId } : {}),
      ownedStoreIds: input.ownedStoreIds,
      operationalStoreId: input.cookieStoreId,
      ...(requestedBusiness && input.user && requestedBusiness !== input.user.businessId
        ? { subjectBusinessId: requestedBusiness }
        : {}),
    },
    ...(input.range ? { range: input.range } : {}),
    now: input.now,
    timezone: input.timezone,
  };
}

export function branchFromAllow(
  surfaceId: SurfaceId,
  plan: BusinessPlan,
  decision: AllowDecision,
  stores: { id: string; name: string }[],
): LiveBranch {
  const spec = SURFACE_CATALOGUE[surfaceId];
  const offerAll = spec.scopeClass === 'STORE_DIMENSIONAL' && spec.consolidationSupported && plan === 'PRO';
  const scope = decision.scope;
  if (scope.class === 'STORE_DIMENSIONAL' && scope.mode === 'ALL') {
    return {
      kind: 'stores',
      selected: 'ALL',
      storeIds: stores.map((store) => store.id),
      choices: stores,
      offerAll: true,
      label: null,
    };
  }
  if (scope.class === 'STORE_DIMENSIONAL' && scope.mode === 'STORE') {
    return {
      kind: 'stores',
      selected: scope.storeId,
      storeIds: [scope.storeId],
      choices: offerAll ? stores : stores.filter((store) => store.id === scope.storeId),
      offerAll,
      label: null,
    };
  }
  if (
    scope.class === 'ACCOUNTING_WHOLE_BUSINESS' ||
    scope.class === 'STOREFRONT_DOMAIN' ||
    scope.class === 'FIXED_CONSOLIDATED'
  ) {
    return { kind: 'label', label: scope.label, storeIds: null };
  }
  return { kind: 'none', label: null, storeIds: null };
}

const loadSessionUser = cache(async () => getUser());

const loadBusiness = cache(async (businessId: string) => findBusinessForAuth(businessId));

const loadStores = cache(async (businessId: string) =>
  prisma.store.findMany({
    where: { businessId },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  }),
);

function clearSessionCookies() {
  try {
    const jar = cookies();
    for (const cookie of jar.getAll()) {
      if (cookie.name.startsWith(SESSION_COOKIE_PREFIX) || cookie.name === ACTIVE_BUSINESS_COOKIE) {
        jar.delete(cookie.name);
      }
    }
  } catch {
    // Cookie mutation is unavailable in some render contexts.
  }
}

function clearOperationalStoreCookie() {
  try {
    cookies().delete(OPERATIONAL_STORE_COOKIE);
  } catch {
    // Same constraint as session cookies.
  }
}

async function invalidateUserSessions(userId: string) {
  await prisma.session.deleteMany({ where: { userId } }).catch(() => {});
  clearSessionCookies();
}

type Prepared = {
  accessInput: SurfaceAccessInput;
  user: OpenedReport['user'] | null;
  business: OpenedReport['business'] | null;
  stores: { id: string; name: string }[];
  cookieStoreId: string | null;
};

async function prepareLiveReport(input: {
  surfaceId: string;
  action: string;
  search?: ReportSearch;
  range?: LiveReportRange | ((ctx: LoadedReportContext) => LiveReportRange);
  now?: Date;
}): Promise<Prepared> {
  const now = input.now ?? new Date();
  const user = await loadSessionUser();
  if (!user) {
    return {
      user: null,
      business: null,
      stores: [],
      cookieStoreId: null,
      accessInput: buildSurfaceAccessInput({
        surfaceId: input.surfaceId,
        action: input.action,
        user: null,
        business: null,
        billing: 'PAID_ACTIVE',
        ownedStoreIds: [],
        cookieStoreId: null,
        search: input.search,
        now,
        timezone: 'UTC',
      }),
    };
  }

  const loaded = await loadBusiness(user.businessId);
  const raw = (loaded.business ?? null) as RawBusiness | null;
  const stores = raw ? await loadStores(raw.id) : [];
  const cookieStoreId = readOperationalStoreCookie();
  const canonicalPlan = resolveCanonicalPlan({
    plan: raw?.plan,
    mode: raw?.mode,
    storeMode: raw?.storeMode,
  });
  const timezone = raw?.timezone?.trim() || 'UTC';
  const billing = raw
    ? computeBillingAccessState(
        {
          ...(raw as object),
          selectedPlan: canonicalPlan,
          plan: raw.plan,
          timezone,
        },
        now,
      ).accessState
    : 'CANCELLED';

  const range =
    typeof input.range === 'function'
      ? input.range({ now, timezone, canonicalPlan, ownedStores: stores, cookieStoreId })
      : input.range;

  const business = raw
    ? {
        ...raw,
        canonicalPlan,
        billingAccessState: billing,
      }
    : null;

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      active: user.active,
      businessId: user.businessId,
    },
    business,
    stores,
    cookieStoreId,
    accessInput: buildSurfaceAccessInput({
      surfaceId: input.surfaceId,
      action: input.action,
      user: {
        id: user.id,
        businessId: user.businessId,
        role: user.role,
        active: user.active,
      },
      business: raw,
      billing,
      ownedStoreIds: stores.map((store) => store.id),
      cookieStoreId,
      search: input.search,
      range,
      now,
      timezone,
    }),
  };
}

function minimumPlanFor(surfaceId: string): BusinessPlan | undefined {
  if (!Object.prototype.hasOwnProperty.call(SURFACE_CATALOGUE, surfaceId)) return undefined;
  return SURFACE_CATALOGUE[surfaceId as SurfaceId].minPlan;
}

async function enforcePageDecision(
  prepared: Prepared,
  surfaceId: string,
  page: PageAccessResult,
): Promise<OpenedReport | { ok: false; denial: ReactNode }> {
  if (page.outcome === 'redirect') {
    if ((page.reason === 'USER_INACTIVE' || page.reason === 'ROLE_UNKNOWN') && prepared.user) {
      await invalidateUserSessions(prepared.user.id);
    }
    redirect(page.href);
  }
  if (page.outcome === 'notFound') {
    if (page.reason === 'SCOPE_STORE_INVALID' && prepared.cookieStoreId) {
      const owned = new Set(prepared.stores.map((store) => store.id));
      if (!owned.has(prepared.cookieStoreId)) clearOperationalStoreCookie();
    }
    notFound();
  }
  if (page.outcome === 'notice') {
    return {
      ok: false,
      denial: (
        <ReportSurfaceDenial
          access={page}
          minimumPlan={minimumPlanFor(surfaceId)}
        />
      ),
    };
  }

  if (!prepared.user || !prepared.business) notFound();
  const surface = surfaceId as SurfaceId;
  return {
    ok: true,
    user: prepared.user,
    business: prepared.business,
    stores: prepared.stores,
    decision: page.decision,
    branch: branchFromAllow(surface, prepared.business.canonicalPlan, page.decision, prepared.stores),
    readOnly: page.decision.readOnly === true,
  };
}

export async function openLiveReport(input: {
  surfaceId: SurfaceId;
  search?: ReportSearch;
  range?: LiveReportRange | ((ctx: LoadedReportContext) => LiveReportRange);
  now?: Date;
}): Promise<OpenedReport | { ok: false; denial: ReactNode }> {
  const prepared = await prepareLiveReport({ ...input, action: 'VIEW' });
  const page = requireSurface(prepared.accessInput);
  return enforcePageDecision(prepared, input.surfaceId, page);
}

export async function guardLiveReport(input: {
  surfaceId: SurfaceId;
  action: 'VIEW' | 'EXPORT';
  search?: ReportSearch;
  range?: LiveReportRange | ((ctx: LoadedReportContext) => LiveReportRange);
  now?: Date;
}): Promise<
  | (OpenedReport & { headers: { 'Cache-Control': 'no-store' } })
  | { ok: false; status: number; headers: { 'Cache-Control': 'no-store' }; body: { ok: false; reason: string; surfaceId: string } }
> {
  const prepared = await prepareLiveReport(input);
  const route = guardSurfaceRoute(prepared.accessInput);
  if (!route.body.ok) {
    if (
      (route.body.reason === 'USER_INACTIVE' || route.body.reason === 'ROLE_UNKNOWN') &&
      prepared.user
    ) {
      await invalidateUserSessions(prepared.user.id);
    }
    if (route.body.reason === 'SCOPE_STORE_INVALID' && prepared.cookieStoreId) {
      const owned = new Set(prepared.stores.map((store) => store.id));
      if (!owned.has(prepared.cookieStoreId)) clearOperationalStoreCookie();
    }
    return {
      ok: false,
      status: route.status,
      headers: route.headers,
      body: {
        ok: false,
        reason: route.body.reason,
        surfaceId: input.surfaceId,
      },
    };
  }
  if (!prepared.user || !prepared.business) {
    return {
      ok: false,
      status: 404,
      headers: route.headers,
      body: { ok: false, reason: 'CATALOGUE_UNKNOWN', surfaceId: input.surfaceId },
    };
  }
  const page = requireSurface(prepared.accessInput);
  if (page.outcome !== 'allow') {
    return {
      ok: false,
      status: route.status,
      headers: route.headers,
      body: { ok: false, reason: 'CATALOGUE_UNKNOWN', surfaceId: input.surfaceId },
    };
  }
  return {
    ok: true,
    headers: route.headers,
    user: prepared.user,
    business: prepared.business,
    stores: prepared.stores,
    decision: page.decision,
    branch: branchFromAllow(input.surfaceId, prepared.business.canonicalPlan, page.decision, prepared.stores),
    readOnly: page.decision.readOnly === true,
  };
}

export const REPORT_PAGE_SURFACES: Record<string, SurfaceId> = {
  '/reports': 'reports_hub',
  '/reports/command-center': 'command_center',
  '/reports/dashboard': 'trading_report',
  '/reports/money-received': 'money_received',
  '/reports/momo-confirmation': 'momo_confirmation',
  '/reports/business-movement': 'business_movement',
  '/reports/receipts': 'receipt_transactions',
  '/reports/weekly-digest': 'weekly_digest',
  '/reports/analytics': 'sales_analytics',
  '/reports/margins': 'profit_margins',
  '/reports/sales-by-supplier': 'sales_by_supplier',
  '/reports/reorder-suggestions': 'reorder_suggestions',
  '/reports/income-statement': 'income_statement',
  '/reports/balance-sheet': 'balance_sheet',
  '/reports/cashflow': 'cash_flow_statement',
  '/reports/cash-drawer': 'cash_drawer_report',
  '/reports/risk-monitor': 'risk_monitor',
  '/reports/stock-movements': 'stock_movements',
  '/reports/exports': 'exports_hub',
  '/reports/audit-log': 'audit_log',
  '/reports/owner': 'owner_brief',
  '/reports/cashflow-forecast': 'cashflow_forecast',
  '/reports/sales': 'legacy_reports_sales_redirect',
  '/payments/supplier-aging': 'supplier_ageing',
  '/settings/analytics': 'storefront_analytics',
  '/settings/online-store/analytics': 'storefront_analytics',
};

export async function visibleReportHrefs(now?: Date): Promise<Set<string>> {
  const allowed = new Set<string>();
  for (const [href, surfaceId] of Object.entries(REPORT_PAGE_SURFACES)) {
    const prepared = await prepareLiveReport({ surfaceId, action: 'VIEW', now });
    const page = requireSurface(prepared.accessInput);
    if (page.outcome === 'allow') allowed.add(href);
  }
  return allowed;
}
