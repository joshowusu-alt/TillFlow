import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import {
  bindPrismaPostgresUrls,
  canRunLivePostgres,
  createBoundPrismaClient,
  resolveBoundPostgresUrl,
} from '@/lib/test/isolated-postgres';
import { performShiftOpen, TILL_ALREADY_OPEN_MSG } from '@/lib/services/shifts';

const databaseUrl = resolveBoundPostgresUrl();
const canRun = canRunLivePostgres(databaseUrl);
if (canRun) bindPrismaPostgresUrls(databaseUrl);
const describeConcurrency = canRun ? describe : describe.skip;

describeConcurrency('same-till shift open (Postgres)', () => {
  let prisma: PrismaClient;
  const suffix = `shift-conc-${Date.now()}`;
  let businessId = '';
  let storeId = '';
  let tillId = '';
  let userId = '';

  beforeAll(async () => {
    bindPrismaPostgresUrls(databaseUrl);
    prisma = createBoundPrismaClient(databaseUrl);
    await prisma.$connect();
    const business = await prisma.business.create({
      data: { name: `Shift Conc ${suffix}`, currency: 'GHS' },
    });
    businessId = business.id;
    const store = await prisma.store.create({ data: { businessId, name: `Store ${suffix}` } });
    storeId = store.id;
    const user = await prisma.user.create({
      data: {
        businessId,
        email: `${suffix}@example.com`,
        name: 'Owner',
        role: 'OWNER',
        passwordHash: 'x',
      },
    });
    userId = user.id;
    const till = await prisma.till.create({ data: { storeId, name: `Till ${suffix}`, active: true } });
    tillId = till.id;
  }, 60000);

  afterAll(async () => {
    if (!prisma) return;
    await prisma.cashDrawerEntry.deleteMany({ where: { businessId } }).catch(() => {});
    await prisma.shift.deleteMany({ where: { tillId } }).catch(() => {});
    await prisma.till.deleteMany({ where: { id: tillId } }).catch(() => {});
    await prisma.user.deleteMany({ where: { id: userId } }).catch(() => {});
    await prisma.store.deleteMany({ where: { id: storeId } }).catch(() => {});
    await prisma.business.deleteMany({ where: { id: businessId } }).catch(() => {});
    await prisma.$disconnect();
  });

  it('allows only one OPEN shift on the same till under concurrent open', async () => {
    bindPrismaPostgresUrls(databaseUrl);
    const actor = { userId, userName: 'Owner', userRole: 'OWNER' };
    const results = await Promise.allSettled([
      performShiftOpen({ businessId, storeId, actor, tillId, openingCashPence: 1000 }),
      performShiftOpen({ businessId, storeId, actor, tillId, openingCashPence: 2000 }),
    ]);

    const succeeded = results.filter((row) => row.status === 'fulfilled');
    const rejected = results.filter((row) => row.status === 'rejected');
    expect(succeeded).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(Error);
    expect((rejected[0] as PromiseRejectedResult).reason.message).toBe(TILL_ALREADY_OPEN_MSG);

    const open = await prisma.shift.findMany({ where: { tillId, status: 'OPEN' } });
    expect(open).toHaveLength(1);
    expect(open[0].openingCashPence).toBe(
      (succeeded[0] as PromiseFulfilledResult<{ openingCashPence: number }>).value.openingCashPence,
    );
  });
});
