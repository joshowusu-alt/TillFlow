import { resolveBusinessTimeZone } from '@/lib/notifications/utils';

export const DEFAULT_DAILY_SUMMARY_SCHEDULE = '20:00';
/** Cron runs every 15 minutes; match the configured send time within this window. */
export const DAILY_SUMMARY_SCHEDULE_WINDOW_MINUTES = 15;

export function parseDailySummaryScheduleTime(value?: string | null) {
  const raw = (value ?? DEFAULT_DAILY_SUMMARY_SCHEDULE).trim();
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(raw);
  if (!match) {
    return parseDailySummaryScheduleTime(DEFAULT_DAILY_SUMMARY_SCHEDULE);
  }
  return { hour: Number(match[1]), minute: Number(match[2]) };
}

export function getLocalTimeParts(now: Date, timeZone?: string | null) {
  const tz = resolveBusinessTimeZone(timeZone);
  const parts = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
    timeZone: tz,
  }).formatToParts(now);

  return {
    timeZone: tz,
    hour: Number(parts.find((part) => part.type === 'hour')?.value ?? '0'),
    minute: Number(parts.find((part) => part.type === 'minute')?.value ?? '0'),
  };
}

export function isBusinessDueForDailySummary(
  now: Date,
  timeZone: string | null | undefined,
  scheduleTime: string | null | undefined,
) {
  const schedule = parseDailySummaryScheduleTime(scheduleTime);
  const local = getLocalTimeParts(now, timeZone ?? undefined);
  const scheduleTotalMinutes = schedule.hour * 60 + schedule.minute;
  const localTotalMinutes = local.hour * 60 + local.minute;

  return (
    localTotalMinutes >= scheduleTotalMinutes &&
    localTotalMinutes < scheduleTotalMinutes + DAILY_SUMMARY_SCHEDULE_WINDOW_MINUTES
  );
}
