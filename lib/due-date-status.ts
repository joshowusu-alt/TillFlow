export type DueDateState = 'NONE' | 'CURRENT' | 'DUE_SOON' | 'OVERDUE';

export type DueDateStatus = {
  state: DueDateState;
  daysOverdue: number | null;
  daysUntilDue: number | null;
};

function utcStartOfDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/**
 * Shared due-date status for invoice badges.
 * Uses whole-day UTC arithmetic so all pages classify due dates consistently.
 */
export function getDueDateStatus(
  dueDate: Date | null | undefined,
  now: Date,
  options?: { isClosed?: boolean; dueSoonDays?: number }
): DueDateStatus {
  if (!dueDate) {
    return { state: 'NONE', daysOverdue: null, daysUntilDue: null };
  }

  if (options?.isClosed) {
    return { state: 'CURRENT', daysOverdue: 0, daysUntilDue: 0 };
  }

  const dueSoonDays = options?.dueSoonDays ?? 3;
  const nowDay = utcStartOfDay(now);
  const dueDay = utcStartOfDay(dueDate);
  const msPerDay = 86_400_000;

  const daysOverdue = Math.floor((nowDay.getTime() - dueDay.getTime()) / msPerDay);
  const daysUntilDue = Math.floor((dueDay.getTime() - nowDay.getTime()) / msPerDay);

  if (daysOverdue > 0) {
    return { state: 'OVERDUE', daysOverdue, daysUntilDue };
  }

  if (daysUntilDue <= dueSoonDays) {
    return { state: 'DUE_SOON', daysOverdue, daysUntilDue };
  }

  return { state: 'CURRENT', daysOverdue, daysUntilDue };
}
