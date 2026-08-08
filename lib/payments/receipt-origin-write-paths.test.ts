/**
 * Write-path inventory tests: every live SalesPayment create site must assign
 * an explicit receiptOrigin (no silent omission, no timestamp heuristic).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();

function read(rel: string) {
  return readFileSync(join(root, rel), 'utf8');
}

describe('receipt-origin write-path inventory', () => {
  it('checkout nested payment creates persist RECEIVED_AT_SALE', () => {
    const sales = read('lib/services/sales.ts');
    expect(sales).toContain("from '@/lib/payments/receipt-origin'");
    expect(sales).toContain('receiptOrigin: RECEIPT_ORIGIN.RECEIVED_AT_SALE');
    expect(sales).not.toContain('SALE_RECEIPT_GRACE');
    expect(sales).not.toContain('5 * 60 * 1000');
  });

  it('debtor collections persist LATER_CREDIT_COLLECTION', () => {
    const payments = read('lib/services/payments.ts');
    expect(payments).toContain('receiptOrigin: RECEIPT_ORIGIN.LATER_CREDIT_COLLECTION');
  });

  it('sale amendments persist UNCLASSIFIED for add and refund payment rows', () => {
    const sales = read('lib/services/sales.ts');
    const unclassifiedWrites = sales.match(
      /receiptOrigin:\s*RECEIPT_ORIGIN\.UNCLASSIFIED/g,
    );
    expect((unclassifiedWrites ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it('demo-day sale payments persist RECEIVED_AT_SALE', () => {
    const demo = read('app/actions/demo-day.ts');
    expect(demo).toContain('receiptOrigin: RECEIPT_ORIGIN.RECEIVED_AT_SALE');
  });

  it('backup restore preserves or nulls origin without timestamp inference', () => {
    const backup = read('app/actions/backup.ts');
    expect(backup).toContain('parseOptionalReceiptOrigin');
    expect(backup).toContain('receiptOrigin');
    expect(backup).not.toMatch(/receivedAt\s*-\s*|Date\.now\(\).*receiptOrigin|receiptOrigin.*Date\.now/i);
  });

  it('no five-minute receipt heuristic is introduced', () => {
    const classifyCandidates = [
      'lib/payments/receipt-origin.ts',
      'lib/services/sales.ts',
      'lib/services/payments.ts',
      'app/actions/backup.ts',
      'app/actions/demo-day.ts',
    ];
    for (const rel of classifyCandidates) {
      const src = read(rel);
      expect(src).not.toMatch(/SALE_RECEIPT_GRACE|five.?minute|5\s*\*\s*60\s*\*\s*1000/i);
    }
  });
});
