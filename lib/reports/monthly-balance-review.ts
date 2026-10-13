import type { Prisma, PrismaClient } from '@prisma/client';
import { formatBusinessLocalDateKey } from '@/lib/notifications/utils';
import { localDateInstant, requireReportTimeZone } from '@/lib/reports/reporting-clock';

type Db = PrismaClient | Prisma.TransactionClient;
type Account = { id: string; code: string; name: string; type: string };
type Sum = { accountId: string; _sum: { debitPence: number | null; creditPence: number | null } };

export function monthlyReviewWindow(month: string, timezone: string, now: Date) {
  const zone = requireReportTimeZone(timezone);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || !Number.isFinite(now.getTime())) throw new Error('Choose a valid month');
  const start = localDateInstant(`${month}-01`, 'start', zone);
  if (!start || start > now) throw new Error('Choose a month that has started');
  const [year, number] = month.split('-').map(Number);
  const next = number === 12 ? `${year + 1}-01` : `${year}-${String(number + 1).padStart(2, '0')}`;
  const nextStart = localDateInstant(`${next}-01`, 'start', zone);
  if (!nextStart) throw new Error('Choose a valid month');
  return { start, endExclusive: new Date(Math.min(now.getTime(), nextStart.getTime())), partial: now < nextStart, timezone: zone, month };
}

/** A trial-balance review preserves signed ledger amounts; it never certifies evidence. */
export function computeMonthlyBalanceRows(accounts: Account[], opening: Sum[], movement: Sum[]) {
  const beginnings = new Map(opening.map(row => [row.accountId, row._sum]));
  const changes = new Map(movement.map(row => [row.accountId, row._sum]));
  return accounts.map(account => {
    const before = beginnings.get(account.id);
    const during = changes.get(account.id);
    const debitPence = during?.debitPence ?? 0;
    const creditPence = during?.creditPence ?? 0;
    const openingDebitNet = (before?.debitPence ?? 0) - (before?.creditPence ?? 0);
    const closingDebitNet = openingDebitNet + debitPence - creditPence;
    const normalSign = ['LIABILITY', 'EQUITY', 'INCOME'].includes(account.type) ? -1 : 1;
    return { ...account, openingPence: normalSign * openingDebitNet, debitPence, creditPence,
      closingPence: normalSign * closingDebitNet, closingDebitNet };
  });
}

export async function getMonthlyBalanceReview(db: Db, businessId: string, month: string, timezone: string, now: Date) {
  const window = monthlyReviewWindow(month, timezone, now);
  // Scope both relations: a corrupt foreign-account link must never leak another business.
  const scoped = { account: { businessId }, journalEntry: { businessId } };
  const [accounts, opening, movement, business] = await Promise.all([
    db.account.findMany({ where: { businessId }, select: { id: true, code: true, name: true, type: true }, orderBy: { code: 'asc' } }),
    db.journalLine.groupBy({ by: ['accountId'], where: { ...scoped, journalEntry: { businessId, entryDate: { lt: window.start } } }, _sum: { debitPence: true, creditPence: true } }),
    db.journalLine.groupBy({ by: ['accountId'], where: { ...scoped, journalEntry: { businessId, entryDate: { gte: window.start, lt: window.endExclusive } } }, _sum: { debitPence: true, creditPence: true } }),
    db.business.findUniqueOrThrow({ where: { id: businessId }, select: { openingCapitalPence: true } }),
  ]);
  const rows = computeMonthlyBalanceRows(accounts, opening, movement);
  return { rows, window, legacyCapitalPence: business.openingCapitalPence ?? 0,
    movementDifferencePence: rows.reduce((sum, row) => sum + row.debitPence - row.creditPence, 0),
    closingDifferencePence: rows.reduce((sum, row) => sum + row.closingDebitNet, 0),
    throughLocalDate: formatBusinessLocalDateKey(window.partial ? now : new Date(window.endExclusive.getTime() - 1), timezone),
  };
}

export async function getMonthlyAccountEntries(db: Db, businessId: string, accountCode: string, month: string, timezone: string, now: Date, page = 1) {
  const window = monthlyReviewWindow(month, timezone, now);
  if (!/^\d{4}$/.test(accountCode) || !Number.isSafeInteger(page) || page < 1 || page > 1000000) throw new Error('Choose a valid account and page');
  const account = await db.account.findFirst({ where: { businessId, code: accountCode }, select: { id: true, name: true, code: true } });
  if (!account) throw new Error('Account not found');
  const where = { accountId: account.id, account: { businessId }, journalEntry: { businessId, entryDate: { gte: window.start, lt: window.endExclusive } } };
  const pageSize = 50;
  const [rows, total] = await Promise.all([
    db.journalLine.findMany({ where, orderBy: [{ journalEntry: { entryDate: 'desc' as const } }, { id: 'desc' as const }], skip: (page - 1) * pageSize, take: pageSize,
      select: { id: true, debitPence: true, creditPence: true, memo: true, journalEntry: { select: { entryDate: true, description: true, referenceType: true, referenceId: true } } } }),
    db.journalLine.count({ where }),
  ]);
  return { account, rows, total, page, pageSize };
}
