import { describe, expect, it } from 'vitest';
import { chunkArray, parseMigrationCsv } from '@/lib/migration/parse';
import { CATALOGUE_HEADERS } from '@/lib/migration/contract';

describe('migration parse', () => {
  it('accepts snake_case aliases and skips guide comments', () => {
    const csv = [
      '# guide',
      'legacy_product_id,product_name,unit_of_measure,selling_price,cost_price,primary_barcode,category,sku,description,preferred_supplier_legacy_id,active,reorder_level',
      'P1,Milk,Each,5.00,3.00,111,Dairy,S1,,SUP1,true,1',
    ].join('\n');
    const parsed = parseMigrationCsv(csv, 'CATALOGUE');
    expect(parsed.missingRequiredHeaders).toEqual([]);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0].raw.legacyProductId).toBe('P1');
    expect(parsed.rows[0].raw.sellingPrice).toBe('5.00');
  });

  it('flags forbidden Phase 1 columns', () => {
    const headers = [...CATALOGUE_HEADERS, 'secondaryBarcode'].join(',');
    const csv = `${headers}\nP1,Name,,Cat,,123,Each,1,0,,,true,0`;
    const parsed = parseMigrationCsv(csv, 'CATALOGUE');
    expect(parsed.unsupportedHeaders).toContain('secondaryBarcode');
  });

  it('chunks to the bounded size', () => {
    expect(chunkArray([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
});
