import type { Prisma, PrismaClient } from '@prisma/client';

/** Cash on hand and the combined Bank/MoMo account in TillFlow's chart. */
const MONEY_CODES = ['1000', '1010'];
type Sum = { accountId: string; _sum: { debitPence: number | null; creditPence: number | null } };

function exactPence(value: number) {
  if (!Number.isSafeInteger(value)) throw new Error('Money total exceeds supported precision');
  return value === 0 ? 0 : value;
}

/** Recorded positions only: no operating-profit estimate or undated capital injection. */
export async function readRecordedMoneyMovement(db: Prisma.TransactionClient, businessId: string, start: Date, endExclusive: Date) {
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(endExclusive.getTime()) || start >= endExclusive) {
    throw new Error('Choose a valid cash movement period');
  }
  const account = { businessId, code: { in: MONEY_CODES }, type: 'ASSET' };
  const [accounts, opening, movement] = await Promise.all([
    db.account.findMany({ where: account, select: { id: true, code: true, name: true }, orderBy: { code: 'asc' } }),
    db.journalLine.groupBy({ by: ['accountId'], where: { account, journalEntry: { businessId, entryDate: { lt: start } } }, _sum: { debitPence: true, creditPence: true } }),
    db.journalLine.groupBy({ by: ['accountId'], where: { account, journalEntry: { businessId, entryDate: { gte: start, lt: endExclusive } } }, _sum: { debitPence: true, creditPence: true } }),
  ]);
  const net = (sum?: Sum) => exactPence(exactPence(sum?._sum.debitPence ?? 0) - exactPence(sum?._sum.creditPence ?? 0));
  const beginnings = new Map(opening.map(row => [row.accountId, row]));
  const changes = new Map(movement.map(row => [row.accountId, row]));
  const rows = accounts.map(row => {
    const openingPence = net(beginnings.get(row.id));
    const netMovementPence = net(changes.get(row.id));
    return { ...row, openingPence, netMovementPence, closingPence: exactPence(openingPence + netMovementPence) };
  });
  const total = (field: 'openingPence' | 'netMovementPence' | 'closingPence') => exactPence(rows.reduce((sum, row) => exactPence(sum + row[field]), 0));
  return { rows, beginningCashPence: total('openingPence'), netMovementPence: total('netMovementPence'), endingCashPence: total('closingPence') };
}

export async function getRecordedMoneyMovement(db: PrismaClient, businessId: string, start: Date, endExclusive: Date) {
  return db.$transaction(tx => readRecordedMoneyMovement(tx, businessId, start, endExclusive), {
    isolationLevel: 'Serializable', maxWait: 5000, timeout: 15000,
  });
}
