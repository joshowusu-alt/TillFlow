import {
  DEFAULT_BUSINESS_TIMEZONE,
  formatBusinessLocalDateKey,
  getBusinessDayBounds,
  type LocalDateParts,
} from '@/lib/notifications/utils';
import {
  addLocalDays,
  businessLocalDateWindow,
  localDateKey,
  requireReportTimeZone,
  windowForLocalDates,
  type HalfOpenWindow,
} from '@/lib/reports/reporting-clock';

/**
 * Report date inputs are business-local calendar dates.
 * Returned `end` is exclusive (half-open [start, end)). Callers must filter with `lt: end`.
 */
export function parseReportDate(value: string | undefined, fallback: Date) {
  if (!value) return fallback;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return fallback;
  return parsed;
}

type PeriodPreset = {
  key: string;
  from: LocalDateParts;
  to: LocalDateParts;
};

function todayParts(now: Date, timeZone: string): LocalDateParts {
  return getBusinessDayBounds(now, timeZone).localDate;
}

function presetFor(period: string | undefined, now: Date, timeZone: string): PeriodPreset {
  const today = todayParts(now, timeZone);
  const normalized = (period ?? '').toLowerCase();
  const endingToday = (daysBack: number, key: string): PeriodPreset => ({
    key,
    from: addLocalDays(today, -daysBack),
    to: today,
  });

  switch (normalized) {
    case 'today':
      return { key: 'today', from: today, to: today };
    case '7':
    case '7d':
      return endingToday(6, '7d');
    case '14':
    case '14d':
      return endingToday(13, '14d');
    case '30':
    case '30d':
      return endingToday(29, '30d');
    case '90':
    case '90d':
      return endingToday(89, '90d');
    case '365':
    case '365d':
      return endingToday(364, '365d');
    case 'mtd':
    case 'month-to-date':
      return {
        key: 'mtd',
        from: { year: today.year, month: today.month, day: 1 },
        to: today,
      };
    case 'last-month': {
      const lastPrev = addLocalDays({ year: today.year, month: today.month, day: 1 }, -1);
      return {
        key: 'last-month',
        from: { year: lastPrev.year, month: lastPrev.month, day: 1 },
        to: lastPrev,
      };
    }
    case 'ytd':
    case 'this-year':
      return {
        key: 'ytd',
        from: { year: today.year, month: 1, day: 1 },
        to: today,
      };
    default:
      return endingToday(29, '30d');
  }
}

function inputValues(window: HalfOpenWindow) {
  return {
    fromInputValue: formatBusinessLocalDateKey(window.startInclusive, window.timeZone),
    toInputValue: formatBusinessLocalDateKey(new Date(window.endExclusive.getTime() - 1), window.timeZone),
  };
}

export function resolveReportDateRange(
  params: { from?: string; to?: string } | undefined,
  fallbackStart: Date,
  fallbackEnd: Date,
  timeZone?: string | null,
) {
  const zone = requireReportTimeZone(timeZone);
  const fromKey = /^\d{4}-\d{2}-\d{2}$/.test(params?.from ?? '') ? params!.from! : undefined;
  const toKey = /^\d{4}-\d{2}-\d{2}$/.test(params?.to ?? '') ? params!.to! : undefined;
  const parsed = fromKey && toKey ? businessLocalDateWindow(fromKey, toKey, zone) : null;
  const window = parsed ?? windowForLocalDates(
    todayParts(fallbackStart, zone),
    todayParts(fallbackEnd, zone),
    zone,
  );
  return {
    start: window.startInclusive,
    end: window.endExclusive,
    ...inputValues(window),
  };
}

export function resolveSelectableReportDateRange(
  params: { from?: string; to?: string; period?: string } | undefined,
  defaultPeriod: string,
  now = new Date(),
  timeZone?: string | null,
) {
  const zone = requireReportTimeZone(timeZone);
  const preset = presetFor(params?.period ?? defaultPeriod, now, zone);
  const normalizedPeriod = (params?.period ?? '').toLowerCase();
  const submittedFrom = params?.from?.trim();
  const submittedTo = params?.to?.trim();
  const hasCustomRange = normalizedPeriod === 'custom'
    || (!normalizedPeriod && Boolean(submittedFrom || submittedTo));
  const from = hasCustomRange && submittedFrom ? submittedFrom : localDateKey(preset.from);
  const to = hasCustomRange && submittedTo ? submittedTo : localDateKey(preset.to);
  const window = businessLocalDateWindow(from, to, zone)
    ?? windowForLocalDates(preset.from, preset.to, zone);

  return {
    start: window.startInclusive,
    end: window.endExclusive,
    ...inputValues(window),
    periodInputValue: hasCustomRange ? 'custom' : preset.key,
    isCustomRange: hasCustomRange,
  };
}
