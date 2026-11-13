/**
 * One supplier per business during a product or opening-stock import.
 *
 * Rows in a create chunk are resolved together, and a large file is several
 * chunks. Names match after trim, collapsed whitespace, and case-folding.
 * The stored name stays as first seen: an existing row is kept as written,
 * and a new row keeps the first sheet spelling (extra spaces removed).
 *
 * No unique index: production already contains duplicate suppliers, and a
 * unique index would fail that migration. Overlapping imports on Postgres
 * take a transaction advisory lock and re-read before inserting.
 *
 * This resolver never deletes a supplier or rewrites an existing id.
 * Product.preferredSupplierId, PurchaseInvoice.supplierId and
 * ReorderAction.supplierId are foreign keys and stay where they are.
 * SupplierCreditSettlement.supplierId is not a foreign key, so deleting a
 * supplier would leave those settlement rows pointing at nothing. They stay
 * on the supplier they were written against.
 */

import { prisma } from '@/lib/prisma';
import { isPostgresRuntimeEnv } from '@/lib/database-runtime';
import { normalizeSupplierName } from '@/lib/services/supplier-duplicates';

export type ImportSupplierLookup = {
  id: string;
  name: string;
  createdAt?: Date | string | null;
};

export type ImportSupplierDb = {
  supplier: {
    findMany(args: {
      where: { businessId: string };
      select?: { id: true; name: true; createdAt: true };
      orderBy?: Array<{ createdAt: 'asc' } | { id: 'asc' }>;
    }): Promise<ImportSupplierLookup[]>;
    create(args: {
      data: { businessId: string; name: string };
      select: { id: true };
    }): Promise<{ id: string }>;
  };
  $transaction?<T>(fn: (tx: ImportSupplierDb) => Promise<T>): Promise<T>;
  $queryRaw?(strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown>;
};

export type ClaimedImportSupplier = {
  id: string;
  created: boolean;
};

type ClaimSlot = {
  promise: Promise<ClaimedImportSupplier>;
  owner: object;
};

const claimSlots = new Map<string, ClaimSlot>();

/** Test isolation. Import runs clear their own slot when the claim settles. */
export function clearImportSupplierClaimsForTests() {
  claimSlots.clear();
}

export function supplierNameKey(name: string | null | undefined): string {
  return normalizeSupplierName(name ?? '');
}

/** First-seen label: trim and collapse whitespace, keep the original casing. */
export function supplierDisplayName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

function createdAtMillis(value: Date | string | null | undefined): number {
  if (!value) return 0;
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function compareSuppliers(a: ImportSupplierLookup, b: ImportSupplierLookup): number {
  const time = createdAtMillis(a.createdAt) - createdAtMillis(b.createdAt);
  if (time !== 0) return time;
  if (a.id < b.id) return -1;
  if (a.id > b.id) return 1;
  return 0;
}

/** Oldest row for this normalised name. Existing duplicates stay until cleaned up. */
export function chooseExistingSupplier(
  suppliers: readonly ImportSupplierLookup[],
  nameKey: string,
): ImportSupplierLookup | null {
  let best: ImportSupplierLookup | null = null;
  for (const supplier of suppliers) {
    if (supplierNameKey(supplier.name) !== nameKey) continue;
    if (!best || compareSuppliers(supplier, best) < 0) best = supplier;
  }
  return best;
}

async function readSuppliers(db: ImportSupplierDb, businessId: string) {
  return db.supplier.findMany({
    where: { businessId },
    select: { id: true, name: true, createdAt: true },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
}

/**
 * Insert only when this business has no supplier with the same normalised name.
 * `useLock` serialises overlapping imports on Postgres. Callers in one process
 * also share an in-flight claim so concurrent chunk rows do not all insert.
 */
export async function claimSupplierName(
  db: ImportSupplierDb,
  businessId: string,
  displayName: string,
  nameKey: string,
  options?: { useLock?: boolean },
): Promise<ClaimedImportSupplier> {
  const useLock = options?.useLock === true;

  const claimIn = async (tx: ImportSupplierDb): Promise<ClaimedImportSupplier> => {
    if (useLock && typeof tx.$queryRaw === 'function') {
      await tx.$queryRaw`
        SELECT pg_advisory_xact_lock(
          hashtext('tillflow.import-supplier'),
          hashtext(${`${businessId}\n${nameKey}`})
        )
      `;
    }
    const existing = chooseExistingSupplier(await readSuppliers(tx, businessId), nameKey);
    if (existing) return { id: existing.id, created: false };
    const created = await tx.supplier.create({
      data: { businessId, name: displayName },
      select: { id: true },
    });
    return { id: created.id, created: true };
  };

  if (useLock && typeof db.$transaction === 'function') {
    return db.$transaction((tx) => claimIn(tx));
  }
  return claimIn(db);
}

export type ImportSupplierResolver = {
  readonly stats: { matched: number; created: number };
  resolve(name: string | null | undefined): Promise<string | null>;
};

export function createImportSupplierResolver(
  businessId: string,
  existing: readonly ImportSupplierLookup[],
  db: ImportSupplierDb = prisma as unknown as ImportSupplierDb,
  options?: { useLock?: boolean },
): ImportSupplierResolver {
  const cache = new Map<string, string>();
  const grouped = new Map<string, ImportSupplierLookup>();
  for (const supplier of existing) {
    const key = supplierNameKey(supplier.name);
    if (!key) continue;
    const current = grouped.get(key);
    if (!current || compareSuppliers(supplier, current) < 0) grouped.set(key, supplier);
  }
  for (const [key, supplier] of grouped) cache.set(key, supplier.id);

  const createdHere = new Set<string>();
  const countedMatch = new Set<string>();
  const stats = { matched: 0, created: 0 };
  const countMatch = (key: string) => {
    if (countedMatch.has(key)) return;
    countedMatch.add(key);
    stats.matched++;
  };
  const useLock = options?.useLock ?? (
    isPostgresRuntimeEnv()
    && typeof db.$transaction === 'function'
    && typeof db.$queryRaw === 'function'
  );
  const owner = {};

  const resolve = (name: string | null | undefined): Promise<string | null> => {
    const display = supplierDisplayName(name ?? '');
    const key = supplierNameKey(display);
    if (!key) return Promise.resolve(null);

    const cached = cache.get(key);
    if (cached) {
      if (!createdHere.has(key)) countMatch(key);
      return Promise.resolve(cached);
    }

    const slotKey = `${businessId}\0${key}`;
    const inflight = claimSlots.get(slotKey);
    if (inflight) {
      return inflight.promise.then((outcome) => {
        cache.set(key, outcome.id);
        if (inflight.owner !== owner) countMatch(key);
        return outcome.id;
      });
    }

    const promise = claimSupplierName(db, businessId, display, key, { useLock }).then((outcome) => {
      cache.set(key, outcome.id);
      if (outcome.created) {
        createdHere.add(key);
        stats.created++;
      } else {
        countMatch(key);
      }
      return outcome;
    });
    claimSlots.set(slotKey, { promise, owner });
    void promise.finally(() => {
      if (claimSlots.get(slotKey)?.promise === promise) claimSlots.delete(slotKey);
    });
    return promise.then((outcome) => outcome.id);
  };

  return { stats, resolve };
}
