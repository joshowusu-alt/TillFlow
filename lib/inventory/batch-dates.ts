/**
 * Calendar dates for optional production and expiry capture.
 * Stored as UTC midnight so a date does not shift across timezones.
 */

export type BatchDates = {
  productionDate: Date | null;
  expiryDate: Date | null;
};

export type BatchDateResult =
  | { ok: true; dates: BatchDates }
  | { ok: false; message: string };

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DMY_DATE = /^(\d{1,2})[/. -](\d{1,2})[/. -](\d{4})$/;

export function utcCalendarDate(year: number, month: number, day: number): Date | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (year < 2000 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return date;
}

export function formatCalendarDate(date: Date | null | undefined): string {
  if (!date || Number.isNaN(date.getTime())) return '';
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Blank is allowed. Accepts YYYY-MM-DD and day/month/year. */
export function parseCalendarDate(raw: unknown): Date | null {
  if (raw == null) return null;
  if (raw instanceof Date) {
    if (Number.isNaN(raw.getTime())) {
      throw new Error('Enter a valid date, or leave it blank.');
    }
    return utcCalendarDate(raw.getUTCFullYear(), raw.getUTCMonth() + 1, raw.getUTCDate());
  }
  const text = String(raw).trim();
  if (!text) return null;
  const iso = ISO_DATE.exec(text) ?? ISO_DATE.exec(text.slice(0, 10));
  if (iso && (text.length === 10 || text[10] === 'T' || text[10] === ' ')) {
    const date = utcCalendarDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
    if (!date) throw new Error('Enter a valid date like 2026-11-13, or leave it blank.');
    return date;
  }
  const dmy = DMY_DATE.exec(text);
  if (dmy) {
    const date = utcCalendarDate(Number(dmy[3]), Number(dmy[2]), Number(dmy[1]));
    if (!date) throw new Error('Enter a valid date like 13/11/2026, or leave it blank.');
    return date;
  }
  throw new Error('Enter a date like 2026-11-13 or 13/11/2026, or leave it blank.');
}

export function readBatchDates(productionRaw: unknown, expiryRaw: unknown): BatchDateResult {
  let productionDate: Date | null;
  let expiryDate: Date | null;
  try {
    productionDate = parseCalendarDate(productionRaw);
    expiryDate = parseCalendarDate(expiryRaw);
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Enter a valid date, or leave it blank.' };
  }
  if (productionDate && expiryDate && expiryDate.getTime() < productionDate.getTime()) {
    return { ok: false, message: 'Expiry date must be on or after the production date.' };
  }
  return { ok: true, dates: { productionDate, expiryDate } };
}

export function businessCalendarToday(now: Date, timeZone: string): Date {
  const key = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  const [year, month, day] = key.split('-').map(Number);
  const date = utcCalendarDate(year, month, day);
  if (!date) throw new Error('Business timezone is required for report windows');
  return date;
}

export function calendarDaysUntil(expiry: Date, today: Date): number {
  const expiryDay = utcCalendarDate(expiry.getUTCFullYear(), expiry.getUTCMonth() + 1, expiry.getUTCDate());
  const todayDay = utcCalendarDate(today.getUTCFullYear(), today.getUTCMonth() + 1, today.getUTCDate());
  if (!expiryDay || !todayDay) return 0;
  return Math.round((expiryDay.getTime() - todayDay.getTime()) / 86_400_000);
}
