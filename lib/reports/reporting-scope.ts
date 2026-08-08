/**
 * Shared reporting period / branch scope for Home Revenue and Trading Report.
 *
 * Boundaries are always:
 *   startInclusive <= timestamp < endExclusive
 * in the business-configured timezone (never server-local or browser TZ).
 *
 * Preserved week rule: rolling last 7 local calendar days inclusive of today
 * (today and the prior 6 days) — same window historically used as the Trading
 * Report default when no Home drill-down params are supplied.
 */
import {
  formatBusinessLocalDateKey,
  getBusinessCalendarDayBounds,
  getBusinessDayBounds,
  parseBusinessLocalDateKey,
  resolveBusinessTimeZone,
  type LocalDateParts,
} from '@/lib/notifications/utils';

export const REPORTING_EXCLUDED_SALE_STATUSES = ['RETURNED', 'VOID'] as const;

export const REPORTING_EXCLUDED_PAYMENT_STATUSES = ['FAILED', 'CANCELLED', 'VOID'] as const;

export type ReportingPeriodKey = 'today' | '7d' | 'custom';

export type ReportingScope = {
  businessId: string;
  timeZone: string;
  periodKey: ReportingPeriodKey;
  /** Inclusive UTC instant for the start of the selected local range. */
  startInclusive: Date;
  /** Exclusive UTC instant for the end of the selected local range. */
  endExclusive: Date;
  /** Local YYYY-MM-DD (business TZ) for date inputs / deep links. */
  fromInputValue: string;
  toInputValue: string;
  /** Validated store id or ALL. */
  storeId: 'ALL' | string;
};

export type ReportingScopeParams = {
  period?: string;
  from?: string;
  to?: string;
  storeId?: string;
};

/**
 * Thrown when a storeId query param is supplied but is blank, malformed,
 * unknown, deleted, or otherwise inaccessible. Callers must fail closed
 * (typically `notFound()` / 4xx) — never broaden to ALL-store data.
 */
export class ReportingScopeStoreError extends Error {
  readonly code = 'INVALID_STORE_SCOPE' as const;

  constructor(message = 'Invalid or inaccessible reporting store scope') {
    super(message);
    this.name = 'ReportingScopeStoreError';
  }
}

export function isReportingScopeStoreError(error: unknown): error is ReportingScopeStoreError {
  return error instanceof ReportingScopeStoreError;
}

/**
 * Resolve an authorised store scope.
 *
 * - Omitted storeId → ALL (established default)
 * - Explicit ALL → ALL
 * - Valid accessible store → that store
 * - Blank, whitespace, unknown, deleted, or inaccessible → throw ReportingScopeStoreError
 */
export function resolveAuthorisedStoreId(input: {
  storeId?: string | null;
  allowedStoreIds: readonly string[];
}): 'ALL' | string {
  if (input.storeId === undefined || input.storeId === null) {
    return 'ALL';
  }

  // Param was supplied (including empty string) — blank/whitespace fail closed.
  const trimmed = input.storeId.trim();
  if (trimmed === '') {
    throw new ReportingScopeStoreError('Blank reporting store scope is not authorised');
  }
  if (trimmed === 'ALL') {
    return 'ALL';
  }
  if (input.allowedStoreIds.includes(trimmed)) {
    return trimmed;
  }
  throw new ReportingScopeStoreError('Invalid or inaccessible reporting store scope');
}

function addLocalDays(parts: LocalDateParts, days: number): LocalDateParts {
  const probe = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return {
    year: probe.getUTCFullYear(),
    month: probe.getUTCMonth() + 1,
    day: probe.getUTCDate(),
  };
}

function localDateKey(parts: LocalDateParts): string {
  return [
    parts.year,
    String(parts.month).padStart(2, '0'),
    String(parts.day).padStart(2, '0'),
  ].join('-');
}

function rangeForLocalDates(
  fromLocal: LocalDateParts,
  toLocal: LocalDateParts,
  timeZone: string,
): { startInclusive: Date; endExclusive: Date } {
  const start = getBusinessCalendarDayBounds(fromLocal, timeZone);
  const end = getBusinessCalendarDayBounds(toLocal, timeZone);
  return {
    startInclusive: start.dayStart,
    endExclusive: end.dayEndExclusive,
  };
}

function compareLocalDates(a: LocalDateParts, b: LocalDateParts): number {
  return localDateKey(a).localeCompare(localDateKey(b));
}

/**
 * Resolve Home / Trading Report scope from URL params.
 * Malformed dates fall back safely to the default period (7d for bare Trading
 * Report; callers that need Today pass period=today explicitly).
 *
 * Store scope is fail-closed: an explicitly supplied invalid/inaccessible
 * storeId throws ReportingScopeStoreError (never silently broadens to ALL).
 */
export function resolveReportingScope(input: {
  businessId: string;
  timeZone?: string | null;
  params?: ReportingScopeParams;
  /** Default when period/from/to are absent. Trading Report uses 7d. */
  defaultPeriod?: ReportingPeriodKey;
  /** Allowed store ids for this authenticated business context. */
  allowedStoreIds: string[];
  now?: Date;
}): ReportingScope {
  const timeZone = resolveBusinessTimeZone(input.timeZone);
  const now = input.now ?? new Date();
  const todayBounds = getBusinessDayBounds(now, timeZone);
  const todayLocal = todayBounds.localDate;
  const defaultPeriod = input.defaultPeriod ?? '7d';

  const rawPeriod = (input.params?.period ?? '').trim().toLowerCase();
  const fromLocal = parseBusinessLocalDateKey(input.params?.from);
  const toLocal = parseBusinessLocalDateKey(input.params?.to);

  let periodKey: ReportingPeriodKey = defaultPeriod;
  let fromParts = todayLocal;
  let toParts = todayLocal;

  if (rawPeriod === 'today') {
    periodKey = 'today';
    fromParts = todayLocal;
    toParts = todayLocal;
  } else if (rawPeriod === '7d' || rawPeriod === '7') {
    periodKey = '7d';
    fromParts = addLocalDays(todayLocal, -6);
    toParts = todayLocal;
  } else if (fromLocal && toLocal) {
    periodKey = 'custom';
    if (compareLocalDates(fromLocal, toLocal) <= 0) {
      fromParts = fromLocal;
      toParts = toLocal;
    } else {
      fromParts = toLocal;
      toParts = fromLocal;
    }
  } else if (rawPeriod === 'custom' && fromLocal && toLocal) {
    periodKey = 'custom';
    fromParts = compareLocalDates(fromLocal, toLocal) <= 0 ? fromLocal : toLocal;
    toParts = compareLocalDates(fromLocal, toLocal) <= 0 ? toLocal : fromLocal;
  } else if (defaultPeriod === 'today') {
    periodKey = 'today';
    fromParts = todayLocal;
    toParts = todayLocal;
  } else {
    periodKey = '7d';
    fromParts = addLocalDays(todayLocal, -6);
    toParts = todayLocal;
  }

  // When period=today but stale from/to disagree, honour period=today.
  if (periodKey === 'today') {
    fromParts = todayLocal;
    toParts = todayLocal;
  }

  const { startInclusive, endExclusive } = rangeForLocalDates(fromParts, toParts, timeZone);

  const storeId = resolveAuthorisedStoreId({
    storeId: input.params?.storeId,
    allowedStoreIds: input.allowedStoreIds,
  });

  return {
    businessId: input.businessId,
    timeZone,
    periodKey,
    startInclusive,
    endExclusive,
    fromInputValue: localDateKey(fromParts),
    toInputValue: localDateKey(toParts),
    storeId,
  };
}

/** Build a deep-link query string for Trading Report / Money received. */
export function buildReportingScopeSearchParams(
  scope: Pick<ReportingScope, 'periodKey' | 'fromInputValue' | 'toInputValue' | 'storeId'>,
  extra?: Record<string, string | undefined>,
): URLSearchParams {
  const params = new URLSearchParams();
  params.set('period', scope.periodKey);
  params.set('from', scope.fromInputValue);
  params.set('to', scope.toInputValue);
  if (scope.storeId && scope.storeId !== 'ALL') {
    params.set('storeId', scope.storeId);
  } else {
    params.set('storeId', 'ALL');
  }
  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      if (value != null && value !== '') params.set(key, value);
    }
  }
  return params;
}

export function tradingReportHref(
  scope: Pick<ReportingScope, 'periodKey' | 'fromInputValue' | 'toInputValue' | 'storeId'>,
): string {
  return `/reports/dashboard?${buildReportingScopeSearchParams(scope).toString()}`;
}

export function moneyReceivedHref(
  scope: Pick<ReportingScope, 'periodKey' | 'fromInputValue' | 'toInputValue' | 'storeId'>,
  method?: string,
  origin?: string,
): string {
  const extras: Record<string, string> = {};
  if (method) extras.method = method;
  if (origin) extras.origin = origin;
  const params = buildReportingScopeSearchParams(
    scope,
    Object.keys(extras).length ? extras : undefined,
  );
  return `/reports/receipts?${params.toString()}`;
}

/** Prisma-friendly createdAt / receivedAt filter for inclusive/exclusive bounds. */
export function reportingTimestampFilter(scope: Pick<ReportingScope, 'startInclusive' | 'endExclusive'>) {
  return {
    gte: scope.startInclusive,
    lt: scope.endExclusive,
  };
}

export function salesInvoiceStoreFilter(storeId: ReportingScope['storeId']) {
  return storeId === 'ALL' ? {} : { storeId };
}

/** True when the scope is exactly the business-local current day. */
export function isReportingScopeToday(scope: ReportingScope, now = new Date()): boolean {
  const todayKey = formatBusinessLocalDateKey(now, scope.timeZone);
  return (
    scope.periodKey === 'today'
    || (scope.fromInputValue === todayKey && scope.toInputValue === todayKey)
  );
}
