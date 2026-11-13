import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({ prisma: {} }));

import {
  chooseExistingSupplier,
  claimSupplierName,
  clearImportSupplierClaimsForTests,
  createImportSupplierResolver,
  supplierDisplayName,
  supplierNameKey,
  type ImportSupplierDb,
  type ImportSupplierLookup,
} from './import-suppliers';

type StoredSupplier = ImportSupplierLookup & { businessId: string };

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function memoryDb() {
  const suppliers: StoredSupplier[] = [];
  const db: ImportSupplierDb = {
    supplier: {
      findMany: async ({ where }) => suppliers
        .filter((supplier) => supplier.businessId === where.businessId)
        .map((supplier) => ({ ...supplier })),
      create: async ({ data }) => {
        await delay(20);
        const row: StoredSupplier = {
          id: `s-${suppliers.length + 1}`,
          name: data.name,
          businessId: data.businessId,
          createdAt: new Date(),
        };
        suppliers.push(row);
        return { id: row.id };
      },
    },
  };
  return { db, suppliers };
}

function lockingDb() {
  const suppliers: StoredSupplier[] = [];
  const queries: string[] = [];
  let chain = Promise.resolve();
  const db: ImportSupplierDb = {
    supplier: {
      findMany: async ({ where }) => suppliers
        .filter((supplier) => supplier.businessId === where.businessId)
        .map((supplier) => ({ ...supplier })),
      create: async ({ data }) => {
        await delay(15);
        const row: StoredSupplier = {
          id: `s-${suppliers.length + 1}`,
          name: data.name,
          businessId: data.businessId,
          createdAt: new Date(),
        };
        suppliers.push(row);
        return { id: row.id };
      },
    },
    $queryRaw: async (strings, ...values) => {
      queries.push(`${strings.join('?')} ${values.join('|')}`);
      return [];
    },
    $transaction: async (fn) => {
      let release: () => void = () => {};
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const previous = chain;
      chain = previous.then(() => gate);
      await previous;
      try {
        return await fn(db);
      } finally {
        release();
      }
    },
  };
  return { db, suppliers, queries };
}

beforeEach(() => {
  clearImportSupplierClaimsForTests();
});

describe('supplier name keys', () => {
  it('matches trim, collapsed whitespace, and case, and keeps the first display spelling', () => {
    expect(supplierNameKey('  MINISTRY   PASTORS ')).toBe('ministry pastors');
    expect(supplierNameKey('ministry\tpastors')).toBe(supplierNameKey('Ministry Pastors'));
    expect(supplierDisplayName('  STEPS   TO CHRIST ENT. ')).toBe('STEPS TO CHRIST ENT.');
    expect(supplierNameKey('AB')).not.toBe(supplierNameKey('A B'));
  });

  it('keeps the oldest existing row when names already duplicate', () => {
    const chosen = chooseExistingSupplier([
      { id: 'newer', name: 'ministry pastors', createdAt: new Date('2026-11-11') },
      { id: 'older', name: '  MINISTRY   PASTORS ', createdAt: new Date('2024-01-01') },
      { id: 'blank', name: '   ', createdAt: new Date('2020-01-01') },
    ], supplierNameKey('Ministry Pastors'));
    expect(chosen?.id).toBe('older');
    const tied = chooseExistingSupplier([
      { id: 'b', name: 'Mill', createdAt: new Date('2024-01-01') },
      { id: 'a', name: ' mill ', createdAt: new Date('2024-01-01') },
    ], 'mill');
    expect(tied?.id).toBe('a');
  });
});

describe('import supplier resolver', () => {
  it('creates one supplier for many concurrent rows and reuses it', async () => {
    const { db, suppliers } = memoryDb();
    const resolver = createImportSupplierResolver('biz', [], db);
    const ids = await Promise.all(
      Array.from({ length: 40 }, () => resolver.resolve('  MINISTRY   PASTORS CHRISTIAN BOOKSHOP ')),
    );
    expect(new Set(ids)).toEqual(new Set(['s-1']));
    expect(suppliers).toHaveLength(1);
    expect(suppliers[0].name).toBe('MINISTRY PASTORS CHRISTIAN BOOKSHOP');
    expect(resolver.stats).toEqual({ matched: 0, created: 1 });
    expect(await resolver.resolve('ministry pastors christian bookshop')).toBe('s-1');
    expect(suppliers).toHaveLength(1);
    expect(resolver.stats.created).toBe(1);
  });

  it('treats case and whitespace variants as one supplier and stores the first spelling', async () => {
    const { db, suppliers } = memoryDb();
    const resolver = createImportSupplierResolver('biz', [], db);
    const ids = await Promise.all([
      resolver.resolve('  Steps   TO Christ ENT. '),
      resolver.resolve('steps to christ ent.'),
      resolver.resolve('STEPS\tTO\tCHRIST\tENT.'),
    ]);
    expect(new Set(ids)).toEqual(new Set(['s-1']));
    expect(suppliers.map((supplier) => supplier.name)).toEqual(['Steps TO Christ ENT.']);
  });

  it('reuses an existing supplier and does not rename it', async () => {
    const { db, suppliers } = memoryDb();
    suppliers.push(
      { id: 'newer', name: 'steps to christ ent.', businessId: 'biz', createdAt: new Date('2026-11-11') },
      { id: 'older', name: 'Steps To Christ Ent.', businessId: 'biz', createdAt: new Date('2024-05-01') },
      { id: 'other', name: 'Steps To Christ Ent.', businessId: 'other', createdAt: new Date('2020-01-01') },
    );
    const resolver = createImportSupplierResolver('biz', suppliers.filter((supplier) => supplier.businessId === 'biz'), db);
    const ids = await Promise.all([
      resolver.resolve('  STEPS   TO CHRIST ENT. '),
      resolver.resolve('steps to christ ent.'),
    ]);
    expect(ids).toEqual(['older', 'older']);
    expect(suppliers.map((supplier) => supplier.name)).toEqual([
      'steps to christ ent.',
      'Steps To Christ Ent.',
      'Steps To Christ Ent.',
    ]);
    expect(resolver.stats).toEqual({ matched: 1, created: 0 });
  });

  it('does not create a supplier on a later import of the same name', async () => {
    const { db, suppliers } = memoryDb();
    const first = createImportSupplierResolver('biz', [], db);
    expect(await first.resolve('Mill')).toBe('s-1');
    const second = createImportSupplierResolver('biz', suppliers.filter((supplier) => supplier.businessId === 'biz'), db);
    expect(await second.resolve('  mill  ')).toBe('s-1');
    expect(suppliers).toHaveLength(1);
    expect(second.stats).toEqual({ matched: 1, created: 0 });
  });

  it('shares one in-flight create across resolvers and keeps businesses apart', async () => {
    const { db, suppliers } = memoryDb();
    const left = createImportSupplierResolver('biz', [], db);
    const right = createImportSupplierResolver('biz', [], db);
    const other = createImportSupplierResolver('other', [], db);
    const [leftIds, rightIds, otherId] = await Promise.all([
      Promise.all(Array.from({ length: 8 }, () => left.resolve('Acme Supplies'))),
      Promise.all(Array.from({ length: 8 }, () => right.resolve('  acme   supplies '))),
      other.resolve('Acme Supplies'),
    ]);
    expect(new Set([...leftIds, ...rightIds]).size).toBe(1);
    expect(otherId).not.toBe(leftIds[0]);
    expect(suppliers.filter((supplier) => supplier.businessId === 'biz')).toHaveLength(1);
    expect(suppliers.filter((supplier) => supplier.businessId === 'other')).toHaveLength(1);
    expect(left.stats.created + right.stats.created).toBe(1);
    expect(right.stats.matched).toBe(1);
    expect(other.stats.created).toBe(1);
  });

  it('returns null for a blank supplier name', async () => {
    const { db, suppliers } = memoryDb();
    const resolver = createImportSupplierResolver('biz', [], db);
    expect(await resolver.resolve('   ')).toBeNull();
    expect(await resolver.resolve(undefined)).toBeNull();
    expect(suppliers).toHaveLength(0);
  });
});

describe('claimSupplierName lock', () => {
  it('lets overlapping creates insert one row and keep the first display name', async () => {
    const { db, suppliers, queries } = lockingDb();
    const [first, second] = await Promise.all([
      claimSupplierName(db, 'biz', 'Steps TO Christ', 'steps to christ', { useLock: true }),
      claimSupplierName(db, 'biz', 'steps to christ', 'steps to christ', { useLock: true }),
    ]);
    expect(first.created).toBe(true);
    expect(second).toEqual({ id: first.id, created: false });
    expect(suppliers).toHaveLength(1);
    expect(suppliers[0].name).toBe('Steps TO Christ');
    expect(queries.some((query) => query.includes('pg_advisory_xact_lock'))).toBe(true);
    expect(queries.some((query) => query.includes('biz\nsteps to christ'))).toBe(true);
  });

  it('re-reads an existing supplier inside the lock and does not rename it', async () => {
    const { db, suppliers } = lockingDb();
    suppliers.push({
      id: 'keep',
      name: 'MINISTRY  PASTORS',
      businessId: 'biz',
      createdAt: new Date('2024-01-01'),
    });
    const [first, second] = await Promise.all([
      claimSupplierName(db, 'biz', 'ministry pastors', 'ministry pastors', { useLock: true }),
      claimSupplierName(db, 'biz', 'Ministry Pastors', 'ministry pastors', { useLock: true }),
    ]);
    expect(first).toEqual({ id: 'keep', created: false });
    expect(second).toEqual({ id: 'keep', created: false });
    expect(suppliers.map((supplier) => supplier.name)).toEqual(['MINISTRY  PASTORS']);
  });
});
