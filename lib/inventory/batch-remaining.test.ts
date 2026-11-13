import { describe, expect, it } from 'vitest';
import { allocateBatchRemaining } from './batch-remaining';

const day = (iso: string) => new Date(iso);

describe('batch remaining allocation', () => {
  it('keeps on-hand on the newest receipts and treats older receipts as sold', () => {
    const result = allocateBatchRemaining(
      [
        { id: 'old', storeId: 's', productId: 'p', qtyReceivedBase: 10, createdAt: day('2026-01-01T00:00:00.000Z') },
        { id: 'new', storeId: 's', productId: 'p', qtyReceivedBase: 6, createdAt: day('2026-03-01T00:00:00.000Z') },
        { id: 'mid', storeId: 's', productId: 'p', qtyReceivedBase: 4, createdAt: day('2026-02-01T00:00:00.000Z') },
      ],
      [{ storeId: 's', productId: 'p', qtyOnHandBase: 8 }],
    );
    expect(result.remainingByBatchId.get('new')).toBe(6);
    expect(result.remainingByBatchId.get('mid')).toBe(2);
    expect(result.remainingByBatchId.get('old')).toBe(0);
    expect([...result.remainingByBatchId.values()].reduce((sum, qty) => sum + qty, 0)).toBe(8);
  });

  it('does not invent a batch for on-hand that has no receipt', () => {
    const result = allocateBatchRemaining(
      [{ id: 'only', storeId: 's', productId: 'p', qtyReceivedBase: 4, createdAt: day('2026-03-01T00:00:00.000Z') }],
      [{ storeId: 's', productId: 'p', qtyOnHandBase: 10 }],
    );
    expect(result.remainingByBatchId.get('only')).toBe(4);
    expect(result.remainingByBatchId.size).toBe(1);
    expect(result.untrackedOnHandByProduct.get('s\u0000p')).toBe(6);
  });

  it('caps every estimate at zero when on-hand is missing or negative', () => {
    const batches = [
      { id: 'a', storeId: 's', productId: 'p', qtyReceivedBase: 5, createdAt: day('2026-03-01T00:00:00.000Z') },
    ];
    expect(allocateBatchRemaining(batches, []).remainingByBatchId.get('a')).toBe(0);
    expect(allocateBatchRemaining(batches, [{ storeId: 's', productId: 'p', qtyOnHandBase: -3 }]).remainingByBatchId.get('a')).toBe(0);
  });

  it('breaks equal receipt times by id so the result is stable', () => {
    const createdAt = day('2026-03-01T00:00:00.000Z');
    const result = allocateBatchRemaining(
      [
        { id: 'b', storeId: 's', productId: 'p', qtyReceivedBase: 5, createdAt },
        { id: 'a', storeId: 's', productId: 'p', qtyReceivedBase: 5, createdAt },
      ],
      [{ storeId: 's', productId: 'p', qtyOnHandBase: 5 }],
    );
    expect(result.remainingByBatchId.get('b')).toBe(5);
    expect(result.remainingByBatchId.get('a')).toBe(0);
  });

  it('does not let one product consume another product’s on-hand', () => {
    const result = allocateBatchRemaining(
      [
        { id: 'milk', storeId: 's', productId: 'milk', qtyReceivedBase: 9, createdAt: day('2026-03-01T00:00:00.000Z') },
        { id: 'bread', storeId: 's', productId: 'bread', qtyReceivedBase: 9, createdAt: day('2026-03-01T00:00:00.000Z') },
      ],
      [
        { storeId: 's', productId: 'milk', qtyOnHandBase: 2 },
        { storeId: 's', productId: 'bread', qtyOnHandBase: 7 },
      ],
    );
    expect(result.remainingByBatchId.get('milk')).toBe(2);
    expect(result.remainingByBatchId.get('bread')).toBe(7);
  });
});
