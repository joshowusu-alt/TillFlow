import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { computeMonthlyBalanceRows, getMonthlyAccountEntries, getMonthlyBalanceReview, monthlyReviewWindow } from './monthly-balance-review';

const accounts = [
  { id: 'cash', code: '1000', name: 'Cash', type: 'ASSET' },
  { id: 'ap', code: '2000', name: 'Supplier debts', type: 'LIABILITY' },
];
const sums = (accountId: string, debitPence: number, creditPence: number) => ({ accountId, _sum: { debitPence, creditPence } });

describe('monthly balance windows', () => {
  it('includes March and excludes April at the business timezone boundary', () => {
    const window = monthlyReviewWindow('2026-03', 'America/New_York', new Date('2026-10-13T12:00:00Z'));
    expect(window.start.toISOString()).toBe('2026-03-01T05:00:00.000Z');
    expect(window.endExclusive.toISOString()).toBe('2026-04-01T04:00:00.000Z');
    expect(window.partial).toBe(false);
  });
  it('does not include later-dated records in a partial month', () => {
    const now = new Date('2026-10-13T12:00:00Z');
    expect(monthlyReviewWindow('2026-10', 'Africa/Accra', now)).toMatchObject({ endExclusive: now, partial: true });
  });
  it('handles December rollover and leap February', () => {
    expect(monthlyReviewWindow('2025-12', 'Africa/Accra', new Date('2026-01-01')).endExclusive.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    const leap = monthlyReviewWindow('2024-02', 'Africa/Accra', new Date('2026-01-01'));
    expect((leap.endExclusive.getTime() - leap.start.getTime()) / 86400000).toBe(29);
  });
  it.each(['2026-13', '2026-00', '2026-3', 'garbage', '2026-11'])('rejects invalid or future month %s', month => {
    expect(() => monthlyReviewWindow(month, 'Africa/Accra', new Date('2026-10-13'))).toThrow();
  });
});

describe('account entry drill-down', () => {
  it('scopes paginated entries and count to the same business, account and exact month', async () => {
    const db = {
      account: { findFirst: vi.fn().mockResolvedValue({ id: 'bank-a', code: '1010', name: 'Bank' }) },
      journalLine: { findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(101) },
    };
    const result = await getMonthlyAccountEntries(db as unknown as PrismaClient, 'business-a', '1010', '2026-03', 'Africa/Accra', new Date('2026-10-13'), 2);
    expect(db.account.findFirst.mock.calls[0][0].where).toEqual({ businessId: 'business-a', code: '1010' });
    const query = db.journalLine.findMany.mock.calls[0][0];
    expect(query).toMatchObject({ skip: 50, take: 50, where: { accountId: 'bank-a', account: { businessId: 'business-a' }, journalEntry: { businessId: 'business-a', entryDate: { gte: new Date('2026-03-01'), lt: new Date('2026-04-01') } } } });
    expect(db.journalLine.count.mock.calls[0][0].where).toEqual(query.where);
    expect(query.orderBy).toEqual([{ journalEntry: { entryDate: 'desc' } }, { id: 'desc' }]);
    expect(result.total).toBe(101);
  });
  it('refuses a foreign or missing account before querying entries', async () => {
    const db = { account: { findFirst: vi.fn().mockResolvedValue(null) }, journalLine: { findMany: vi.fn() } };
    await expect(getMonthlyAccountEntries(db as unknown as PrismaClient, 'business-a', '1010', '2026-03', 'Africa/Accra', new Date('2026-10-13'))).rejects.toThrow('Account not found');
    expect(db.journalLine.findMany).not.toHaveBeenCalled();
  });
  it.each([0, -1, 1.5, Infinity, 1000001])('refuses invalid page %s before database reads', async page => {
    const db = { account: { findFirst: vi.fn() } };
    await expect(getMonthlyAccountEntries(db as unknown as PrismaClient, 'business-a', '1010', '2026-03', 'Africa/Accra', new Date('2026-10-13'), page)).rejects.toThrow();
    expect(db.account.findFirst).not.toHaveBeenCalled();
  });
});

describe('recorded monthly balances', () => {
  it('preserves money in and out, normal credit balances, and negative balances', () => {
    const rows = computeMonthlyBalanceRows(accounts, [sums('cash', 1000, 0), sums('ap', 0, 1500)], [sums('cash', 200, 1700), sums('ap', 300, 700)]);
    expect(rows[0]).toMatchObject({ openingPence: 1000, debitPence: 200, creditPence: 1700, closingPence: -500, closingDebitNet: -500 });
    expect(rows[1]).toMatchObject({ openingPence: 1500, closingPence: 1900, closingDebitNet: -1900 });
  });
  it('keeps zero-activity accounts visible without certifying them', () => {
    expect(computeMonthlyBalanceRows(accounts, [], [])[0]).toMatchObject({ openingPence: 0, closingPence: 0 });
  });
  it('scopes accounts and both journal relations and returns unexplained differences', async () => {
    const db = {
      account: { findMany: vi.fn().mockResolvedValue(accounts) },
      journalLine: { groupBy: vi.fn().mockResolvedValueOnce([sums('cash', 1000, 0)]).mockResolvedValueOnce([sums('cash', 500, 100)]) },
      business: { findUniqueOrThrow: vi.fn().mockResolvedValue({ openingCapitalPence: 4000 }) },
    };
    const result = await getMonthlyBalanceReview(db as unknown as PrismaClient, 'business-a', '2026-03', 'Africa/Accra', new Date('2026-10-13'));
    expect(db.account.findMany.mock.calls[0][0].where).toEqual({ businessId: 'business-a' });
    expect(db.journalLine.groupBy.mock.calls[0][0].where).toEqual({ account: { businessId: 'business-a' }, journalEntry: { businessId: 'business-a', entryDate: { lt: new Date('2026-03-01') } } });
    expect(db.journalLine.groupBy.mock.calls[1][0].where).toEqual({ account: { businessId: 'business-a' }, journalEntry: { businessId: 'business-a', entryDate: { gte: new Date('2026-03-01'), lt: new Date('2026-04-01') } } });
    expect(result).toMatchObject({ movementDifferencePence: 400, closingDifferencePence: 1400, legacyCapitalPence: 4000, throughLocalDate: '2026-03-31' });
    expect(result.rows[0].closingPence).toBe(1400); // no legacy capital injected
  });
});
