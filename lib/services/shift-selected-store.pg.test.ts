import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import {
  bindPrismaPostgresUrls,
  canRunLivePostgres,
  createBoundPrismaClient,
  resolveBoundPostgresUrl,
} from '@/lib/test/isolated-postgres';
import { performShiftOpen } from '@/lib/services/shifts';
import { resolveSoleOrSelectedStoreId } from '@/lib/reliability/selected-store';

const databaseUrl = resolveBoundPostgresUrl();
const canRun = canRunLivePostgres(databaseUrl);
if (canRun) bindPrismaPostgresUrls(databaseUrl);
const describeLive = canRun ? describe : describe.skip;

describeLive('selected-store shift open stays on Store B', () => {
  let prisma: PrismaClient;
  const suffix = `shift-store-${Date.now()}`;
  let businessId = '';
  let storeA = '';
  let storeB = '';
  let tillA = '';
  let tillB = '';
  let userId = '';

  beforeAll(async () => {
    bindPrismaPostgresUrls(databaseUrl);
    prisma = createBoundPrismaClient(databaseUrl);
    await prisma.$connect();
    const business = await prisma.business.create({
      data: {
        name: `Shift store ${suffix}`,
        currency: 'GHS',
        storeMode: 'MULTI_STORE',
      },
    });
    businessId = business.id;
    const first = await prisma.store.create({ data: { businessId, name: `A First ${suffix}` } });
    const second = await prisma.store.create({ data: { businessId, name: `B Selected ${suffix}` } });
    storeA = first.id;
    storeB = second.id;
    const ordered = await prisma.store.findMany({
      where: { businessId },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    expect(ordered[0].id).toBe(storeA);
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
    const [createdA, createdB] = await Promise.all([
      prisma.till.create({ data: { storeId: storeA, name: `Till A ${suffix}`, active: true } }),
      prisma.till.create({ data: { storeId: storeB, name: `Till B ${suffix}`, active: true } }),
    ]);
    tillA = createdA.id;
    tillB = createdB.id;
  }, 90000);

  afterAll(async () => {
    if (!prisma) return;
    await prisma.shift.deleteMany({ where: { till: { store: { businessId } } } }).catch(() => {});
    await prisma.till.deleteMany({ where: { id: { in: [tillA, tillB] } } }).catch(() => {});
    await prisma.user.deleteMany({ where: { businessId } }).catch(() => {});
    await prisma.store.deleteMany({ where: { id: { in: [storeA, storeB] } } }).catch(() => {});
    await prisma.business.deleteMany({ where: { id: businessId } }).catch(() => {});
    await prisma.$disconnect();
  });

  it('opens only on the explicit Store B till and leaves Store A unchanged', async () => {
    bindPrismaPostgresUrls(databaseUrl);
    const stores = [
      { id: storeA },
      { id: storeB },
    ];
    expect(resolveSoleOrSelectedStoreId(stores)).toBeNull();
    expect(resolveSoleOrSelectedStoreId(stores, storeB)).toBe(storeB);

    const beforeA = await prisma.shift.count({ where: { tillId: tillA } });
    const opened = await performShiftOpen({
      businessId,
      storeId: storeB,
      tillId: tillB,
      openingCashPence: 2500,
      actor: { userId, userName: 'Owner', userRole: 'OWNER' },
    });
    expect(opened.storeId).toBe(storeB);
    expect(opened.tillId).toBe(tillB);

    const afterA = await prisma.shift.count({ where: { tillId: tillA } });
    const bShift = await prisma.shift.findFirst({
      where: { id: opened.id },
      select: { till: { select: { storeId: true } } },
    });
    expect(bShift?.till.storeId).toBe(storeB);
    expect(afterA).toBe(beforeA);

    await expect(
      performShiftOpen({
        businessId,
        storeId: storeA,
        tillId: tillB,
        openingCashPence: 100,
        actor: { userId, userName: 'Owner', userRole: 'OWNER' },
      }),
    ).rejects.toThrow('Till not found for your business.');
  });
});
