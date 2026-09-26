import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { canRunLivePostgresTests, openTestPrismaClient, runTestTeardown } from '@/lib/test/test-prisma';

const REQUIRED = 'Business timezone is required for report windows';
const BOUNDARY = new Date('2026-06-30T22:00:00.000Z');

describe('Owner Home performance stored timezone (Postgres)', () => {
  let prisma: PrismaClient;
  let getHomePerformanceSummary: typeof import('@/lib/reports/home-performance-kpis').getHomePerformanceSummary;
  const suffix = `a7-tz-${Date.now()}`;
  const businessIds: string[] = [];

  beforeAll(async () => {
    expect(canRunLivePostgresTests(), 'disposable Postgres is required').toBe(true);
    const g = globalThis as unknown as { prisma?: PrismaClient };
    if (g.prisma) {
      await g.prisma.$disconnect().catch(() => {});
      g.prisma = undefined;
    }
    const handle = await openTestPrismaClient();
    prisma = handle.prisma;
    expect(handle.identity.database, 'refusing Production neondb').not.toBe('neondb');
    expect(handle.identity.sanitized, 'refusing Production host').not.toMatch(/fancy-darkness/i);
    ({ getHomePerformanceSummary } = await import('@/lib/reports/home-performance-kpis'));
  }, 90000);

  afterAll(async () => {
    if (!prisma) return;
    await runTestTeardown(
      prisma,
      [() => prisma.business.deleteMany({ where: { id: { in: businessIds } } })],
      { label: 'wave-a7-home-performance-timezone.pg.test.ts' },
    );
  });

  async function createBusiness(timezone: string) {
    const business = await prisma.business.create({
      data: { name: `A7 TZ ${timezone || 'blank'} ${suffix}`, currency: 'GHS', timezone },
    });
    businessIds.push(business.id);
    return business.id;
  }

  it('preserves a stored Africa/Nairobi timezone', async () => {
    const businessId = await createBusiness('Africa/Nairobi');
    const summary = await getHomePerformanceSummary(businessId, BOUNDARY);
    expect(summary.timeZone).toBe('Africa/Nairobi');
    expect(summary.todayScope.fromInputValue).toBe('2026-07-01');
    expect(summary.todayScope.toInputValue).toBe('2026-07-01');
  });

  it('rejects a stored Mars/Olympus timezone instead of substituting Africa/Accra', async () => {
    const businessId = await createBusiness('Mars/Olympus');
    let error: unknown;
    let timeZone: string | null = null;
    try {
      timeZone = (await getHomePerformanceSummary(businessId, BOUNDARY)).timeZone;
    } catch (caught) {
      error = caught;
    }
    expect({
      message: error instanceof Error ? error.message : null,
      timeZone,
    }).toEqual({ message: REQUIRED, timeZone: null });
  });

  it('rejects a stored blank timezone when the database accepts it', async () => {
    let businessId = '';
    try {
      businessId = await createBusiness('');
    } catch (error) {
      expect(error).toBeTruthy();
      return;
    }
    const stored = await prisma.business.findUnique({ where: { id: businessId }, select: { timezone: true } });
    expect(stored?.timezone).toBe('');
    let error: unknown;
    let timeZone: string | null = null;
    try {
      timeZone = (await getHomePerformanceSummary(businessId, BOUNDARY)).timeZone;
    } catch (caught) {
      error = caught;
    }
    expect({
      message: error instanceof Error ? error.message : null,
      timeZone,
    }).toEqual({ message: REQUIRED, timeZone: null });
  });
});
