/**
 * Slice 2B scale evidence — synthetic source-neutral CSV validation benchmarks.
 * Usage: node --import tsx scripts/migration-p1-slice2b-scale-bench.mjs
 *    or: npx vitest run lib/services/migration/slice2b-scale.test.ts
 */
import { describe, expect, it } from 'vitest';
import { createHash } from 'crypto';
import { validateEntityFile } from '@/lib/services/migration/validate-engine';
import { performance } from 'node:perf_hooks';

function buildProductsCsv(rows: number): Buffer {
  const lines = [
    'sourceProductKey,productName,costPrice,sellingPrice,active,sku,barcode,defaultSupplierSourceKey',
  ];
  for (let i = 0; i < rows; i += 1) {
    lines.push(
      `p${i},Product ${i},1.50,2.00,true,sku${i},bc${i},s1`,
    );
  }
  return Buffer.from(lines.join('\n') + '\n', 'utf8');
}

async function bench(rows: number) {
  const buf = buildProductsCsv(rows);
  const checksum = createHash('sha256').update(buf).digest('hex');
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      // Chunk to exercise streaming path.
      const chunkSize = 64 * 1024;
      for (let i = 0; i < buf.length; i += chunkSize) {
        c.enqueue(new Uint8Array(buf.subarray(i, i + chunkSize)));
      }
      c.close();
    },
  });
  const memBefore = process.memoryUsage().heapUsed;
  const t0 = performance.now();
  const result = await validateEntityFile({
    entityType: 'PRODUCTS',
    stream,
    expectedChecksum: checksum,
  });
  const elapsedMs = performance.now() - t0;
  const memAfter = process.memoryUsage().heapUsed;
  return {
    rows,
    fileSizeBytes: buf.length,
    elapsedMs,
    heapDeltaMb: (memAfter - memBefore) / (1024 * 1024),
    rowCount: result.rowCount,
    errorCount: result.issues.filter((i) => i.severity === 'error').length,
    warningCount: result.issues.filter((i) => i.severity === 'warning').length,
    checksumMatched: result.checksumMatched,
  };
}

describe('migration slice 2B scale evidence', () => {
  it('1_000 product rows', async () => {
    const r = await bench(1_000);
    // eslint-disable-next-line no-console
    console.log('SCALE_1K', JSON.stringify(r));
    expect(r.checksumMatched).toBe(true);
    expect(r.rowCount).toBe(1_000);
    expect(r.errorCount).toBe(0);
    expect(r.elapsedMs).toBeLessThan(30_000);
  }, 60_000);

  it('10_000 product rows', async () => {
    const r = await bench(10_000);
    // eslint-disable-next-line no-console
    console.log('SCALE_10K', JSON.stringify(r));
    expect(r.checksumMatched).toBe(true);
    expect(r.rowCount).toBe(10_000);
    expect(r.errorCount).toBe(0);
    expect(r.elapsedMs).toBeLessThan(120_000);
  }, 180_000);

  it('50_000 product rows', async () => {
    const r = await bench(50_000);
    // eslint-disable-next-line no-console
    console.log('SCALE_50K', JSON.stringify(r));
    expect(r.checksumMatched).toBe(true);
    expect(r.rowCount).toBe(50_000);
    expect(r.errorCount).toBe(0);
    expect(r.elapsedMs).toBeLessThan(300_000);
  }, 360_000);
});
