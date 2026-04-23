'use client';

import { openDB, type IDBPDatabase } from 'idb';
import type { OfflineSale } from './storage';
import { getClientActiveBusinessId } from '@/lib/business-scope';

/**
 * The service worker writes to a separate IndexedDB ("pos-dead-letter") when
 * the server rejects a sale with a 4xx — the failure is permanent, so the
 * sale is parked here for owner review rather than retried forever.
 *
 * Record shape (written by public/sw.js):
 *   { payload: OfflineSale, statusCode: number, errorMessage: string, failedAt: ISOString }
 *
 * The object store uses autoIncrement (no explicit keyPath), so the IDB key
 * is the identifier for retry / remove.
 */

const DB_NAME = 'pos-dead-letter';
const DB_VERSION = 1;
const STORE_NAME = 'failed-sales';

export interface DeadLetterRecord {
  key: number;
  payload: OfflineSale;
  statusCode: number;
  errorMessage: string;
  failedAt: string;
}

type StoredDeadLetterValue = Omit<DeadLetterRecord, 'key'>;

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB(): Promise<IDBPDatabase> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('IndexedDB not available on server'));
  }
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { autoIncrement: true });
        }
      },
    });
  }
  return dbPromise;
}

function scopedToActiveBusiness(record: StoredDeadLetterValue): boolean {
  const activeBusinessId = getClientActiveBusinessId() ?? null;
  if (!activeBusinessId) return true;
  return record.payload?.businessId === activeBusinessId;
}

/** List dead-lettered sales for the active business, newest first. */
export async function getDeadLetterSales(): Promise<DeadLetterRecord[]> {
  const db = await getDB();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const store = tx.objectStore(STORE_NAME);
  const records: DeadLetterRecord[] = [];

  let cursor = await store.openCursor();
  while (cursor) {
    const value = cursor.value as StoredDeadLetterValue;
    if (scopedToActiveBusiness(value)) {
      records.push({ key: cursor.primaryKey as number, ...value });
    }
    cursor = await cursor.continue();
  }
  await tx.done;

  records.sort((a, b) => b.failedAt.localeCompare(a.failedAt));
  return records;
}

export async function getDeadLetterCount(): Promise<number> {
  try {
    const records = await getDeadLetterSales();
    return records.length;
  } catch {
    return 0;
  }
}

/** Remove a dead-lettered sale without retrying. */
export async function removeDeadLetterSale(key: number): Promise<void> {
  const db = await getDB();
  await db.delete(STORE_NAME, key);
}

/** Clear every dead-lettered sale scoped to the active business. */
export async function clearAllDeadLetterSales(): Promise<number> {
  const records = await getDeadLetterSales();
  const db = await getDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  for (const record of records) {
    await tx.store.delete(record.key);
  }
  await tx.done;
  return records.length;
}

export type RetryOutcome =
  | { ok: true }
  | { ok: false; statusCode: number | null; error: string };

/**
 * Attempt to resubmit a dead-lettered sale. On 2xx we drop the record; on any
 * other response we leave it in place so the owner can inspect and decide.
 */
export async function retryDeadLetterSale(record: DeadLetterRecord): Promise<RetryOutcome> {
  try {
    const response = await fetch('/api/offline/sync-sale', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(record.payload),
    });

    if (response.ok) {
      await removeDeadLetterSale(record.key);
      return { ok: true };
    }

    const errData = await response.json().catch(() => ({}));
    const error =
      (errData && typeof errData === 'object' && 'error' in errData && typeof errData.error === 'string'
        ? errData.error
        : null) ?? response.statusText ?? `HTTP ${response.status}`;
    return { ok: false, statusCode: response.status, error };
  } catch (error) {
    return {
      ok: false,
      statusCode: null,
      error: error instanceof Error ? error.message : 'Network error',
    };
  }
}
