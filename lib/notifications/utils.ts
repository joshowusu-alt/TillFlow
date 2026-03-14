export const DEFAULT_BUSINESS_TIMEZONE = 'Africa/Accra';

export const COMMON_AFRICAN_TIMEZONE_VALUES = [
  'Africa/Accra',
  'Africa/Lagos',
  'Africa/Nairobi',
  'Africa/Johannesburg',
  'Africa/Cairo',
] as const;

export const COMMON_AFRICAN_TIMEZONES = [
  { value: 'Africa/Accra', label: 'Africa/Accra (GMT+0)' },
  { value: 'Africa/Lagos', label: 'Africa/Lagos (WAT, GMT+1)' },
  { value: 'Africa/Nairobi', label: 'Africa/Nairobi (EAT, GMT+3)' },
  { value: 'Africa/Johannesburg', label: 'Africa/Johannesburg (SAST, GMT+2)' },
  { value: 'Africa/Cairo', label: 'Africa/Cairo (EET, GMT+2)' },
] as const;

export const WHATSAPP_PHONE_PATTERN = /^\+?\d{10,15}$/;
export const WHATSAPP_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

type ZonedDateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

type LocalDateParts = Pick<ZonedDateParts, 'year' | 'month' | 'day'>;

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getFormatter(timeZone: string) {
  const key = timeZone;
  if (!formatterCache.has(key)) {
    formatterCache.set(
      key,
      new Intl.DateTimeFormat('en-CA', {
        timeZone,
        hour12: false,
        hourCycle: 'h23',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }),
    );
  }

  return formatterCache.get(key)!;
}

export function resolveBusinessTimeZone(timeZone?: string | null) {
  const candidate = timeZone?.trim() || DEFAULT_BUSINESS_TIMEZONE;

  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: candidate }).format(new Date());
    return candidate;
  } catch {
    return DEFAULT_BUSINESS_TIMEZONE;
  }
}

function getZonedDateParts(date: Date, timeZone: string): ZonedDateParts {
  const normalizedTimeZone = resolveBusinessTimeZone(timeZone);
  const formatter = getFormatter(normalizedTimeZone);
  const parts = formatter.formatToParts(date);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  ) as Record<string, number>;

  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour,
    minute: values.minute,
    second: values.second,
  };
}

function getTimeZoneOffsetMs(date: Date, timeZone: string) {
  const parts = getZonedDateParts(date, timeZone);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );

  return asUtc - date.getTime();
}

function zonedTimeToUtc(
  parts: Partial<ZonedDateParts> & LocalDateParts,
  timeZone: string,
) {
  const utcGuess = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour ?? 0,
    parts.minute ?? 0,
    parts.second ?? 0,
    0,
  );

  let offset = getTimeZoneOffsetMs(new Date(utcGuess), timeZone);
  let timestamp = utcGuess - offset;
  const adjustedOffset = getTimeZoneOffsetMs(new Date(timestamp), timeZone);

  if (adjustedOffset !== offset) {
    offset = adjustedOffset;
    timestamp = utcGuess - offset;
  }

  return new Date(timestamp);
}

function getNextLocalDate(parts: LocalDateParts): LocalDateParts {
  const nextDay = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + 1));
  return {
    year: nextDay.getUTCFullYear(),
    month: nextDay.getUTCMonth() + 1,
    day: nextDay.getUTCDate(),
  };
}

export function getBusinessDayBounds(date: Date, timeZone?: string | null) {
  const resolvedTimeZone = resolveBusinessTimeZone(timeZone);
  const localDate = getZonedDateParts(date, resolvedTimeZone);
  const dayStart = zonedTimeToUtc(
    {
      year: localDate.year,
      month: localDate.month,
      day: localDate.day,
      hour: 0,
      minute: 0,
      second: 0,
    },
    resolvedTimeZone,
  );
  const nextLocalDate = getNextLocalDate(localDate);
  const dayEndExclusive = zonedTimeToUtc(
    {
      year: nextLocalDate.year,
      month: nextLocalDate.month,
      day: nextLocalDate.day,
      hour: 0,
      minute: 0,
      second: 0,
    },
    resolvedTimeZone,
  );

  return {
    timeZone: resolvedTimeZone,
    dayStart,
    dayEndExclusive,
    localDate,
  };
}

export function formatBusinessDateLabel(date: Date, timeZone?: string | null) {
  return date.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    timeZone: resolveBusinessTimeZone(timeZone),
  });
}

export function getCurrentHourForTimeZone(date: Date, timeZone?: string | null) {
  return getZonedDateParts(date, resolveBusinessTimeZone(timeZone)).hour;
}

export function parseScheduleTime(value?: string | null) {
  const normalized = value?.trim() || '20:00';
  if (!WHATSAPP_TIME_PATTERN.test(normalized)) {
    return {
      value: '20:00',
      hour: 20,
      minute: 0,
    };
  }

  const [hour, minute] = normalized.split(':').map(Number);
  return {
    value: normalized,
    hour,
    minute,
  };
}

export function normalizeWhatsappPhone(value?: string | null) {
  const normalized = value?.trim() ?? '';
  const compact = normalized.replace(/\s+/g, '');
  if (!compact || !WHATSAPP_PHONE_PATTERN.test(compact)) {
    return null;
  }

  return compact.replace(/\D/g, '');
}
