import { resolveBusinessTimeZone } from '@/lib/notifications/utils';

export const DISH_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
export type DishDay = (typeof DISH_DAYS)[number];

export type DishSchedule = {
  availableDays?: readonly DishDay[] | null;
  timeZone?: string | null;
};

export function parseDishDays(value?: string | null): DishDay[] {
  const days = value?.split(',');
  return DISH_DAYS.filter((day) => days?.includes(day));
}

const weekdayFormatters = new Map<string, Intl.DateTimeFormat>();

export function isDishAvailableToday(dish?: DishSchedule | null, now: Date | null = new Date(), tz = dish?.timeZone): boolean {
  const days = dish?.availableDays;
  if (!days?.length || days.length === DISH_DAYS.length) return true;
  if (!now) return false;
  const key = tz ?? '';
  let formatter = weekdayFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-GB', { timeZone: resolveBusinessTimeZone(tz), weekday: 'short' });
    weekdayFormatters.set(key, formatter);
  }
  const weekday = formatter.format(now);
  return days.some((day) => day === weekday);
}

export function dishDaysLabel(value?: string | null): string | null {
  const days = parseDishDays(value);
  return days.length > 0 && days.length < DISH_DAYS.length ? days.join(', ') : null;
}

export function dishOffDayLabel(dish?: DishSchedule | null): string | null {
  const days = dish?.availableDays;
  if (!days?.length || isDishAvailableToday(dish)) return null;
  return 'Available ' + (days.length === 1 ? days[0] : days.slice(0, -1).join(', ') + ' & ' + days[days.length - 1]);
}
