import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { canRunLivePostgresTests, openTestPrismaClient, runTestTeardown } from '@/lib/test/test-prisma';
import { getMonthlyAccountEntries, getMonthlyBalanceReview } from './monthly-balance-review';

import { getBalanceSheet } from './financials';
import { getRecordedMoneyMovement } from './recorded-money';
vi.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn }));

const describePg = canRunLivePostgresTests() ? describe : describe.skip;
describePg('monthly balance review with isolated PostgreSQL journals', () => {
  let db: PrismaClient;
  const businessIds: string[] = [];
  let bankId = '';
  let capitalId = '';
  const tag = `monthly-review-${Date.now()}`;
  const now = new Date('2026-10-13T12:00:00Z');
  beforeAll(async () => {
    ({ prisma: db } = await openTestPrismaClient());
    for (const label of ['A', 'B']) businessIds.push((await db.business.create({ data: { name: `${tag}-${label}`, currency: 'GHS', timezone: 'Africa/Accra' } })).id);
    bankId = (await db.account.create({ data: { businessId: businessIds[0], code: '1010', name: 'Bank', type: 'ASSET' } })).id;
    capitalId = (await db.account.create({ data: { businessId: businessIds[0], code: '3000', name: 'Capital', type: 'EQUITY' } })).id;
    const foreignBank = (await db.account.create({ data: { businessId: businessIds[1], code: '1010', name: 'Foreign bank', type: 'ASSET' } })).id;
    const entries = [
      { id: `${tag}-opening`, businessId: businessIds[0], entryDate: new Date('2026-02-28T23:59:59Z'), description: 'Opening evidence fixture', amount: 1000 },
      { id: `${tag}-receipt`, businessId: businessIds[0], entryDate: new Date('2026-03-01'), description: 'Month start receipt', amount: 2000 },
      { id: `${tag}-payment`, businessId: businessIds[0], entryDate: new Date('2026-03-31T23:59:59Z'), description: 'Month end payment', amount: -4000 },
      { id: `${tag}-april`, businessId: businessIds[0], entryDate: new Date('2026-04-01'), description: 'Next month boundary', amount: 200000 },
      { id: `${tag}-future`, businessId: businessIds[0], entryDate: new Date('2026-10-14'), description: 'Future entry', amount: 999999 },
      ...Array.from({ length: 55 }, (_, i) => ({ id: `${tag}-detail-${i}`, businessId: businessIds[0], entryDate: new Date('2026-03-15'), description: `Detail ${i}`, amount: 10 })),
    ];
    await db.journalEntry.createMany({ data: entries.map(({ amount: _amount, ...entry }) => entry) });
    await db.journalLine.createMany({ data: entries.flatMap(entry => [
      { journalEntryId: entry.id, accountId: bankId, debitPence: Math.max(0, entry.amount), creditPence: Math.max(0, -entry.amount) },
      { journalEntryId: entry.id, accountId: capitalId, debitPence: Math.max(0, -entry.amount), creditPence: Math.max(0, entry.amount) },
    ]) });
    await db.journalEntry.create({ data: { businessId: businessIds[1], description: 'Other business', entryDate: new Date('2026-03-10'), lines: { create: { accountId: foreignBank, debitPence: 500000, creditPence: 0 } } } });
    await db.journalEntry.create({ data: { businessId: businessIds[1], description: 'Foreign journal referencing local account', entryDate: new Date('2026-03-10'), lines: { create: { accountId: bankId, debitPence: 900000, creditPence: 0 } } } });
  });
  afterAll(async () => {
    if (!db) return;
    await runTestTeardown(db, [
      () => db.journalLine.deleteMany({ where: { journalEntry: { businessId: { in: businessIds } } } }),
      () => db.journalEntry.deleteMany({ where: { businessId: { in: businessIds } } }),
      () => db.account.deleteMany({ where: { businessId: { in: businessIds } } }),
      () => db.business.deleteMany({ where: { id: { in: businessIds } } }),
    ]);
  });
  it('rolls forward the exact month and preserves a negative balance without other-business money', async () => {
    const review = await db.$transaction(tx => getMonthlyBalanceReview(tx, businessIds[0], '2026-03', 'Africa/Accra', now), { isolationLevel: 'Serializable' });
    expect(review.rows.find(row => row.id === bankId)).toMatchObject({ openingPence: 1000, debitPence: 2550, creditPence: 4000, closingPence: -450 });
    expect(review).toMatchObject({ movementDifferencePence: 0, closingDifferencePence: 0 });
  });
  it('shows the same ledger balance in the statement without undated capital or next-month entries', async () => {
    await db.business.update({ where: { id: businessIds[0] }, data: { openingCapitalPence: 12345 } });
    const sheet = await getBalanceSheet(businessIds[0], new Date('2026-04-01'));
    expect(sheet.totalAssets).toBe(-450);
    expect(sheet.totalEquity).toBe(-450);
    expect(sheet.legacyCapitalPence).toBe(12345);
    expect(sheet.reconciliation).toMatchObject({ equationDifferencePence: 0, status: 'UNRECONCILED' });
  });
  it('ties recorded money movement to the statement using exact boundaries and no undated capital', async () => {
    const movement = await getRecordedMoneyMovement(db, businessIds[0], new Date('2026-03-01'), new Date('2026-04-01'));
    const sheet = await getBalanceSheet(businessIds[0], new Date('2026-04-01'));
    expect(movement).toMatchObject({ beginningCashPence: 1000, netMovementPence: -1450, endingCashPence: -450 });
    expect(movement.endingCashPence).toBe(sheet.assets.filter(row => ['1000', '1010'].includes(row.accountCode)).reduce((sum, row) => sum + row.balancePence, 0));
  });
  it('paginates all 57 entries without capping the month total or skipping tied timestamps', async () => {
    const first = await getMonthlyAccountEntries(db, businessIds[0], '1010', '2026-03', 'Africa/Accra', now);
    const second = await getMonthlyAccountEntries(db, businessIds[0], '1010', '2026-03', 'Africa/Accra', now, 2);
    expect(first.total).toBe(57);
    expect(first.rows).toHaveLength(50);
    expect(second.rows).toHaveLength(7);
    expect(new Set([...first.rows, ...second.rows].map(row => row.id)).size).toBe(57);
  });
  it('excludes later-dated entries in the current partial month', async () => {
    const review = await getMonthlyBalanceReview(db, businessIds[0], '2026-10', 'Africa/Accra', now);
    expect(review.rows.find(row => row.id === bankId)).toMatchObject({ openingPence: 199550, debitPence: 0, creditPence: 0, closingPence: 199550 });
  });
});
