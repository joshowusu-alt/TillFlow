/** @vitest-environment node */
import { describe, expect, it } from 'vitest';
import { createHash } from 'crypto';
import { parseMigrationCsvBuffer } from '@/lib/services/migration/csv-parser';
import {
  applyCrossFileSemantics,
  validateEntityFile,
} from '@/lib/services/migration/validate-engine';
import {
  compareMigrationIssues,
  sanitiseMigrationIssue,
} from '@/lib/migration/issue-codes';
import { MIGRATION_MAX_EXCEPTIONS_RETAINED, truncateExceptionsForStorage } from '@/lib/migration/limits';

function sha(buf: Buffer) {
  return createHash('sha256').update(buf).digest('hex');
}

function streamOf(text: string) {
  const buf = Buffer.from(text, 'utf8');
  return {
    buf,
    checksum: sha(buf),
    stream: new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new Uint8Array(buf));
        c.close();
      },
    }),
  };
}

describe('migration csv parser', () => {
  it('parses BOM + CRLF headers', async () => {
    const text = '\uFEFFsourceSupplierKey,supplierName\r\ns1,Acme\r\n';
    const parsed = await parseMigrationCsvBuffer(Buffer.from(text, 'utf8'));
    expect(parsed.headers[0]).toBe('sourceSupplierKey');
    expect(parsed.rows).toHaveLength(1);
  });

  it('rejects malformed quoting', async () => {
    const text = 'a,b\n"unterminated,x\n';
    const parsed = await parseMigrationCsvBuffer(Buffer.from(text, 'utf8'));
    expect(parsed.issues.some((i) => i.code === 'MALFORMED_QUOTING')).toBe(true);
  });

  it('flags oversized fields and row ceiling', async () => {
    const big = 'x'.repeat(501);
    const parsed = await parseMigrationCsvBuffer(
      Buffer.from(`sourceSupplierKey,supplierName\n${big},Name\n`, 'utf8'),
    );
    expect(parsed.issues.some((i) => i.code === 'FIELD_TOO_LONG')).toBe(true);
  });

  it('handles escaped quotes', async () => {
    const parsed = await parseMigrationCsvBuffer(
      Buffer.from('a,b\n"he""llo",world\n', 'utf8'),
    );
    expect(parsed.rows[0]![0]).toBe('he"llo');
  });
});

describe('migration validate engine', () => {
  it('validates a minimal suppliers file', async () => {
    const { stream, checksum } = streamOf(
      'sourceSupplierKey,supplierName\nsup-1,Acme Supplies\n',
    );
    const result = await validateEntityFile({
      entityType: 'SUPPLIERS',
      stream,
      expectedChecksum: checksum,
    });
    expect(result.checksumMatched).toBe(true);
    expect(result.issues.filter((i) => i.severity === 'error')).toHaveLength(0);
    expect(result.sourceKeys.has('sup-1')).toBe(true);
  });

  it('emits CHECKSUM_MISMATCH without VALIDATED path inputs', async () => {
    const { stream } = streamOf('sourceSupplierKey,supplierName\ns1,A\n');
    const result = await validateEntityFile({
      entityType: 'SUPPLIERS',
      stream,
      expectedChecksum: '0'.repeat(64),
    });
    expect(result.checksumMatched).toBe(false);
    expect(result.issues.some((i) => i.code === 'CHECKSUM_MISMATCH')).toBe(true);
  });

  it('detects missing headers and prohibited fields', async () => {
    const { stream, checksum } = streamOf('supplierName,supplierBalance\nx,1\n');
    const result = await validateEntityFile({
      entityType: 'SUPPLIERS',
      stream,
      expectedChecksum: checksum,
    });
    expect(result.issues.some((i) => i.code === 'MISSING_REQUIRED_HEADER')).toBe(true);
    expect(result.issues.some((i) => i.code === 'PROHIBITED_HEADER')).toBe(true);
  });

  it('warns on missing barcode and formula prefix', async () => {
    const csv =
      'sourceProductKey,productName,costPrice,sellingPrice,active,barcode\n' +
      'p1,Widget,1.00,2.00,true,\n' +
      'p2,=CMD,1.00,2.00,true,bc2\n';
    const { stream, checksum } = streamOf(csv);
    const result = await validateEntityFile({
      entityType: 'PRODUCTS',
      stream,
      expectedChecksum: checksum,
    });
    expect(result.issues.some((i) => i.code === 'MISSING_BARCODE')).toBe(true);
    expect(result.issues.some((i) => i.code === 'FORMULA_PREFIX_DETECTED')).toBe(true);
  });

  it('rejects negative cost and bad monetary precision', async () => {
    const csv =
      'sourceProductKey,productName,costPrice,sellingPrice,active\n' +
      'p1,A,-1.00,2.00,true\n' +
      'p2,B,1.001,2.00,true\n';
    const { stream, checksum } = streamOf(csv);
    const result = await validateEntityFile({
      entityType: 'PRODUCTS',
      stream,
      expectedChecksum: checksum,
    });
    expect(result.issues.some((i) => i.code === 'NEGATIVE_VALUE_PROHIBITED')).toBe(true);
    expect(result.issues.some((i) => i.code === 'INVALID_MONETARY_PRECISION')).toBe(true);
  });

  it('enforces supplier and product cross-file refs + branch mappings', async () => {
    const suppliers = await validateEntityFile({
      entityType: 'SUPPLIERS',
      ...(() => {
        const s = streamOf('sourceSupplierKey,supplierName\ns1,A\n');
        return { stream: s.stream, expectedChecksum: s.checksum };
      })(),
    });
    const products = await validateEntityFile({
      entityType: 'PRODUCTS',
      ...(() => {
        const s = streamOf(
          'sourceProductKey,productName,costPrice,sellingPrice,active,defaultSupplierSourceKey\n' +
            'p1,W,1.00,2.00,true,missing\n',
        );
        return { stream: s.stream, expectedChecksum: s.checksum };
      })(),
    });
    const opening = await validateEntityFile({
      entityType: 'OPENING_STOCK',
      ...(() => {
        const s = streamOf(
          'sourceProductKey,sourceBranchKey,quantity,unitCost,asOfDate\n' +
            'p1,hq,1,1.00,2026-01-01\n',
        );
        return { stream: s.stream, expectedChecksum: s.checksum };
      })(),
    });
    // Fix products source key set for opening ref
    products.sourceKeys.add('p1');
    const cross = applyCrossFileSemantics({
      suppliers,
      products,
      openingStock: opening,
      branchMappings: [],
    });
    expect(cross.some((i) => i.code === 'SUPPLIER_REFERENCE_MISSING')).toBe(true);
    expect(cross.some((i) => i.code === 'BRANCH_MAPPINGS_REQUIRED')).toBe(true);
  });

  it('sanitises and orders issues deterministically; truncates at ceiling', () => {
    const a = sanitiseMigrationIssue({
      code: 'DUPLICATE_SKU',
      severity: 'error',
      entityType: 'PRODUCTS',
      rowNumber: 2,
      column: 'sku',
      message: '<script>alert(1)</script>',
      sourceKey: 'p1',
    });
    expect(a.message.includes('<')).toBe(false);
    const many = Array.from({ length: MIGRATION_MAX_EXCEPTIONS_RETAINED + 5 }, (_, i) =>
      sanitiseMigrationIssue({
        code: 'BLANK_ROW',
        severity: 'warning',
        entityType: 'SUPPLIERS',
        rowNumber: i + 2,
        column: null,
        message: `row ${i}`,
      }),
    );
    const sorted = [...many].sort(compareMigrationIssues);
    expect(sorted[0]!.rowNumber).toBeLessThanOrEqual(sorted[1]!.rowNumber!);
    const { retained, truncated } = truncateExceptionsForStorage(sorted);
    expect(retained).toHaveLength(MIGRATION_MAX_EXCEPTIONS_RETAINED);
    expect(truncated).toBe(5);
  });
});
