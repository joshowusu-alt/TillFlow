/**
 * Referenced-object cleanup regression — Slice 2A correction.
 *
 * Proves: never delete a Blob still referenced by a successful MigrationFile;
 * cleanup only for prepared-upload identity + latest unreferenced check;
 * fail closed on uncertain reference state; arbitrary pathname resistance.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMigrationPackage } from '@/lib/services/migration/package-create';
import {
  prepareMigrationClientUpload,
  finaliseMigrationUploadedObject,
  uploadMigrationFile,
} from '@/lib/services/migration/file-upload';
import {
  deferUnfinalisedMigrationObjectCleanup,
  safeDeleteUnreferencedMigrationObject,
  assertPreparedUploadTokenMatchesPathname,
} from '@/lib/services/migration/cleanup';
import { createMemoryMigrationObjectStorage } from '@/lib/services/migration/storage';
import {
  MigrationServiceError,
  toPublicMigrationError,
} from '@/lib/services/migration/errors';
import { MIGRATION_PUBLIC_ERROR_MESSAGES } from '@/lib/services/migration/errors';

type Row = Record<string, unknown>;

const { state, prismaMock } = vi.hoisted(() => {
  const state = {
    packages: [] as Row[],
    files: [] as Row[],
    mappings: [] as Row[],
    stores: [] as Row[],
    runs: [] as Row[],
    audits: [] as Row[],
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
      count: vi.fn(async ({ where }: { where: Row }) => {
        return state.files.filter((f) => {
          if (where.businessId && f.businessId !== where.businessId) return false;
          if (where.storageKey && f.storageKey !== where.storageKey) return false;
          return true;
        }).length;
      }),
    },
    migrationBranchMapping: {
      findFirst: vi.fn(async () => null),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    migrationValidationRun: {
      updateMany: vi.fn(async () => ({ count: 0 })),
    },
    store: { findFirst: vi.fn(async () => null) },
    auditLog: {
      create: vi.fn(async ({ data }: { data: Row }) => {
        const row = { id: cuid(), ...data, createdAt: new Date() };
        state.audits.push(row);
        return row;
      }),
    },
    $queryRaw: vi.fn(async () => []),
  };

  tx.$queryRaw = vi.fn(async (_strings: TemplateStringsArray, ...values: unknown[]) => {
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
    migrationPackage: { ...tx.migrationPackage },
    migrationFile: { ...tx.migrationFile },
    $transaction: vi.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)),
  };

  return { state, prismaMock };
});

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));

const owner = {
  userId: 'user-owner',
  userName: 'Owner',
  userRole: 'OWNER',
  businessId: 'biz-a',
};

function baseCreate(overrides: Record<string, unknown> = {}) {
  return {
    sourceSystemKey: 'legacy',
    sourceBusinessKey: 'src',
    reportingCurrency: 'GHS',
    packageAsOfDate: '2026-08-01',
    clientPackageKey: `ck-${state.nextId}`,
    ...overrides,
  };
}

async function seedFinalisedFile(
  storage: ReturnType<typeof createMemoryMigrationObjectStorage>,
  clientPackageKey: string,
  entityType: 'PRODUCTS' | 'SUPPLIERS' | 'OPENING_STOCK' = 'PRODUCTS',
) {
  const pkg = await createMigrationPackage(owner, baseCreate({ clientPackageKey }));
  const bytes = Buffer.from('sku,name\n1,Tea\n');
  const uploaded = await uploadMigrationFile(
    owner,
    {
      packageId: pkg.id,
      entityType,
      bytes,
      originalFilename: `${entityType.toLowerCase()}.csv`,
      contentType: 'text/csv',
      expectedVersion: 1,
    },
    { storage },
  );
  const referencedKey = uploaded.storageKey;
  expect(storage.objects.has(referencedKey)).toBe(true);
  expect(state.files.find((f) => f.id === uploaded.fileId)?.storageKey).toBe(referencedKey);
  return { pkg, uploaded, referencedKey, bytes };
}

async function prepareAndPut(
  storage: ReturnType<typeof createMemoryMigrationObjectStorage>,
  packageId: string,
  entityType: string,
  expectedVersion: number,
  body: Buffer,
  opts: {
    originalFilename?: string | null;
    contentType?: string | null;
    replace?: boolean;
  } = {},
) {
  const prepared = await prepareMigrationClientUpload(
    owner,
    {
      packageId,
      entityType,
      expectedVersion,
      replace: opts.replace,
      originalFilename: opts.originalFilename ?? 'next.csv',
      contentType: opts.contentType ?? 'text/csv',
    },
    { storage },
  );
  await storage.put({
    pathname: prepared.pathname,
    body,
    contentType: opts.contentType ?? 'text/csv',
  });
  return prepared;
}

describe('referenced-object cleanup preservation', () => {
  let storage: ReturnType<typeof createMemoryMigrationObjectStorage>;

  beforeEach(() => {
    state.packages = [];
    state.files = [];
    state.mappings = [];
    state.stores = [];
    state.runs = [];
    state.audits = [];
    state.nextId = 1;
    storage = createMemoryMigrationObjectStorage();
    prismaMock.$transaction.mockImplementation(
      async (fn: (client: typeof prismaMock) => Promise<unknown>) => fn(prismaMock as never),
    );
    prismaMock.auditLog.create.mockImplementation(async ({ data }: { data: Row }) => {
      const row = { id: `id_${state.nextId++}`, ...data, createdAt: new Date() };
      state.audits.push(row);
      return row;
    });
    prismaMock.migrationFile.count.mockImplementation(async ({ where }: { where: Row }) => {
      return state.files.filter((f) => {
        if (where.businessId && f.businessId !== where.businessId) return false;
        if (where.storageKey && f.storageKey !== where.storageKey) return false;
        return true;
      }).length;
    });
  });

  const failureCases: Array<{
    name: string;
    mutate: (ctx: {
      prepared: Awaited<ReturnType<typeof prepareAndPut>>;
      pkgId: string;
      version: number;
    }) => Promise<void> | void;
    expectedCode?: string;
  }> = [
    {
      name: 'invalid filename',
      mutate: async ({ prepared, pkgId, version }) => {
        await expect(
          finaliseMigrationUploadedObject(
            owner,
            {
              packageId: pkgId,
              entityType: 'PRODUCTS',
              pathname: prepared.pathname,
              clientToken: prepared.clientToken,
              expectedVersion: version,
              replace: true,
              originalFilename: 'evil.exe',
              contentType: 'text/csv',
            },
            { storage },
          ),
        ).rejects.toMatchObject({ code: 'FILE_POLICY' });
      },
    },
    {
      name: 'archive filename',
      mutate: async ({ prepared, pkgId, version }) => {
        await expect(
          finaliseMigrationUploadedObject(
            owner,
            {
              packageId: pkgId,
              entityType: 'PRODUCTS',
              pathname: prepared.pathname,
              clientToken: prepared.clientToken,
              expectedVersion: version,
              replace: true,
              originalFilename: 'data.zip',
              contentType: 'text/csv',
            },
            { storage },
          ),
        ).rejects.toMatchObject({ code: 'FILE_POLICY' });
      },
    },
    {
      name: 'invalid extension',
      mutate: async ({ prepared, pkgId, version }) => {
        await expect(
          finaliseMigrationUploadedObject(
            owner,
            {
              packageId: pkgId,
              entityType: 'PRODUCTS',
              pathname: prepared.pathname,
              clientToken: prepared.clientToken,
              expectedVersion: version,
              replace: true,
              originalFilename: 'data.txt.gz',
              contentType: 'text/csv',
            },
            { storage },
          ),
        ).rejects.toMatchObject({ code: 'FILE_POLICY' });
      },
    },
    {
      name: 'MIME mismatch / archive MIME',
      mutate: async ({ prepared, pkgId, version }) => {
        await expect(
          finaliseMigrationUploadedObject(
            owner,
            {
              packageId: pkgId,
              entityType: 'PRODUCTS',
              pathname: prepared.pathname,
              clientToken: prepared.clientToken,
              expectedVersion: version,
              replace: true,
              originalFilename: 'products.csv',
              contentType: 'application/zip',
            },
            { storage },
          ),
        ).rejects.toMatchObject({ code: 'FILE_POLICY' });
      },
    },
    {
      name: 'missing expected version',
      mutate: async ({ prepared, pkgId }) => {
        await expect(
          finaliseMigrationUploadedObject(
            owner,
            {
              packageId: pkgId,
              entityType: 'PRODUCTS',
              pathname: prepared.pathname,
              clientToken: prepared.clientToken,
              expectedVersion: undefined as unknown as number,
              replace: true,
              originalFilename: 'products.csv',
              contentType: 'text/csv',
            },
            { storage },
          ),
        ).rejects.toMatchObject({ code: 'STALE_VERSION' });
      },
    },
    {
      name: 'stale expected version',
      mutate: async ({ prepared, pkgId }) => {
        await expect(
          finaliseMigrationUploadedObject(
            owner,
            {
              packageId: pkgId,
              entityType: 'PRODUCTS',
              pathname: prepared.pathname,
              clientToken: prepared.clientToken,
              expectedVersion: 1,
              replace: true,
              originalFilename: 'products.csv',
              contentType: 'text/csv',
            },
            { storage },
          ),
        ).rejects.toMatchObject({ code: 'STALE_VERSION' });
      },
    },
  ];

  for (const tc of failureCases) {
    it(`preserves referenced Blob after ${tc.name}`, async () => {
      const { pkg, referencedKey, uploaded } = await seedFinalisedFile(
        storage,
        `pres-${tc.name.replace(/\W+/g, '-')}`,
      );
      const version = (state.packages.find((p) => p.id === pkg.id)!.version as number) ?? 2;
      const prepared = await prepareAndPut(
        storage,
        pkg.id,
        'PRODUCTS',
        version,
        Buffer.from('sku,name\n2,Coffee\n'),
        { replace: true },
      );
      expect(storage.objects.has(prepared.pathname)).toBe(true);

      await tc.mutate({ prepared, pkgId: pkg.id, version });

      expect(storage.objects.has(referencedKey)).toBe(true);
      expect(state.files.find((f) => f.id === uploaded.fileId)?.storageKey).toBe(referencedKey);
      const { stream } = await storage.getStream(referencedKey);
      const chunks: Uint8Array[] = [];
      const reader = stream.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }
      expect(Buffer.concat(chunks).toString()).toContain('Tea');
    });
  }

  it('preserves referenced Blob after Blob metadata / size mismatch', async () => {
    const { pkg, referencedKey, uploaded } = await seedFinalisedFile(storage, 'meta-mismatch');
    const version = state.packages.find((p) => p.id === pkg.id)!.version as number;
    const prepared = await prepareAndPut(
      storage,
      pkg.id,
      'PRODUCTS',
      version,
      Buffer.from('sku,name\n2,Coffee\n'),
      { replace: true },
    );
    const origHead = storage.head.bind(storage);
    storage.head = async (pathnameOrUrl: string) => {
      const meta = await origHead(pathnameOrUrl);
      if (pathnameOrUrl === prepared.pathname || meta.pathname === prepared.pathname) {
        return { ...meta, size: meta.size + 99 };
      }
      return meta;
    };

    await expect(
      finaliseMigrationUploadedObject(
        owner,
        {
          packageId: pkg.id,
          entityType: 'PRODUCTS',
          pathname: prepared.pathname,
          clientToken: prepared.clientToken,
          expectedVersion: version,
          replace: true,
          originalFilename: 'products.csv',
          contentType: 'text/csv',
        },
        { storage },
      ),
    ).rejects.toMatchObject({ code: 'STORAGE_FAILURE' });

    expect(storage.objects.has(referencedKey)).toBe(true);
    expect(state.files.find((f) => f.id === uploaded.fileId)?.storageKey).toBe(referencedKey);
  });

  it('preserves referenced Blob after audit-write failure', async () => {
    const { pkg, referencedKey, uploaded } = await seedFinalisedFile(storage, 'audit-fail');
    const version = state.packages.find((p) => p.id === pkg.id)!.version as number;
    const prepared = await prepareAndPut(
      storage,
      pkg.id,
      'PRODUCTS',
      version,
      Buffer.from('sku,name\n2,Coffee\n'),
      { replace: true },
    );
    // Fail-closed audit aborts the transaction — mock rolls back by not applying writes.
    prismaMock.$transaction.mockImplementationOnce(async () => {
      throw new Error('audit unavailable');
    });

    await expect(
      finaliseMigrationUploadedObject(
        owner,
        {
          packageId: pkg.id,
          entityType: 'PRODUCTS',
          pathname: prepared.pathname,
          clientToken: prepared.clientToken,
          expectedVersion: version,
          replace: true,
          originalFilename: 'products.csv',
          contentType: 'text/csv',
        },
        { storage },
      ),
    ).rejects.toThrow(/audit unavailable/);

    expect(storage.objects.has(referencedKey)).toBe(true);
    expect(state.files.find((f) => f.id === uploaded.fileId)?.storageKey).toBe(referencedKey);
  });

  it('preserves referenced Blob after database finalisation failure', async () => {
    const { pkg, referencedKey, uploaded } = await seedFinalisedFile(storage, 'db-fail');
    const version = state.packages.find((p) => p.id === pkg.id)!.version as number;
    const prepared = await prepareAndPut(
      storage,
      pkg.id,
      'PRODUCTS',
      version,
      Buffer.from('sku,name\n2,Coffee\n'),
      { replace: true },
    );
    prismaMock.$transaction.mockImplementationOnce(async () => {
      throw new Error('db finalise down');
    });

    await expect(
      finaliseMigrationUploadedObject(
        owner,
        {
          packageId: pkg.id,
          entityType: 'PRODUCTS',
          pathname: prepared.pathname,
          clientToken: prepared.clientToken,
          expectedVersion: version,
          replace: true,
          originalFilename: 'products.csv',
          contentType: 'text/csv',
        },
        { storage },
      ),
    ).rejects.toThrow(/db finalise down/);

    expect(storage.objects.has(referencedKey)).toBe(true);
    expect(state.files.find((f) => f.id === uploaded.fileId)?.storageKey).toBe(referencedKey);
    // Option B: prepared object also retained (no sync delete).
    expect(storage.objects.has(prepared.pathname)).toBe(true);
  });

  it('preserves referenced Blob after unknown exception after Blob inspection', async () => {
    const { pkg, referencedKey, uploaded } = await seedFinalisedFile(storage, 'unknown-ex');
    const version = state.packages.find((p) => p.id === pkg.id)!.version as number;
    const prepared = await prepareAndPut(
      storage,
      pkg.id,
      'PRODUCTS',
      version,
      Buffer.from('sku,name\n2,Coffee\n'),
      { replace: true },
    );
    const origGet = storage.getStream.bind(storage);
    storage.getStream = async (pathnameOrUrl: string) => {
      if (pathnameOrUrl === prepared.pathname) {
        throw new Error('unexpected stream boom');
      }
      return origGet(pathnameOrUrl);
    };

    await expect(
      finaliseMigrationUploadedObject(
        owner,
        {
          packageId: pkg.id,
          entityType: 'PRODUCTS',
          pathname: prepared.pathname,
          clientToken: prepared.clientToken,
          expectedVersion: version,
          replace: true,
          originalFilename: 'products.csv',
          contentType: 'text/csv',
        },
        { storage },
      ),
    ).rejects.toThrow(/unexpected stream boom/);

    expect(storage.objects.has(referencedKey)).toBe(true);
    expect(state.files.find((f) => f.id === uploaded.fileId)?.storageKey).toBe(referencedKey);
  });

  it('preserves referenced Blob on replay using the currently referenced pathname', async () => {
    const { pkg, referencedKey, uploaded } = await seedFinalisedFile(storage, 'replay-current');
    const version = state.packages.find((p) => p.id === pkg.id)!.version as number;
    // Craft a prepare token for the *current* key (simulates client nominating current object).
    const forgedToken = await storage.createClientUploadToken({
      pathname: referencedKey,
      maximumSizeInBytes: 25 * 1024 * 1024,
      allowedContentTypes: ['text/csv'],
      validUntilMs: Date.now() + 60_000,
    });

    await expect(
      finaliseMigrationUploadedObject(
        owner,
        {
          packageId: pkg.id,
          entityType: 'PRODUCTS',
          pathname: referencedKey,
          clientToken: forgedToken,
          expectedVersion: version,
          replace: true,
          originalFilename: 'evil.exe',
          contentType: 'text/csv',
        },
        { storage },
      ),
    ).rejects.toMatchObject({ code: 'FILE_POLICY' });

    expect(storage.objects.has(referencedKey)).toBe(true);
    expect(state.files.find((f) => f.id === uploaded.fileId)?.storageKey).toBe(referencedKey);
  });

  it('rejects raw pathname without prepared token (no cleanup authority)', async () => {
    const { pkg, referencedKey, uploaded } = await seedFinalisedFile(storage, 'no-token');
    const version = state.packages.find((p) => p.id === pkg.id)!.version as number;

    await expect(
      finaliseMigrationUploadedObject(
        owner,
        {
          packageId: pkg.id,
          entityType: 'PRODUCTS',
          pathname: referencedKey,
          clientToken: '',
          expectedVersion: version,
          originalFilename: 'evil.exe',
          contentType: 'text/csv',
        },
        { storage },
      ),
    ).rejects.toMatchObject({ code: 'CONTRACT' });

    expect(storage.objects.has(referencedKey)).toBe(true);
    expect(state.files.find((f) => f.id === uploaded.fileId)?.storageKey).toBe(referencedKey);
  });
});

describe('Option B deferred cleanup (no synchronous Blob delete)', () => {
  let storage: ReturnType<typeof createMemoryMigrationObjectStorage>;

  beforeEach(() => {
    state.packages = [];
    state.files = [];
    state.audits = [];
    state.nextId = 1;
    storage = createMemoryMigrationObjectStorage();
    prismaMock.$transaction.mockImplementation(
      async (fn: (client: typeof prismaMock) => Promise<unknown>) => fn(prismaMock as never),
    );
    prismaMock.auditLog.create.mockImplementation(async ({ data }: { data: Row }) => {
      const row = { id: `id_${state.nextId++}`, ...data, createdAt: new Date() };
      state.audits.push(row);
      return row;
    });
  });

  it('retains prepared object after stale-version failure (no delete)', async () => {
    const { pkg, referencedKey } = await seedFinalisedFile(storage, 'orphan-stale');
    const version = state.packages.find((p) => p.id === pkg.id)!.version as number;
    const prepared = await prepareAndPut(
      storage,
      pkg.id,
      'PRODUCTS',
      version,
      Buffer.from('sku,name\n9,Orphan\n'),
      { replace: true },
    );
    const deleteSpy = vi.spyOn(storage, 'delete');

    await expect(
      finaliseMigrationUploadedObject(
        owner,
        {
          packageId: pkg.id,
          entityType: 'PRODUCTS',
          pathname: prepared.pathname,
          clientToken: prepared.clientToken,
          expectedVersion: 1,
          replace: true,
          originalFilename: 'products.csv',
          contentType: 'text/csv',
        },
        { storage },
      ),
    ).rejects.toMatchObject({ code: 'STALE_VERSION' });

    expect(deleteSpy).not.toHaveBeenCalled();
    expect(storage.objects.has(prepared.pathname)).toBe(true);
    expect(storage.objects.has(referencedKey)).toBe(true);
  });

  it('retains prepared object after database failure before finalisation', async () => {
    const pkg = await createMigrationPackage(owner, baseCreate({ clientPackageKey: 'orphan-db' }));
    const prepared = await prepareAndPut(
      storage,
      pkg.id,
      'PRODUCTS',
      1,
      Buffer.from('sku,name\n1,X\n'),
    );
    const deleteSpy = vi.spyOn(storage, 'delete');
    prismaMock.$transaction.mockImplementationOnce(async () => {
      throw new Error('tx fail');
    });
    await expect(
      finaliseMigrationUploadedObject(
        owner,
        {
          packageId: pkg.id,
          entityType: 'PRODUCTS',
          pathname: prepared.pathname,
          clientToken: prepared.clientToken,
          expectedVersion: 1,
          originalFilename: 'products.csv',
          contentType: 'text/csv',
        },
        { storage },
      ),
    ).rejects.toThrow(/tx fail/);
    expect(deleteSpy).not.toHaveBeenCalled();
    expect(storage.objects.has(prepared.pathname)).toBe(true);
    expect(state.files).toHaveLength(0);
  });

  it('critical TOCTOU interleaving: zero-ref window then concurrent commit — no delete, Blob retained', async () => {
    /**
     * Exact previously unproven race shape under Option B:
     * 1) cleanup would have seen zero references
     * 2) pause before any former delete
     * 3) second actor commits MigrationFile referencing the object
     * 4) cleanup resumes without deleting
     * 5) DB reference resolves to an existing Blob
     */
    const pkg = await createMigrationPackage(owner, baseCreate({ clientPackageKey: 'toctou' }));
    const pathname = `mig/${owner.businessId}/${pkg.id}/up-toctou/PRODUCTS.csv`;
    await storage.put({
      pathname,
      body: Buffer.from('sku,name\n1,Race\n'),
      contentType: 'text/csv',
    });
    const deleteSpy = vi.spyOn(storage, 'delete');

    let resolveBarrier!: () => void;
    const barrier = new Promise<void>((resolve) => {
      resolveBarrier = resolve;
    });
    let cleanupReachedPause = false;

    const cleanupPromise = deferUnfinalisedMigrationObjectCleanup(
      {
        businessId: owner.businessId,
        packageId: pkg.id,
        entityType: 'PRODUCTS',
        preparedPathname: pathname,
      },
      pathname,
      {
        afterRetentionDecision: async () => {
          cleanupReachedPause = true;
          await barrier;
        },
      },
    );

    // Wait until cleanup has decided to retain (would have been the delete gap).
    await vi.waitFor(() => {
      expect(cleanupReachedPause).toBe(true);
    });

    // Concurrent reference creation while cleanup is paused in the former delete gap.
    state.files.push({
      id: 'winner-file',
      businessId: owner.businessId,
      packageId: pkg.id,
      entityType: 'PRODUCTS',
      storageStatus: 'FINALISED',
      storageKey: pathname,
      uploadChecksum: 'a'.repeat(64),
      byteLength: 20,
    });
    resolveBarrier();

    const outcome = await cleanupPromise;
    expect(outcome).toBe('retained_deferred');
    expect(deleteSpy).not.toHaveBeenCalled();
    expect(storage.objects.has(pathname)).toBe(true);
    expect(state.files.some((f) => f.storageKey === pathname)).toBe(true);
    const { stream } = await storage.getStream(pathname);
    const reader = stream.getReader();
    const { value } = await reader.read();
    expect(Buffer.from(value!).toString()).toContain('Race');
  });

  it('legacy safeDelete alias never deletes even when unreferenced', async () => {
    const pathname = 'mig/biz-a/pkg-1/up1/PRODUCTS.csv';
    await storage.put({
      pathname,
      body: Buffer.from('x'),
      contentType: 'text/csv',
    });
    const deleteSpy = vi.spyOn(storage, 'delete');
    const outcome = await safeDeleteUnreferencedMigrationObject(
      { db: prismaMock as never, storage },
      {
        businessId: 'biz-a',
        packageId: 'pkg-1',
        entityType: 'PRODUCTS',
        preparedPathname: pathname,
      },
      pathname,
    );
    expect(outcome).toBe('retained_deferred');
    expect(deleteSpy).not.toHaveBeenCalled();
    expect(storage.objects.has(pathname)).toBe(true);
  });

  it('retains when candidate pathname does not match prepared identity', async () => {
    await storage.put({
      pathname: 'mig/biz-a/pkg-1/up1/PRODUCTS.csv',
      body: Buffer.from('x'),
      contentType: 'text/csv',
    });
    const outcome = await deferUnfinalisedMigrationObjectCleanup(
      {
        businessId: 'biz-a',
        packageId: 'pkg-1',
        entityType: 'PRODUCTS',
        preparedPathname: 'mig/biz-a/pkg-1/up1/PRODUCTS.csv',
      },
      'mig/biz-a/pkg-1/up2/PRODUCTS.csv',
    );
    expect(outcome).toBe('retained_not_authorised');
    expect(storage.objects.has('mig/biz-a/pkg-1/up1/PRODUCTS.csv')).toBe(true);
  });

  it('conflicting finalisation retains prepared object for loser', async () => {
    const pkg = await createMigrationPackage(owner, baseCreate({ clientPackageKey: 'race-win' }));
    const prepared = await prepareAndPut(
      storage,
      pkg.id,
      'PRODUCTS',
      1,
      Buffer.from('sku,name\n1,Race\n'),
    );
    const deleteSpy = vi.spyOn(storage, 'delete');

    prismaMock.$transaction.mockImplementationOnce(async () => {
      state.files.push({
        id: 'winner-file',
        businessId: owner.businessId,
        packageId: pkg.id,
        entityType: 'PRODUCTS',
        storageStatus: 'FINALISED',
        storageKey: prepared.pathname,
        uploadChecksum: 'a'.repeat(64),
        byteLength: 10,
      });
      throw new Error('loser lost CAS');
    });

    await expect(
      finaliseMigrationUploadedObject(
        owner,
        {
          packageId: pkg.id,
          entityType: 'PRODUCTS',
          pathname: prepared.pathname,
          clientToken: prepared.clientToken,
          expectedVersion: 1,
          originalFilename: 'products.csv',
          contentType: 'text/csv',
        },
        { storage },
      ),
    ).rejects.toThrow(/loser lost CAS/);

    expect(deleteSpy).not.toHaveBeenCalled();
    expect(storage.objects.has(prepared.pathname)).toBe(true);
    expect(state.files.some((f) => f.storageKey === prepared.pathname)).toBe(true);
  });
});

describe('arbitrary deletion resistance', () => {
  let storage: ReturnType<typeof createMemoryMigrationObjectStorage>;

  beforeEach(() => {
    state.packages = [];
    state.files = [];
    state.audits = [];
    state.nextId = 1;
    storage = createMemoryMigrationObjectStorage();
    prismaMock.$transaction.mockImplementation(
      async (fn: (client: typeof prismaMock) => Promise<unknown>) => fn(prismaMock as never),
    );
  });

  it('cannot delete current file, sibling entity, other package, other business, or arbitrary paths', async () => {
    const { pkg, referencedKey } = await seedFinalisedFile(storage, 'arb-main', 'PRODUCTS');
    const sibling = await uploadMigrationFile(
      owner,
      {
        packageId: pkg.id,
        entityType: 'SUPPLIERS',
        bytes: Buffer.from('name\nAcme\n'),
        originalFilename: 'suppliers.csv',
        contentType: 'text/csv',
        expectedVersion: state.packages.find((p) => p.id === pkg.id)!.version as number,
      },
      { storage },
    );
    const pkg2 = await createMigrationPackage(owner, baseCreate({ clientPackageKey: 'arb-pkg2' }));
    const otherPkgFile = await uploadMigrationFile(
      owner,
      {
        packageId: pkg2.id,
        entityType: 'PRODUCTS',
        bytes: Buffer.from('sku,name\n9,Other\n'),
        originalFilename: 'products.csv',
        contentType: 'text/csv',
        expectedVersion: 1,
      },
      { storage },
    );

    const otherBizKey = 'mig/biz-b/pkg-x/up1/PRODUCTS.csv';
    await storage.put({
      pathname: otherBizKey,
      body: Buffer.from('stolen'),
      contentType: 'text/csv',
    });
    const outside = 'assets/public/logo.png';
    await storage.put({
      pathname: outside,
      body: Buffer.from('logo'),
      contentType: 'image/png',
    });
    const arbitraryMig = 'mig/biz-a/pkg-fake/up99/PRODUCTS.csv';
    await storage.put({
      pathname: arbitraryMig,
      body: Buffer.from('arb'),
      contentType: 'text/csv',
    });

    const version = state.packages.find((p) => p.id === pkg.id)!.version as number;

    const attempts = [
      referencedKey,
      sibling.storageKey,
      otherPkgFile.storageKey,
      otherBizKey,
      outside,
      arbitraryMig,
    ];

    for (const pathname of attempts) {
      const err = await finaliseMigrationUploadedObject(
        owner,
        {
          packageId: pkg.id,
          entityType: 'PRODUCTS',
          pathname,
          clientToken: 'not-a-real-token',
          expectedVersion: version,
          originalFilename: 'products.csv',
          contentType: 'text/csv',
        },
        { storage },
      ).catch((e) => e);
      expect(err).toBeInstanceOf(MigrationServiceError);
      const pub = toPublicMigrationError(err);
      expect(Object.values(MIGRATION_PUBLIC_ERROR_MESSAGES)).toContain(pub.body.error);
      expect(pub.body.error).not.toMatch(/biz-b|pkg-fake|logo|constraint|P20/i);
    }

    expect(storage.objects.has(referencedKey)).toBe(true);
    expect(storage.objects.has(sibling.storageKey)).toBe(true);
    expect(storage.objects.has(otherPkgFile.storageKey)).toBe(true);
    expect(storage.objects.has(otherBizKey)).toBe(true);
    expect(storage.objects.has(outside)).toBe(true);
    expect(storage.objects.has(arbitraryMig)).toBe(true);
  });

  it('token must match pathname — mismatched token fails closed', async () => {
    await expect(
      assertPreparedUploadTokenMatchesPathname(storage, {
        clientToken: 'memory-client-token:mig/a/b/c/PRODUCTS.csv:1:9999999999999',
        pathname: 'mig/x/y/z/PRODUCTS.csv',
      }),
    ).rejects.toThrow(MigrationServiceError);
  });
});

describe('successful replacement unchanged', () => {
  let storage: ReturnType<typeof createMemoryMigrationObjectStorage>;

  beforeEach(() => {
    state.packages = [];
    state.files = [];
    state.audits = [];
    state.nextId = 1;
    storage = createMemoryMigrationObjectStorage();
    prismaMock.$transaction.mockImplementation(
      async (fn: (client: typeof prismaMock) => Promise<unknown>) => fn(prismaMock as never),
    );
    prismaMock.auditLog.create.mockImplementation(async ({ data }: { data: Row }) => {
      const row = { id: `id_${state.nextId++}`, ...data, createdAt: new Date() };
      state.audits.push(row);
      return row;
    });
  });

  it('replacement advances version and points DB at new object; prior object retained by policy', async () => {
    const { pkg, referencedKey } = await seedFinalisedFile(storage, 'replace-ok');
    const version = state.packages.find((p) => p.id === pkg.id)!.version as number;
    const prepared = await prepareAndPut(
      storage,
      pkg.id,
      'PRODUCTS',
      version,
      Buffer.from('sku,name\n2,Coffee\n'),
      { replace: true },
    );
    const result = await finaliseMigrationUploadedObject(
      owner,
      {
        packageId: pkg.id,
        entityType: 'PRODUCTS',
        pathname: prepared.pathname,
        clientToken: prepared.clientToken,
        expectedVersion: version,
        replace: true,
        originalFilename: 'products.csv',
        contentType: 'text/csv',
      },
      { storage },
    );
    expect(result.replaced).toBe(true);
    expect(result.storageKey).toBe(prepared.pathname);
    expect(state.files[0]!.storageKey).toBe(prepared.pathname);
    expect(result.packageVersion).toBe(version + 1);
    // Prior object retained (retention policy — not deleted on replace).
    expect(storage.objects.has(referencedKey)).toBe(true);
    expect(storage.objects.has(prepared.pathname)).toBe(true);
  });
});
