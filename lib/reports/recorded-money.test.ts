import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { getRecordedMoneyMovement, readRecordedMoneyMovement } from './recorded-money';

const start = new Date('2026-03-01');
const end = new Date('2026-04-01');
const sums = (accountId: string, debitPence: number, creditPence: number) => ({ accountId, _sum: { debitPence, creditPence } });
function fixture(opening = [sums('cash', 10000, 0), sums('bank', 50000, 0)], movement = [sums('cash', 5000, 6000), sums('bank', 16000, 8000)]) {
  const db = {
    account: { findMany: vi.fn().mockResolvedValue([{ id: 'cash', code: '1000', name: 'Cash' }, { id: 'bank', code: '1010', name: 'Bank' }]) },
    journalLine: { groupBy: vi.fn().mockResolvedValueOnce(opening).mockResolvedValueOnce(movement) },
    $transaction: vi.fn(),
  };
  db.$transaction.mockImplementation(fn => fn(db));
  return db;
}

describe('recorded cash and bank movement foundation', () => {
  it('includes both accounts and rolls receipts, payments and an internal transfer into the recorded close', async () => {
    // Cash: 100 - 40 transfer + 50 receipt - 20 payment = 90.
    // Bank: 500 + 40 transfer + 120 receipt - 80 payment = 580.
    const db = fixture();
    const result = await getRecordedMoneyMovement(db as unknown as PrismaClient, 'biz', start, end);
    expect(result).toMatchObject({ beginningCashPence: 60000, netMovementPence: 7000, endingCashPence: 67000 });
    expect(result.rows.map(row => row.closingPence)).toEqual([9000, 58000]);
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), expect.objectContaining({ isolationLevel: 'Serializable' }));
  });
  it('does not count an internal cash/bank transfer as a net inflow', async () => {
    const result = await readRecordedMoneyMovement(fixture(undefined, [sums('cash', 0, 4000), sums('bank', 4000, 0)]) as unknown as PrismaClient, 'biz', start, end);
    expect(result.netMovementPence).toBe(0);
    expect(result.endingCashPence).toBe(result.beginningCashPence);
  });
  it('preserves negative positions and reports an empty ledger as zero', async () => {
    const negative = await readRecordedMoneyMovement(fixture([], [sums('bank', 0, 500)]) as unknown as PrismaClient, 'biz', start, end);
    expect(negative.endingCashPence).toBe(-500);
    const empty = await readRecordedMoneyMovement(fixture([], []) as unknown as PrismaClient, 'biz', start, end);
    expect(empty).toMatchObject({ beginningCashPence: 0, netMovementPence: 0, endingCashPence: 0 });
  });
  it('scopes both relations to the business and uses exclusive boundaries', async () => {
    const db = fixture();
    await readRecordedMoneyMovement(db as unknown as PrismaClient, 'biz', start, end);
    const account = { businessId: 'biz', code: { in: ['1000', '1010'] }, type: 'ASSET' };
    expect(db.journalLine.groupBy.mock.calls[0][0].where).toEqual({ account, journalEntry: { businessId: 'biz', entryDate: { lt: start } } });
    expect(db.journalLine.groupBy.mock.calls[1][0].where).toEqual({ account, journalEntry: { businessId: 'biz', entryDate: { gte: start, lt: end } } });
  });
  it.each([[end, start], [start, start], [new Date('invalid'), end]])('refuses invalid bounds before database reads', async (from, to) => {
    const db = fixture();
    await expect(readRecordedMoneyMovement(db as unknown as PrismaClient, 'biz', from, to)).rejects.toThrow('valid cash movement period');
    expect(db.account.findMany).not.toHaveBeenCalled();
  });
  it('refuses arithmetic outside exact integer-pence precision', async () => {
    await expect(readRecordedMoneyMovement(fixture([sums('cash', Number.MAX_SAFE_INTEGER, 0)], [sums('cash', 1, 0)]) as unknown as PrismaClient, 'biz', start, end)).rejects.toThrow('precision');
  });
});
