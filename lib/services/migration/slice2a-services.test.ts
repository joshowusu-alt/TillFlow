import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMigrationPackage } from '@/lib/services/migration/package-create';
import { uploadMigrationFile } from '@/lib/services/migration/file-upload';
import {
  upsertMigrationBranchMapping,
  deleteMigrationBranchMapping,
} from '@/lib/services/migration/branch-mapping';
import { openMigrationFileDownload } from '@/lib/services/migration/file-download';
import { createMemoryMigrationObjectStorage } from '@/lib/services/migration/storage';
import { MigrationServiceError } from '@/lib/services/migration/errors';
import { applyMaterialMutationDemotion } from '@/lib/services/migration/preapproval';

type Row = Record<string, unknown>;

const {
  state,
  prismaMock,
} = vi.hoisted(() => {
  const state = {
    packages: [] as Row[],
    files: [] as Row[],
    mappings: [] as Row[],
    stores: [] as Row[],
    runs: [] as Row[],
    audits: [] as Row[],
    products: [] as Row[],
    suppliers: [] as Row[],
    sales: [] as Row[],
    nextId: 1,
  };

  function cuid() {
    return `id_${state.nextId++}`;
  }

  const tx = {
    migrationPackage: {
      create: vi.fn(async ({ data }: { data: Row }) => {
        const row = {
          version: 1,
          status: 'DRAFT',
          reconciliationStatus: 'NOT_STARTED',
          latestValidationRunId: null,
          validatedAt: null,
          validatedByUserId: null,
          ...data,
          updatedAt: new Date(),
        };
        state.packages.push(row);
        return { ...row };
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Row }) => {
        const row = state.packages.find((p) => p.id === where.id);
        if (!row) throw Object.assign(new Error('not found'), { code: 'P2025' });
        Object.assign(row, data, { updatedAt: new Date() });
        return { ...row };
      }),
      findFirst: vi.fn(async ({ where }: { where: Row }) => {
        return (
          state.packages.find((p) => {
            if (where.id && p.id !== where.id) return false;
            if (where.businessId && p.businessId !== where.businessId) return false;
            if (where.clientPackageKey && p.clientPackageKey !== where.clientPackageKey)
              return false;
            return true;
          }) ?? null
        );
      }),
    },
    migrationFile: {
      findFirst: vi.fn(async ({ where }: { where: Row }) => {
        return (
          state.files.find((f) => {
            if (where.id && f.id !== where.id) return false;
            if (where.businessId && f.businessId !== where.businessId) return false;
            if (where.packageId && f.packageId !== where.packageId) return false;
            if (where.entityType && f.entityType !== where.entityType) return false;
            return true;
          }) ?? null
        );
      }),
      create: vi.fn(async ({ data }: { data: Row }) => {
        const dup = state.files.find(
          (f) => f.packageId === data.packageId && f.entityType === data.entityType,
        );
        if (dup) throw Object.assign(new Error('unique'), { code: 'P2002' });
        const row = { id: cuid(), ...data, createdAt: new Date(), updatedAt: new Date() };
        state.files.push(row);
        return { ...row };
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Row }) => {
        const row = state.files.find((f) => f.id === where.id);
        if (!row) throw Object.assign(new Error('not found'), { code: 'P2025' });
        Object.assign(row, data, { updatedAt: new Date() });
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
    migrationBranchMapping: {
      findFirst: vi.fn(async ({ where }: { where: Row }) => {
        return (
          state.mappings.find((m) => {
            if (where.id && m.id !== where.id) return false;
            if (where.businessId && m.businessId !== where.businessId) return false;
            if (where.packageId && m.packageId !== where.packageId) return false;
            return true;
          }) ?? null
        );
      }),
      create: vi.fn(async ({ data }: { data: Row }) => {
        const dupKey = state.mappings.find(
          (m) =>
            m.packageId === data.packageId && m.sourceBranchKey === data.sourceBranchKey,
        );
        const dupStore = state.mappings.find(
          (m) => m.packageId === data.packageId && m.targetStoreId === data.targetStoreId,
        );
        if (dupKey || dupStore) throw Object.assign(new Error('unique'), { code: 'P2002' });
        const row = { id: cuid(), ...data, createdAt: new Date(), updatedAt: new Date() };
        state.mappings.push(row);
        return { ...row };
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Row }) => {
        const row = state.mappings.find((m) => m.id === where.id);
        if (!row) throw Object.assign(new Error('not found'), { code: 'P2025' });
        Object.assign(row, data, { updatedAt: new Date() });
        return { ...row };
      }),
      delete: vi.fn(async ({ where }: { where: { id: string } }) => {
        const idx = state.mappings.findIndex((m) => m.id === where.id);
        if (idx < 0) throw Object.assign(new Error('not found'), { code: 'P2025' });
        const [row] = state.mappings.splice(idx, 1);
        return row;
      }),
    },
    migrationValidationRun: {
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
    store: {
      findFirst: vi.fn(async ({ where }: { where: Row }) => {
        return (
          state.stores.find(
            (s) => s.id === where.id && s.businessId === where.businessId,
          ) ?? null
        );
      }),
    },
    auditLog: {
      create: vi.fn(async ({ data }: { data: Row }) => {
        const row = { id: cuid(), ...data, createdAt: new Date() };
        state.audits.push(row);
        return row;
      }),
    },
    $queryRaw: vi.fn(async () => {
      // FOR UPDATE lock path — return matching package
      return [];
    }),
  };

  // Wire $queryRaw to use tagged-template args from lockPackageForBusiness
  tx.$queryRaw = vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
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
  });

  const prismaMock = {
    ...tx,
    migrationPackage: {
      ...tx.migrationPackage,
      findFirst: tx.migrationPackage.findFirst,
    },
    migrationFile: {
      ...tx.migrationFile,
    },
    $transaction: vi.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)),
  };

  return { state, prismaMock, cuid };
});

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));

const owner = {
  userId: 'user-owner',
  userName: 'Owner',
  userRole: 'OWNER',
  businessId: 'biz-a',
};

const manager = {
  userId: 'user-mgr',
  userName: 'Manager',
  userRole: 'MANAGER',
  businessId: 'biz-a',
};

const cashier = {
  userId: 'user-cash',
  userName: 'Cashier',
  userRole: 'CASHIER',
  businessId: 'biz-a',
};

function baseCreate(overrides: Record<string, unknown> = {}) {
  return {
    sourceSystemKey: 'legacy-pos',
    sourceBusinessKey: 'store-001',
    reportingCurrency: 'GHS',
    packageAsOfDate: '2026-08-01',
    clientPackageKey: 'key-1',
    ...overrides,
  };
}

describe('migration slice 2A services', () => {
  let storage: ReturnType<typeof createMemoryMigrationObjectStorage>;

  beforeEach(() => {
    state.packages.length = 0;
    state.files.length = 0;
    state.mappings.length = 0;
    state.stores.length = 0;
    state.runs.length = 0;
    state.audits.length = 0;
    state.products.length = 0;
    state.suppliers.length = 0;
    state.sales.length = 0;
    state.nextId = 1;
    storage = createMemoryMigrationObjectStorage();
    state.stores.push({ id: 'store-a1', businessId: 'biz-a' });
    state.stores.push({ id: 'store-b1', businessId: 'biz-b' });
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation(async (fn: (client: typeof prismaMock) => Promise<unknown>) =>
      fn(prismaMock),
    );
  });

  it('Owner and Manager can create DRAFT packages; Cashier denied', async () => {
    const a = await createMigrationPackage(owner, baseCreate());
    expect(a.status).toBe('DRAFT');
    expect(a.lineageRootId).toBe(a.id);
    expect(a.replayed).toBe(false);
    expect(state.audits.some((x) => x.action === 'MIGRATION_PACKAGE_CREATE')).toBe(true);

    const b = await createMigrationPackage(manager, baseCreate({ clientPackageKey: 'key-2' }));
    expect(b.status).toBe('DRAFT');

    await expect(
      createMigrationPackage(cashier, baseCreate({ clientPackageKey: 'key-3' })),
    ).rejects.toBeInstanceOf(MigrationServiceError);
  });

  it('ignores client-supplied businessId/status/createdByUserId', async () => {
    const created = await createMigrationPackage(owner, {
      ...baseCreate({ clientPackageKey: 'key-tenant' }),
      businessId: 'biz-evil',
      status: 'APPROVED',
      createdByUserId: 'evil-user',
    });
    expect(created.businessId).toBe('biz-a');
    expect(created.status).toBe('DRAFT');
    expect(state.packages[0]!.createdByUserId).toBe('user-owner');
  });

  it('replays identical clientPackageKey and conflicts on immutable drift', async () => {
    const first = await createMigrationPackage(owner, baseCreate());
    const replay = await createMigrationPackage(owner, baseCreate());
    expect(replay.replayed).toBe(true);
    expect(replay.id).toBe(first.id);
    expect(state.packages).toHaveLength(1);

    await expect(
      createMigrationPackage(
        owner,
        baseCreate({ sourceBusinessKey: 'other-biz' }),
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('allows different businesses to reuse the same clientPackageKey', async () => {
    await createMigrationPackage(owner, baseCreate());
    const other = await createMigrationPackage(
      { ...owner, businessId: 'biz-b', userId: 'user-b' },
      baseCreate(),
    );
    expect(other.businessId).toBe('biz-b');
    expect(state.packages).toHaveLength(2);
  });

  it('finalises private upload, exact replay, conflict, and replace', async () => {
    const pkg = await createMigrationPackage(owner, baseCreate({ clientPackageKey: 'upl' }));
    const bytes = Buffer.from('sku,name\n1,Tea\n');

    const uploaded = await uploadMigrationFile(
      owner,
      {
        packageId: pkg.id,
        entityType: 'PRODUCTS',
        bytes,
        originalFilename: 'products.csv',
        contentType: 'text/csv',
      },
      { storage },
    );
    expect(uploaded.storageStatus).toBe('FINALISED');
    expect(uploaded.replayed).toBe(false);
    expect(storage.objects.has(uploaded.storageKey)).toBe(true);
    expect(state.files).toHaveLength(1);

    const replay = await uploadMigrationFile(
      owner,
      {
        packageId: pkg.id,
        entityType: 'PRODUCTS',
        bytes,
        originalFilename: 'products.csv',
        contentType: 'text/csv',
      },
      { storage },
    );
    expect(replay.replayed).toBe(true);
    expect(replay.fileId).toBe(uploaded.fileId);
    expect(state.files).toHaveLength(1);

    await expect(
      uploadMigrationFile(
        owner,
        {
          packageId: pkg.id,
          entityType: 'PRODUCTS',
          bytes: Buffer.from('sku,name\n2,Coffee\n'),
          originalFilename: 'products.csv',
          contentType: 'text/csv',
        },
        { storage },
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' });

    const replaced = await uploadMigrationFile(
      owner,
      {
        packageId: pkg.id,
        entityType: 'PRODUCTS',
        bytes: Buffer.from('sku,name\n2,Coffee\n'),
        originalFilename: 'products-v2.csv',
        contentType: 'text/csv',
        replace: true,
        expectedVersion: uploaded.packageVersion,
      },
      { storage },
    );
    expect(replaced.replaced).toBe(true);
    expect(replaced.storageKey).not.toBe(uploaded.storageKey);
    expect(state.files).toHaveLength(1);
    expect(state.files[0]!.storageKey).toBe(replaced.storageKey);
  });

  it('cleans up orphan object when database finalisation fails', async () => {
    const pkg = await createMigrationPackage(owner, baseCreate({ clientPackageKey: 'orphan' }));
    prismaMock.$transaction.mockImplementationOnce(async () => {
      throw new Error('db down');
    });
    await expect(
      uploadMigrationFile(
        owner,
        {
          packageId: pkg.id,
          entityType: 'SUPPLIERS',
          bytes: Buffer.from('name\nAcme\n'),
          originalFilename: 'suppliers.csv',
          contentType: 'text/csv',
        },
        { storage },
      ),
    ).rejects.toThrow(/db down/);
    expect(storage.objects.size).toBe(0);
    expect(state.files).toHaveLength(0);
  });

  it('rejects cross-business package upload and download', async () => {
    const pkg = await createMigrationPackage(owner, baseCreate({ clientPackageKey: 'xbiz' }));
    await expect(
      uploadMigrationFile(
        { ...owner, businessId: 'biz-b' },
        {
          packageId: pkg.id,
          entityType: 'OPENING_STOCK',
          bytes: Buffer.from('a,b\n1,2\n'),
          originalFilename: 'stock.csv',
          contentType: 'text/csv',
        },
        { storage },
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });

    const uploaded = await uploadMigrationFile(
      owner,
      {
        packageId: pkg.id,
        entityType: 'OPENING_STOCK',
        bytes: Buffer.from('a,b\n1,2\n'),
        originalFilename: 'stock.csv',
        contentType: 'text/csv',
      },
      { storage },
    );

    await expect(
      openMigrationFileDownload(
        { ...owner, businessId: 'biz-b' },
        { fileId: uploaded.fileId },
        { storage },
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('streams authorised private download', async () => {
    const pkg = await createMigrationPackage(owner, baseCreate({ clientPackageKey: 'dl' }));
    const bytes = Buffer.from('id,qty\n1,10\n');
    const uploaded = await uploadMigrationFile(
      manager,
      {
        packageId: pkg.id,
        entityType: 'OPENING_STOCK',
        bytes,
        originalFilename: 'opening.csv',
        contentType: 'text/csv',
      },
      { storage },
    );
    const dl = await openMigrationFileDownload(
      manager,
      { fileId: uploaded.fileId },
      { storage },
    );
    const got = Buffer.from(await new Response(dl.stream).arrayBuffer());
    expect(got.equals(bytes)).toBe(true);
    expect(dl.downloadFilename).toBe('opening.csv');
  });

  it('creates, updates, deletes branch mappings with same-business store', async () => {
    const pkg = await createMigrationPackage(owner, baseCreate({ clientPackageKey: 'map' }));

    await expect(
      upsertMigrationBranchMapping(owner, {
        packageId: pkg.id,
        sourceBranchKey: 'Main',
        targetStoreId: 'store-b1',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });

    const created = await upsertMigrationBranchMapping(owner, {
      packageId: pkg.id,
      sourceBranchKey: 'Main',
      targetStoreId: 'store-a1',
    });
    expect(created.sourceBranchKey).toBe('main');

    const updated = await upsertMigrationBranchMapping(owner, {
      packageId: pkg.id,
      mappingId: created.mappingId,
      sourceBranchKey: 'Main-2',
      targetStoreId: 'store-a1',
      expectedVersion: created.packageVersion,
    });
    expect(updated.sourceBranchKey).toBe('main-2');

    const deleted = await deleteMigrationBranchMapping(owner, {
      packageId: pkg.id,
      mappingId: created.mappingId,
      expectedVersion: updated.packageVersion,
    });
    expect(deleted.packageStatus).toBe('DRAFT');
    expect(state.mappings).toHaveLength(0);
  });

  it('demotes VALIDATED package and retains historical validation runs', async () => {
    const pkg = await createMigrationPackage(owner, baseCreate({ clientPackageKey: 'demote' }));
    const runId = 'run-1';
    state.runs.push({
      id: runId,
      businessId: 'biz-a',
      packageId: pkg.id,
      supersededAt: null,
    });
    const locked = state.packages[0]!;
    locked.status = 'VALIDATED';
    locked.latestValidationRunId = runId;
    locked.version = 3;
    state.files.push({
      id: 'file-1',
      businessId: 'biz-a',
      packageId: pkg.id,
      entityType: 'PRODUCTS',
      validationChecksum: 'a'.repeat(64),
      validatedAt: new Date(),
    });

    const result = await applyMaterialMutationDemotion(prismaMock as never, {
      id: pkg.id,
      businessId: 'biz-a',
      status: 'VALIDATED',
      version: 3,
      latestValidationRunId: runId,
    });
    expect(result.nextStatus).toBe('DRAFT');
    expect(result.nextVersion).toBe(4);
    expect(state.packages[0]!.latestValidationRunId).toBeNull();
    expect(state.runs[0]!.supersededAt).toBeInstanceOf(Date);
    expect(state.runs).toHaveLength(1);
    expect(state.files[0]!.validationChecksum).toBeNull();
  });

  it('rejects stale expectedVersion', async () => {
    const pkg = await createMigrationPackage(owner, baseCreate({ clientPackageKey: 'stale' }));
    await expect(
      upsertMigrationBranchMapping(owner, {
        packageId: pkg.id,
        sourceBranchKey: 'east',
        targetStoreId: 'store-a1',
        expectedVersion: 99,
      }),
    ).rejects.toMatchObject({ code: 'STALE_VERSION' });
  });

  it('does not mutate products, suppliers, sales, or approval tables', async () => {
    const pkg = await createMigrationPackage(owner, baseCreate({ clientPackageKey: 'noneffect' }));
    await uploadMigrationFile(
      owner,
      {
        packageId: pkg.id,
        entityType: 'PRODUCTS',
        bytes: Buffer.from('a\n1\n'),
        originalFilename: 'p.csv',
        contentType: 'text/csv',
      },
      { storage },
    );
    await upsertMigrationBranchMapping(owner, {
      packageId: pkg.id,
      sourceBranchKey: 'west',
      targetStoreId: 'store-a1',
    });
    expect(state.products).toHaveLength(0);
    expect(state.suppliers).toHaveLength(0);
    expect(state.sales).toHaveLength(0);
    expect(state.audits.every((a) => String(a.action).startsWith('MIGRATION_'))).toBe(true);
  });
});
