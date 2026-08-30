import { describe, expect, it } from 'vitest';
import {
  buildImportChunkKey,
  buildImportChunkPayloadHash,
} from '@/lib/import/import-chunk-identity';
import {
  buildImportChunkPayloadHash as moneyBuildImportChunkPayloadHash,
  normalizeMoneyIdempotencyKey,
} from '@/lib/services/money-idempotency';

const baseKeyInput = {
  businessId: 'biz_abc123',
  importRunId: 'imp-client-stable-1',
  mode: 'PURCHASES',
  operation: 'purchase-paid' as const,
  supplierKey: 'sup_1',
  chunkIndex: 0,
};

const baseHashInput = {
  ...baseKeyInput,
  storeId: 'store_1',
  lines: [{ productId: 'p1', unitId: 'u1', qtyInUnit: 2, unitCostPence: 150 }],
  amountPence: 300,
  method: 'CASH',
};

describe('buildImportChunkKey', () => {
  it('is stable, embeds businessId, and stays within the 128-char normalize limit', () => {
    const key = buildImportChunkKey(baseKeyInput);
    expect(key).toBe(
      'IMPORT:biz_abc123:imp-client-stable-1:PURCHASES:purchase-paid:sup_1:0',
    );
    expect(key).toContain('biz_abc123');
    expect(key.length).toBeLessThanOrEqual(128);
    expect(normalizeMoneyIdempotencyKey(key)).toBe(key);
  });

  it('returns the same key for the same inputs', () => {
    expect(buildImportChunkKey(baseKeyInput)).toBe(buildImportChunkKey({ ...baseKeyInput }));
  });

  it('hashes the tail when the assembled key would exceed 128 chars', () => {
    const longRunId = `imp-${'x'.repeat(200)}`;
    const key = buildImportChunkKey({ ...baseKeyInput, importRunId: longRunId });
    expect(key.startsWith('IMPORT:biz_abc123:')).toBe(true);
    expect(key).toContain('biz_abc123');
    expect(key.length).toBeLessThanOrEqual(128);
    expect(normalizeMoneyIdempotencyKey(key)).toBe(key);
    expect(key).not.toContain(longRunId);
    expect(buildImportChunkKey({ ...baseKeyInput, importRunId: longRunId })).toBe(key);
  });

  it('changes when businessId, run, operation, or chunk index changes', () => {
    const base = buildImportChunkKey(baseKeyInput);
    expect(buildImportChunkKey({ ...baseKeyInput, businessId: 'biz_other' })).not.toBe(base);
    expect(buildImportChunkKey({ ...baseKeyInput, importRunId: 'other-run' })).not.toBe(base);
    expect(buildImportChunkKey({ ...baseKeyInput, operation: 'purchase-unpaid' })).not.toBe(base);
    expect(buildImportChunkKey({ ...baseKeyInput, chunkIndex: 1 })).not.toBe(base);
  });
});

describe('buildImportChunkPayloadHash', () => {
  it('is stable and matches the money-idempotency import hash', () => {
    const hash = buildImportChunkPayloadHash(baseHashInput);
    expect(hash).toBe(buildImportChunkPayloadHash({ ...baseHashInput }));
    expect(hash).toBe(moneyBuildImportChunkPayloadHash(baseHashInput));
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('changes when amount differs', () => {
    const a = buildImportChunkPayloadHash(baseHashInput);
    const b = buildImportChunkPayloadHash({ ...baseHashInput, amountPence: 301 });
    expect(a).not.toBe(b);
  });

  it('changes when method or lines differ', () => {
    const a = buildImportChunkPayloadHash(baseHashInput);
    expect(buildImportChunkPayloadHash({ ...baseHashInput, method: 'TRANSFER' })).not.toBe(a);
    expect(
      buildImportChunkPayloadHash({
        ...baseHashInput,
        lines: [{ productId: 'p1', unitId: 'u1', qtyInUnit: 3, unitCostPence: 150 }],
      }),
    ).not.toBe(a);
  });
});
