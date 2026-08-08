/**
 * Slice 2B PostgreSQL two-business foreign-package service-boundary tests.
 *
 * Requires a real Postgres URL. Skipped otherwise — mocks are not labelled as a pass.
 *
 *   set DATABASE_URL=postgresql://...
 *   npx vitest run lib/services/migration/slice2b-pg.integration.test.ts
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createHash } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { isPostgresDatabaseUrl } from '@/lib/database-runtime';
import { createMemoryMigrationObjectStorage } from '@/lib/services/migration/storage';
import { MigrationServiceError } from '@/lib/services/migration/errors';

const databaseUrl =
  process.env.MIGRATION_SLICE2B_DATABASE_URL ||
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.DATABASE_URL;
const canRun = !!databaseUrl && isPostgresDatabaseUrl(databaseUrl);

const describePg = canRun ? describe : describe.skip;

function sha(text: string) {
  return createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex');
}

function cuid() {
  return 'c' + createHash('sha256').update(String(Math.random()) + Date.now()).digest('hex').slice(0, 24);
}

describePg('migration slice 2B PostgreSQL two-business isolation', () => {
  let prisma: PrismaClient;
  let validateMigrationPackage: typeof import('@/lib/services/migration/validate').validateMigrationPackage;
  let getMigrationValidationRun: typeof import('@/lib/services/migration/validate').getMigrationValidationRun;

  const suffix = `s2b-${Date.now()}`;
  let bizA = '';
  let bizB = '';
  let ownerA = '';
  let managerA = '';
  let cashierA = '';
  let ownerB = '';
  let storeB = '';
  let pkgB = '';
  const storage = createMemoryMigrationObjectStorage();

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl!;
    const g = globalThis as unknown as { prisma?: PrismaClient };
    if (g.prisma) {
      await g.prisma.$disconnect().catch(() => {});
      g.prisma = undefined;
    }
    vi.resetModules();
    const mod = await import('@/lib/services/migration/validate');
    validateMigrationPackage = mod.validateMigrationPackage;
    getMigrationValidationRun = mod.getMigrationValidationRun;

    prisma = new PrismaClient();
    await prisma.$connect();

    const a = await prisma.business.create({
      data: { name: `Slice2B A ${suffix}`, currency: 'GHS' },
    });
    const b = await prisma.business.create({
      data: { name: `Slice2B B ${suffix}`, currency: 'GHS' },
    });
    bizA = a.id;
    bizB = b.id;

    const users = await Promise.all([
      prisma.user.create({
        data: {
          businessId: bizA,
          email: `owner-a-${suffix}@example.com`,
          name: 'Owner A',
          role: 'OWNER',
          passwordHash: 'x',
        },
      }),
      prisma.user.create({
        data: {
          businessId: bizA,
          email: `mgr-a-${suffix}@example.com`,
          name: 'Manager A',
          role: 'MANAGER',
          passwordHash: 'x',
        },
      }),
      prisma.user.create({
        data: {
          businessId: bizA,
          email: `cash-a-${suffix}@example.com`,
          name: 'Cashier A',
          role: 'CASHIER',
          passwordHash: 'x',
        },
      }),
      prisma.user.create({
        data: {
          businessId: bizB,
          email: `owner-b-${suffix}@example.com`,
          name: 'Owner B',
          role: 'OWNER',
          passwordHash: 'x',
        },
      }),
    ]);
    ownerA = users[0]!.id;
    managerA = users[1]!.id;
    cashierA = users[2]!.id;
    ownerB = users[3]!.id;

    const store = await prisma.store.create({
      data: { businessId: bizB, name: `Store B ${suffix}` },
    });
    storeB = store.id;

    pkgB = cuid();
    const expiresAt = new Date(Date.now() + 14 * 86400000);
    await prisma.migrationPackage.create({
      data: {
        id: pkgB,
        businessId: bizB,
        contractVersion: '1',
        sourceSystemKey: 'synthetic',
        sourceBusinessKey: 'biz-b-src',
        reportingCurrency: 'GHS',
        packageAsOfDate: '2026-01-15',
        status: 'DRAFT',
        version: 1,
        lineageRootId: pkgB,
        createdByUserId: ownerB,
        expiresAt,
      },
    });

    await prisma.migrationBranchMapping.create({
      data: {
        businessId: bizB,
        packageId: pkgB,
        sourceBranchKey: 'hq',
        targetStoreId: storeB,
      },
    });

    const csv = {
      SUPPLIERS: 'sourceSupplierKey,supplierName\ns1,Acme\n',
      PRODUCTS:
        'sourceProductKey,productName,costPrice,sellingPrice,active,barcode,defaultSupplierSourceKey\n' +
        'p1,Widget,1.50,2.00,true,bc1,s1\n',
      OPENING_STOCK:
        'sourceProductKey,sourceBranchKey,quantity,unitCost,asOfDate\n' +
        'p1,hq,10,1.50,2026-01-15\n',
    } as const;

    for (const entityType of Object.keys(csv) as Array<keyof typeof csv>) {
      const body = Buffer.from(csv[entityType], 'utf8');
      const pathname = `mig/${bizB}/${pkgB}/upl/${entityType}.csv`;
      await storage.put({ pathname, body, contentType: 'text/csv' });
      await prisma.migrationFile.create({
        data: {
          businessId: bizB,
          packageId: pkgB,
          entityType,
          storageStatus: 'FINALISED',
          storageKey: pathname,
          uploadChecksum: sha(csv[entityType]),
          byteLength: body.length,
        },
      });
    }
  }, 120_000);

  afterAll(async () => {
    if (!prisma) return;
    try {
      await prisma.migrationPackage.updateMany({
        where: { businessId: { in: [bizA, bizB] } },
        data: { latestValidationRunId: null },
      });
      await prisma.migrationValidationRun.deleteMany({
        where: { businessId: { in: [bizA, bizB] } },
      });
      await prisma.migrationFile.deleteMany({ where: { businessId: { in: [bizA, bizB] } } });
      await prisma.migrationBranchMapping.deleteMany({
        where: { businessId: { in: [bizA, bizB] } },
      });
      await prisma.migrationPackage.deleteMany({ where: { businessId: { in: [bizA, bizB] } } });
      await prisma.store.deleteMany({ where: { businessId: { in: [bizA, bizB] } } });
      await prisma.user.deleteMany({ where: { businessId: { in: [bizA, bizB] } } });
      await prisma.business.deleteMany({ where: { id: { in: [bizA, bizB] } } });
    } finally {
      await prisma.$disconnect();
    }
  });

  it('Owner B can validate own package', async () => {
    const productCountBefore = await prisma.product.count({ where: { businessId: bizB } });
    const result = await validateMigrationPackage(
      { userId: ownerB, userRole: 'OWNER', businessId: bizB, userName: 'Owner B' },
      { packageId: pkgB, expectedVersion: 1, businessId: bizA },
      { db: prisma, storage },
    );
    expect(result.packageStatus).toBe('VALIDATED');
    const productCountAfter = await prisma.product.count({ where: { businessId: bizB } });
    expect(productCountAfter).toBe(productCountBefore);
  });

  it('Owner A / Manager A get NOT_FOUND for Business B package (non-enumerating)', async () => {
    const pkg = await prisma.migrationPackage.findFirst({ where: { id: pkgB } });
    expect(pkg?.businessId).toBe(bizB);

    async function capture(actor: {
      userId: string;
      userRole: string;
      businessId: string;
      userName: string;
    }, packageId: string) {
      try {
        await validateMigrationPackage(
          actor,
          { packageId, expectedVersion: pkg!.version },
          { db: prisma, storage },
        );
        return null;
      } catch (e) {
        return e as MigrationServiceError;
      }
    }

    const ownerForeign = await capture(
      { userId: ownerA, userRole: 'OWNER', businessId: bizA, userName: 'Owner A' },
      pkgB,
    );
    const ownerMissing = await capture(
      { userId: ownerA, userRole: 'OWNER', businessId: bizA, userName: 'Owner A' },
      'missing-package-id-zzzz',
    );
    const mgrForeign = await capture(
      { userId: managerA, userRole: 'MANAGER', businessId: bizA, userName: 'Mgr A' },
      pkgB,
    );

    expect(ownerForeign?.code).toBe('NOT_FOUND');
    expect(ownerMissing?.code).toBe('NOT_FOUND');
    expect(mgrForeign?.code).toBe('NOT_FOUND');
    expect(ownerForeign?.message).toBe(ownerMissing?.message);
    expect(JSON.stringify(ownerForeign)).not.toContain(bizB);
    expect(JSON.stringify(ownerForeign)).not.toContain('VALIDATED');

    // No mutation of foreign package
    const again = await prisma.migrationPackage.findFirst({ where: { id: pkgB } });
    expect(again?.version).toBe(pkg!.version);
  });

  it('Cashier A denied; unauthenticated denied', async () => {
    await expect(
      validateMigrationPackage(
        { userId: cashierA, userRole: 'CASHIER', businessId: bizA, userName: 'Cash' },
        { packageId: pkgB, expectedVersion: 1 },
        { db: prisma, storage },
      ),
    ).rejects.toMatchObject({ code: 'ROLE_DENIED' });

    await expect(
      validateMigrationPackage(
        { userId: '', userRole: '', businessId: '' },
        { packageId: pkgB, expectedVersion: 1 },
        { db: prisma, storage },
      ),
    ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  });

  it('validation-run reads are tenant scoped', async () => {
    const pkg = await prisma.migrationPackage.findFirst({
      where: { id: pkgB, businessId: bizB },
    });
    expect(pkg?.latestValidationRunId).toBeTruthy();
    await expect(
      getMigrationValidationRun(
        { userId: ownerA, userRole: 'OWNER', businessId: bizA },
        { packageId: pkgB, runId: pkg!.latestValidationRunId! },
        prisma,
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('stale expectedVersion rejected under CAS', async () => {
    const pkg = await prisma.migrationPackage.findFirst({ where: { id: pkgB } });
    await expect(
      validateMigrationPackage(
        { userId: ownerB, userRole: 'OWNER', businessId: bizB },
        { packageId: pkgB, expectedVersion: (pkg?.version ?? 1) - 1 },
        { db: prisma, storage },
      ),
    ).rejects.toMatchObject({ code: 'STALE_VERSION' });
  });

  it('concurrent validation: exactly one CAS winner', async () => {
    // Reset package to DRAFT with bumped version for a fresh race.
    const pkg = await prisma.migrationPackage.findFirst({ where: { id: pkgB } });
    await prisma.migrationPackage.update({
      where: { id: pkgB },
      data: {
        status: 'DRAFT',
        version: (pkg?.version ?? 1) + 1,
        latestValidationRunId: null,
        validatedAt: null,
        validatedByUserId: null,
      },
    });
    const fresh = await prisma.migrationPackage.findFirst({ where: { id: pkgB } });
    const version = fresh!.version;

    const results = await Promise.allSettled([
      validateMigrationPackage(
        { userId: ownerB, userRole: 'OWNER', businessId: bizB },
        { packageId: pkgB, expectedVersion: version },
        { db: prisma, storage },
      ),
      validateMigrationPackage(
        { userId: ownerB, userRole: 'OWNER', businessId: bizB },
        { packageId: pkgB, expectedVersion: version },
        { db: prisma, storage },
      ),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);
    const err = (rejected[0] as PromiseRejectedResult).reason as MigrationServiceError;
    expect(err.code).toBe('STALE_VERSION');
    const after = await prisma.migrationPackage.findFirst({ where: { id: pkgB } });
    expect(after?.status).toBe('VALIDATED');
    expect(after?.version).toBe(version + 1);
  });
});
