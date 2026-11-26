import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OfflineSale, OfflineSaleCaptureInput, OfflineSaleQueueStatus } from './storage';

// The persisted-row reader below is frozen from master dfce423, not imported
// from the candidate. Use structured clones so the two versions share records,
// not JavaScript object references.
const stores = vi.hoisted(() => new Map<string, Map<string, unknown>>());
vi.mock('idb', () => ({
  openDB: vi.fn(async () => {
    const table = (name: string) => {
      if (!stores.has(name)) stores.set(name, new Map());
      return stores.get(name)!;
    };
    return {
      put: async (name: string, row: { id?: string; key?: string }) => {
        table(name).set(row.id ?? row.key!, structuredClone(row));
      },
      get: async (name: string, key: string) => structuredClone(table(name).get(key)),
      getAll: async (name: string) => Array.from(table(name).values(), row => structuredClone(row)),
    };
  }),
}));

// Exact normalization logic of dfce423: optional nested fields are preserved
// because lines and payments are carried through whole, not reconstructed.
function oldRead(raw: Partial<OfflineSale> & { id?: string; synced?: boolean }): OfflineSale {
  const createdAt = raw.createdAt ?? new Date().toISOString();
  const shiftId = raw.shiftId ?? null;
  const synced = Boolean(raw.synced);
  const missingShift = !shiftId;
  let status: OfflineSaleQueueStatus = raw.status ?? (synced ? 'synced' : 'pending');
  let statusReason = raw.statusReason;
  if (!synced && missingShift && status === 'pending') {
    status = 'needs_review';
    statusReason = statusReason ?? 'missing_shift';
  }
  return {
    id: String(raw.id ?? ''),
    businessId: String(raw.businessId ?? ''),
    storeId: String(raw.storeId ?? ''),
    tillId: String(raw.tillId ?? ''),
    shiftId,
    cashierUserId: raw.cashierUserId ?? null,
    customerId: raw.customerId ?? null,
    paymentStatus: raw.paymentStatus ?? 'PAID',
    lines: Array.isArray(raw.lines) ? raw.lines : [],
    payments: Array.isArray(raw.payments) ? raw.payments : [],
    orderDiscountType: raw.orderDiscountType ?? 'NONE',
    orderDiscountValue: raw.orderDiscountValue ?? '',
    createdAt,
    localSaleTime: raw.localSaleTime ?? createdAt,
    localSequence: Number(raw.localSequence) || 0,
    idempotencyKey: raw.idempotencyKey || String(raw.id ?? ''),
    payloadHash: raw.payloadHash ?? '',
    catalogueVersion: raw.catalogueVersion ?? null,
    inventoryPolicy: raw.inventoryPolicy ?? 'enforce',
    synced,
    status,
    statusReason,
  };
}

const sample: OfflineSaleCaptureInput = {
  businessId: 'rollback-biz', storeId: 'store', tillId: 'till', shiftId: 'shift',
  cashierUserId: 'cashier', customerId: null, paymentStatus: 'PAID',
  lines: [{ productId: 'product', unitId: 'unit', qtyInUnit: 1, qtyBase: 1,
    unitPricePence: 3500, lineSubtotalPence: 3500, discountType: 'NONE', discountValue: '' }],
  payments: [{ method: 'CASH', amountPence: 3500 }],
  orderDiscountType: 'NONE', orderDiscountValue: '', createdAt: '2026-11-25T12:00:00.000Z',
};

describe('dfce423 offline queue rollback compatibility', () => {
  beforeEach(() => stores.clear());

  it('keeps the previous released storage, capture, sync, hash and worker byte-identical', () => {
    const predecessor: Record<string, string> = {
      'lib/offline/storage.ts': '7a3d1115e3872bf083f67211d67bfc46561a7236222bcc64262ae58ff112b5c3',
      'lib/offline/capture.ts': 'e4335cffd7d76927183fa0112f4667189e8beb43fb90a385416741348d751781',
      'lib/offline/payload-hash.ts': 'ba4278654d14cce41ec602e822ccc28cd672656acd119cce3a75c8a5ba083ca7',
      'lib/offline/sync.ts': 'aa26451e82f0115331dc892ebe785028f3d1f617b4c7dc6c33d2167ae9d1921a',
      'public/sw.js': '2501ceb3fc4decc256f36b2f7d26b3f71708624df57d421cf5c5b97acb90ea44',
    };
    for (const [file, hash] of Object.entries(predecessor)) {
      expect(createHash('sha256').update(readFileSync(file)).digest('hex'), file).toBe(hash);
    }
  });

  it.each(['retail', 'food'])('writes a %s sale in the candidate and reads it with the previous reader', async kind => {
    const storage = await import('./storage');
    const { hashOfflineSalePayload } = await import('./payload-hash');
    const line = kind === 'food' ? {
      ...sample.lines[0],
      plate: { customAmountPence: 3500, sizeId: null, addons: [{ addonId: 'extra', qty: 1 }], expectedPricePence: 3500 },
    } : sample.lines[0];
    const id = await storage.queueOfflineSale({ ...sample, lines: [line] });
    const raw = structuredClone(stores.get('salesQueue')!.get(id)) as OfflineSale;
    const previous = oldRead(raw);
    expect(previous).toEqual(raw);
    expect(previous.shiftId).toBe('shift');
    expect(previous.cashierUserId).toBe('cashier');
    expect(previous.payments).toEqual(sample.payments);
    expect(previous.lines).toEqual([line]);
    expect(previous.idempotencyKey).toBe(id);
    expect(previous.payloadHash).toBe(await hashOfflineSalePayload(previous));
    // An old reader's persisted normalized row is readable by the new reader.
    await (await storage.getDB()).put('salesQueue', previous);
    expect(await storage.getOfflineSale(id, sample.businessId)).toEqual(previous);
    expect(await storage.getPendingSales(sample.businessId)).toEqual([previous]);
    expect(await storage.getPendingSales('different-business')).toEqual([]);
  });

  it('retains the original pending/review distinction and missing-shift reason', async () => {
    const storage = await import('./storage');
    const raw = { ...sample, id: 'legacy-sale', shiftId: undefined, synced: false };
    const previous = oldRead(raw);
    expect(previous).toMatchObject({ shiftId: null, status: 'needs_review', statusReason: 'missing_shift' });
    await (await storage.getDB()).put('salesQueue', raw);
    expect(await storage.getReviewSales(sample.businessId)).toEqual([previous]);
    expect(await storage.getPendingSales(sample.businessId)).toEqual([]);
  });

  it('demonstrates why the historical pre-food fallback is not interchangeable with dfce423', async () => {
    const { hashOfflineSalePayload } = await import('./payload-hash');
    const food = { ...sample, lines: [{ ...sample.lines[0],
      plate: { customAmountPence: 3500, sizeId: null, addons: [{ addonId: 'extra', qty: 1 }] },
    }] };
    // The immutable 38fbfef1 fallback canonicalizer has exactly the same
    // canonical fields except plate (verified against the pinned source).
    // Its server rejects a mismatching payloadHash, so this is NOT a safe
    // substitute for validating the historical fallback.
    const historicalHash = await hashOfflineSalePayload({ ...food, lines: food.lines.map(({ plate: _plate, ...rest }) => rest) });
    expect(historicalHash).toBe(await hashOfflineSalePayload(sample));
    expect(historicalHash).not.toBe(await hashOfflineSalePayload(food));
  });
});
