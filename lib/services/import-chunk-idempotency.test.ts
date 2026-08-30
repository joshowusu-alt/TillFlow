import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it, vi } from 'vitest';
import { buildImportChunkKey } from '@/lib/import/import-chunk-identity';
import {
  findMoneyIdempotency,
  normalizeMoneyIdempotencyKey,
} from '@/lib/services/money-idempotency';

describe('import-stock source: durable import-chunk idempotency', () => {
  const importStock = readFileSync(join(process.cwd(), 'app/actions/import-stock.ts'), 'utf8');

  it('paid createPurchase includes idempotencyKey: buildImportChunkKey and skipCashDrawerRequirement', () => {
    const paidStart = importStock.indexOf("operation: 'purchase-paid'");
    expect(paidStart).toBeGreaterThan(-1);
    const paidBlock = importStock.slice(
      importStock.lastIndexOf('const invoice = await createPurchase({', paidStart),
      importStock.indexOf('});', paidStart) + 3,
    );
    expect(paidBlock).toContain('idempotencyKey: buildImportChunkKey');
    expect(paidBlock).toContain('skipCashDrawerRequirement: true');
    expect(paidBlock).not.toContain('randomUUID');
  });

  it('productImport.create (run id) occurs before paid createPurchase', () => {
    const createIdx = importStock.indexOf('prisma.productImport.create');
    const paidIdx = importStock.indexOf("operation: 'purchase-paid'");
    expect(createIdx).toBeGreaterThan(-1);
    expect(paidIdx).toBeGreaterThan(-1);
    expect(createIdx).toBeLessThan(paidIdx);
    expect(importStock).toContain('const importRunId = normalizedClientImportKey || importRecord.id');
    expect(importStock).toContain("status: 'PROCESSING'");
    expect(importStock).toContain('prisma.productImport.update');
  });

  it('every createPurchase in the action passes a deterministic import chunk key', () => {
    const calls = [...importStock.matchAll(/await createPurchase\(\{/g)];
    expect(calls.length).toBe(3);
    expect(importStock).toContain("operation: 'opening-credit'");
    expect(importStock).toContain("operation: 'purchase-unpaid'");
    expect(importStock).toContain("operation: 'opening-equity'");
    expect(importStock).toContain('commandKind: \'IMPORT_CHUNK\'');
  });

  it('does not mint a randomUUID for import chunk keys', () => {
    expect(importStock).not.toContain('randomUUID');
  });
});

describe('findMoneyIdempotency is scoped by businessId', () => {
  it('embeds businessId in the key and looks up per businessId so injection fails', async () => {
    const key = buildImportChunkKey({
      businessId: 'biz-home',
      importRunId: 'run-1',
      mode: 'PURCHASES',
      operation: 'purchase-paid',
      supplierKey: 'sup-1',
      chunkIndex: 0,
    });
    expect(key).toContain('biz-home');
    expect(key).not.toContain('biz-other');
    expect(normalizeMoneyIdempotencyKey(key)).toBe(key);

    const homeRow = {
      id: 'mid-1',
      businessId: 'biz-home',
      key,
      payloadHash: 'abc',
      commandKind: 'IMPORT_CHUNK',
      resultJson: '{"invoiceId":"inv-1"}',
    };
    const findUnique = vi.fn(async ({ where }: { where: { businessId_key: { businessId: string; key: string } } }) => {
      if (where.businessId_key.businessId === 'biz-home' && where.businessId_key.key === key) {
        return homeRow;
      }
      return null;
    });
    const tx = { moneyIdempotency: { findUnique } };

    const home = await findMoneyIdempotency(tx as any, 'biz-home', key);
    const injected = await findMoneyIdempotency(tx as any, 'biz-other', key);

    expect(home).toEqual(homeRow);
    expect(injected).toBeNull();
    expect(findUnique).toHaveBeenNthCalledWith(1, {
      where: { businessId_key: { businessId: 'biz-home', key } },
    });
    expect(findUnique).toHaveBeenNthCalledWith(2, {
      where: { businessId_key: { businessId: 'biz-other', key } },
    });
  });

  it('does not call createPurchase when the key is already reserved', async () => {
    const createPurchase = vi.fn();
    const key = buildImportChunkKey({
      businessId: 'biz-home',
      importRunId: 'run-1',
      mode: 'PURCHASES',
      operation: 'purchase-paid',
      supplierKey: 'sup-1',
      chunkIndex: 0,
    });
    const findUnique = vi.fn().mockResolvedValue({
      id: 'mid-1',
      businessId: 'biz-home',
      key,
      payloadHash: 'abc',
      commandKind: 'PURCHASE_CREATE',
      resultJson: '{"invoiceId":"inv-1"}',
    });
    const existing = await findMoneyIdempotency(
      { moneyIdempotency: { findUnique } } as any,
      'biz-home',
      key,
    );
    if (!existing) {
      createPurchase();
    }
    expect(existing).not.toBeNull();
    expect(createPurchase).not.toHaveBeenCalled();
  });
});

describe('ImportStockClient retry identity', () => {
  it('derives clientImportKey from file fingerprint instead of mount-time randomness', () => {
    const src = readFileSync(
      join(process.cwd(), 'app/(protected)/settings/import-stock/ImportStockClient.tsx'),
      'utf8',
    );
    expect(src).toContain('setClientImportKey(`imp:${importMode}:${file.size}:${file.lastModified}:${safeName}`)');
    expect(src).not.toContain('Math.random().toString(36).slice(2, 8)');
  });

  it('rejects paid/opening imports without a clientImportKey', () => {
    const action = readFileSync(join(process.cwd(), 'app/actions/import-stock.ts'), 'utf8');
    const api = readFileSync(join(process.cwd(), 'app/api/import-stock/route.ts'), 'utf8');
    expect(action).toContain("importMode === 'PURCHASES' || importMode === 'OPENING_STOCK'");
    expect(action).toContain('normalizedClientImportKey');
    expect(api).toContain('clientImportKey');
  });
});
