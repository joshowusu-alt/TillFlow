/**
 * Slice 2B service-boundary unit tests (in-memory Prisma mock + memory Blob).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'crypto';
import { createMemoryMigrationObjectStorage } from '@/lib/services/migration/storage';
import { MigrationServiceError } from '@/lib/services/migration/errors';
import { MIGRATION_PUBLIC_ERROR_MESSAGES } from '@/lib/services/migration/errors';

type Row = Record<string, unknown>;

const { state, prismaMock } = vi.hoisted(() => {
  const state = {
    packages: [] as Row[],
    files: [] as Row[],
    mappings: [] as Row[],
    runs: [] as Row[],
    audits: [] as Row[],
    products: [] as Row[],
    suppliers: [] as Row[],
    nextId: 1,
  };
  const cuid = () => `id_${state.nextId++}`;

  const tx = {
    migrationPackage: {
      findFirst: vi.fn(async ({ where, include }: { where: Row; include?: Row }) => {
        const pkg =
          state.packages.find(
            (p) =>
              (!where.id || p.id === where.id) &&
              (!where.businessId || p.businessId === where.businessId),
          ) ?? null;
        if (!pkg) return null;
        const out: Row = { ...pkg };
        if (include?.files) {
          out.files = state.files.filter(
            (f) => f.packageId === pkg.id && f.businessId === pkg.businessId,
          );
        }
        if (include?.branchMappings) {
          out.branchMappings = state.mappings.filter(
            (m) => m.packageId === pkg.id && m.businessId === pkg.businessId,
          );
        }
        if (include?.latestValidationRun) {
          out.latestValidationRun =
            state.runs.find((r) => r.id === pkg.latestValidationRunId) ?? null;
        }
        return out;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Row }) => {
        const row = state.packages.find((p) => p.id === where.id);
        if (!row) throw new Error('missing');
        Object.assign(row, data);
        return { ...row };
      }),
    },
    migrationFile: {
      findMany: vi.fn(async ({ where }: { where: Row }) =>
        state.files.filter(
          (f) =>
            (!where.businessId || f.businessId === where.businessId) &&
            (!where.packageId || f.packageId === where.packageId),
        ),
      ),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Row }) => {
        const row = state.files.find((f) => f.id === where.id);
        if (!row) throw new Error('missing');
        Object.assign(row, data);
        return { ...row };
      }),
      updateMany: vi.fn(async ({ where, data }: { where: Row; data: Row }) => {
        let count = 0;
        for (const f of state.files) {
          if (where.businessId && f.businessId !== where.businessId) continue;
          if (where.packageId && f.packageId !== where.packageId) continue;
          Object.assign(f, data);
          count += 1;
        }
        return { count };
      }),
    },
    migrationValidationRun: {
      create: vi.fn(async ({ data }: { data: Row }) => {
        const row = {
          id: cuid(),
          supersededAt: null,
          createdAt: new Date(),
          ...data,
        };
        state.runs.push(row);
        return { ...row };
      }),
      findFirst: vi.fn(async ({ where }: { where: Row }) => {
        return (
          state.runs.find(
            (r) =>
              (!where.id || r.id === where.id) &&
              (!where.packageId || r.packageId === where.packageId) &&
              (!where.businessId || r.businessId === where.businessId),
          ) ?? null
        );
      }),
      updateMany: vi.fn(async ({ where, data }: { where: Row; data: Row }) => {
        let count = 0;
        for (const r of state.runs) {
          if (where.id && r.id !== where.id) continue;
          if (where.businessId && r.businessId !== where.businessId) continue;
          if (where.packageId && r.packageId !== where.packageId) continue;
          if (where.supersededAt === null && r.supersededAt != null) continue;
          Object.assign(r, data);
          count += 1;
        }
        return { count };
      }),
    },
    auditLog: {
      create: vi.fn(async ({ data }: { data: Row }) => {
        const row = { id: cuid(), ...data };
        state.audits.push(row);
        return row;
      }),
    },
    $queryRaw: vi.fn(async (_s: TemplateStringsArray, ...values: unknown[]) => {
      const packageId = values[0];
      const businessId = values[1];
      const pkg = state.packages.find(
        (p) => p.id === packageId && p.businessId === businessId,
      );
      return pkg
        ? [
            {
              id: pkg.id,
              businessId: pkg.businessId,
              status: pkg.status,
              version: pkg.version,
              latestValidationRunId: pkg.latestValidationRunId ?? null,
            },
          ]
        : [];
    }),
  };

  const prismaMock = {
    ...tx,
    $transaction: vi.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  return { state, prismaMock, cuid };
});

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));

import {
  getMigrationValidationRun,
  validateMigrationPackage,
} from '@/lib/services/migration/validate';
import { applyMaterialMutationDemotion } from '@/lib/services/migration/preapproval';

const ownerA = {
  userId: 'owner-a',
  userName: 'Owner A',
  userRole: 'OWNER',
  businessId: 'biz-a',
};
const managerA = { ...ownerA, userId: 'mgr-a', userName: 'Mgr A', userRole: 'MANAGER' };
const cashierA = { ...ownerA, userId: 'cash-a', userName: 'Cash A', userRole: 'CASHIER' };
const ownerB = {
  userId: 'owner-b',
  userName: 'Owner B',
  userRole: 'OWNER',
  businessId: 'biz-b',
};

function sha(text: string) {
  return createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex');
}

function seedPackage(opts: {
  businessId: string;
  packageId: string;
  status?: string;
  version?: number;
  withFiles?: boolean;
  withMapping?: boolean;
  storage?: ReturnType<typeof createMemoryMigrationObjectStorage>;
  mutateCsv?: Partial<Record<'SUPPLIERS' | 'PRODUCTS' | 'OPENING_STOCK', string>>;
}) {
  const storage = opts.storage ?? createMemoryMigrationObjectStorage();
  const csv = {
    SUPPLIERS: 'sourceSupplierKey,supplierName\ns1,Acme\n',
    PRODUCTS:
      'sourceProductKey,productName,costPrice,sellingPrice,active,barcode,defaultSupplierSourceKey\n' +
      'p1,Widget,1.50,2.00,true,bc1,s1\n',
    OPENING_STOCK:
      'sourceProductKey,sourceBranchKey,quantity,unitCost,asOfDate\n' +
      'p1,hq,10,1.50,2026-01-15\n',
    ...opts.mutateCsv,
  };
  state.packages.push({
    id: opts.packageId,
    businessId: opts.businessId,
    status: opts.status ?? 'DRAFT',
    version: opts.version ?? 1,
    contractVersion: '1',
    sourceSystemKey: 'synthetic',
    sourceBusinessKey: 'demo',
    reportingCurrency: 'GHS',
    packageAsOfDate: '2026-01-15',
    latestValidationRunId: null,
    createdByUserId: 'owner-a',
  });
  if (opts.withMapping !== false) {
    state.mappings.push({
      id: `map_${opts.packageId}`,
      businessId: opts.businessId,
      packageId: opts.packageId,
      sourceBranchKey: 'hq',
      targetStoreId: `store-${opts.businessId}`,
    });
  }
  if (opts.withFiles !== false) {
    for (const entityType of ['SUPPLIERS', 'PRODUCTS', 'OPENING_STOCK'] as const) {
      const body = Buffer.from(csv[entityType], 'utf8');
      const pathname = `mig/${opts.businessId}/${opts.packageId}/upl/${entityType}.csv`;
      storage.objects.set(pathname, {
        body,
        contentType: 'text/csv',
        url: `https://memory.private.blob.test/${pathname}`,
      });
      state.files.push({
        id: `file_${opts.packageId}_${entityType}`,
        businessId: opts.businessId,
        packageId: opts.packageId,
        entityType,
        storageStatus: 'FINALISED',
        storageKey: pathname,
        uploadChecksum: sha(csv[entityType]),
        byteLength: body.length,
        validationChecksum: null,
        validatedAt: null,
        rowCount: null,
      });
    }
  }
  return storage;
}

describe('migration slice 2B validate service', () => {
  beforeEach(() => {
    state.packages = [];
    state.files = [];
    state.mappings = [];
    state.runs = [];
    state.audits = [];
    state.products = [];
    state.suppliers = [];
    state.nextId = 1;
  });

  it('Owner validates a complete synthetic package to VALIDATED', async () => {
    const storage = seedPackage({ businessId: 'biz-a', packageId: 'pkg-a' });
    const productsBefore = state.products.length;
    const suppliersBefore = state.suppliers.length;
    const result = await validateMigrationPackage(
      ownerA,
      { packageId: 'pkg-a', expectedVersion: 1, businessId: 'biz-b-ignored' },
      { db: prismaMock as never, storage },
    );
    expect(result.packageStatus).toBe('VALIDATED');
    expect(result.runStatus).toBe('SUCCESS');
    expect(result.packageVersion).toBe(2);
    expect(result.exceptionsTruncated).toBe(0);
    expect(state.products.length).toBe(productsBefore);
    expect(state.suppliers.length).toBe(suppliersBefore);
    expect(state.audits.some((a) => a.action === 'MIGRATION_VALIDATION_SUCCEEDED')).toBe(true);
    // Memory storage must not delete on success
    expect(storage.objects.size).toBe(3);
  });

  it('Manager can validate; Cashier denied; unauth denied', async () => {
    const storage = seedPackage({ businessId: 'biz-a', packageId: 'pkg-a' });
    const ok = await validateMigrationPackage(
      managerA,
      { packageId: 'pkg-a', expectedVersion: 1 },
      { db: prismaMock as never, storage },
    );
    expect(ok.packageStatus).toBe('VALIDATED');

    await expect(
      validateMigrationPackage(
        cashierA,
        { packageId: 'pkg-a', expectedVersion: 2 },
        { db: prismaMock as never, storage },
      ),
    ).rejects.toMatchObject({ code: 'ROLE_DENIED' });

    await expect(
      validateMigrationPackage(
        { userId: '', userRole: '', businessId: '' },
        { packageId: 'pkg-a', expectedVersion: 2 },
        { db: prismaMock as never, storage },
      ),
    ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  });

  it('Owner A cannot validate Business B package (NOT_FOUND equivalent)', async () => {
    const storage = seedPackage({ businessId: 'biz-b', packageId: 'pkg-b' });
    let foreignErr: MigrationServiceError | null = null;
    let missingErr: MigrationServiceError | null = null;
    try {
      await validateMigrationPackage(
        ownerA,
        { packageId: 'pkg-b', expectedVersion: 1 },
        { db: prismaMock as never, storage },
      );
    } catch (e) {
      foreignErr = e as MigrationServiceError;
    }
    try {
      await validateMigrationPackage(
        ownerA,
        { packageId: 'does-not-exist', expectedVersion: 1 },
        { db: prismaMock as never, storage },
      );
    } catch (e) {
      missingErr = e as MigrationServiceError;
    }
    expect(foreignErr?.code).toBe('NOT_FOUND');
    expect(missingErr?.code).toBe('NOT_FOUND');
    expect(foreignErr?.httpStatus).toBe(404);
    expect(missingErr?.httpStatus).toBe(404);
    expect(foreignErr?.message).toBe(missingErr?.message);
    expect(foreignErr?.message).toBe(MIGRATION_PUBLIC_ERROR_MESSAGES.NOT_FOUND);
    expect(state.packages.find((p) => p.id === 'pkg-b')?.status).toBe('DRAFT');
    expect(state.runs.filter((r) => r.businessId === 'biz-b')).toHaveLength(0);
  });

  it('invalid file yields VALIDATION_FAILED and retains Blob', async () => {
    const storage = seedPackage({
      businessId: 'biz-a',
      packageId: 'pkg-bad',
      mutateCsv: {
        PRODUCTS:
          'sourceProductKey,productName,costPrice,sellingPrice,active\n' +
          'p1,Bad,-5.00,2.00,true\n',
      },
    });
    const before = storage.objects.size;
    const result = await validateMigrationPackage(
      ownerA,
      { packageId: 'pkg-bad', expectedVersion: 1 },
      { db: prismaMock as never, storage },
    );
    expect(result.packageStatus).toBe('VALIDATION_FAILED');
    expect(result.runStatus).toBe('FAILED');
    expect(result.errorCount).toBeGreaterThan(0);
    expect(storage.objects.size).toBe(before);
    expect(JSON.stringify(result).includes('memory.private.blob')).toBe(false);
  });

  it('rejects stale expectedVersion', async () => {
    const storage = seedPackage({ businessId: 'biz-a', packageId: 'pkg-a', version: 3 });
    await expect(
      validateMigrationPackage(
        ownerA,
        { packageId: 'pkg-a', expectedVersion: 1 },
        { db: prismaMock as never, storage },
      ),
    ).rejects.toMatchObject({ code: 'STALE_VERSION' });
  });

  it('idempotent replay returns existing SUCCESS run', async () => {
    const storage = seedPackage({ businessId: 'biz-a', packageId: 'pkg-a' });
    const first = await validateMigrationPackage(
      ownerA,
      { packageId: 'pkg-a', expectedVersion: 1 },
      { db: prismaMock as never, storage },
    );
    const second = await validateMigrationPackage(
      ownerA,
      { packageId: 'pkg-a', expectedVersion: first.packageVersion },
      { db: prismaMock as never, storage },
    );
    expect(second.replayed).toBe(true);
    expect(second.validationRunId).toBe(first.validationRunId);
    expect(state.runs.filter((r) => r.status === 'SUCCESS')).toHaveLength(1);
  });

  it('checksum mismatch never VALIDATED', async () => {
    const storage = seedPackage({ businessId: 'biz-a', packageId: 'pkg-a' });
    const file = state.files.find((f) => f.entityType === 'PRODUCTS')!;
    // Corrupt recorded checksum while leaving object bytes unchanged.
    file.uploadChecksum = 'ab'.repeat(32);
    const result = await validateMigrationPackage(
      ownerA,
      { packageId: 'pkg-a', expectedVersion: 1 },
      { db: prismaMock as never, storage },
    );
    expect(result.packageStatus).toBe('VALIDATION_FAILED');
    expect(result.exceptions.some((i) => i.code === 'CHECKSUM_MISMATCH')).toBe(true);
  });

  it('file replacement demotion supersedes prior validation', async () => {
    const storage = seedPackage({ businessId: 'biz-a', packageId: 'pkg-a' });
    const first = await validateMigrationPackage(
      ownerA,
      { packageId: 'pkg-a', expectedVersion: 1 },
      { db: prismaMock as never, storage },
    );
    expect(first.packageStatus).toBe('VALIDATED');
    const pkg = state.packages.find((p) => p.id === 'pkg-a')!;
    await prismaMock.$transaction(async (tx: typeof prismaMock) => {
      const locked = {
        id: pkg.id as string,
        businessId: 'biz-a',
        status: pkg.status as string,
        version: pkg.version as number,
        latestValidationRunId: pkg.latestValidationRunId as string | null,
      };
      await applyMaterialMutationDemotion(tx as never, locked);
    });
    const after = state.packages.find((p) => p.id === 'pkg-a')!;
    expect(after.status).toBe('DRAFT');
    expect(after.latestValidationRunId).toBeNull();
    const run = state.runs.find((r) => r.id === first.validationRunId)!;
    expect(run.supersededAt).toBeTruthy();
  });

  it('getMigrationValidationRun is tenant scoped', async () => {
    const storage = seedPackage({ businessId: 'biz-b', packageId: 'pkg-b' });
    const created = await validateMigrationPackage(
      ownerB,
      { packageId: 'pkg-b', expectedVersion: 1 },
      { db: prismaMock as never, storage },
    );
    await expect(
      getMigrationValidationRun(
        ownerA,
        { packageId: 'pkg-b', runId: created.validationRunId },
        prismaMock as never,
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('missing Blob fails safely without deletion', async () => {
    const storage = seedPackage({ businessId: 'biz-a', packageId: 'pkg-a' });
    storage.objects.clear();
    const result = await validateMigrationPackage(
      ownerA,
      { packageId: 'pkg-a', expectedVersion: 1 },
      { db: prismaMock as never, storage },
    );
    expect(result.packageStatus).toBe('VALIDATION_FAILED');
    expect(result.exceptions.some((i) => i.code === 'STORAGE_OBJECT_MISSING')).toBe(true);
    expect(storage.objects.size).toBe(0);
  });
});
