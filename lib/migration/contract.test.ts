import { describe, expect, it } from 'vitest';
import {
  CATALOGUE_FIELD_SPECS,
  OPENING_STOCK_FIELD_SPECS,
  SUPPLIER_FIELD_SPECS,
  headersForTemplate,
  templateCsv,
} from '@/lib/migration/contract';
import { MIGRATION_CONTRACT_VERSION, MIGRATION_TEMPLATE_KINDS } from '@/lib/migration/types';

const VENDOR_MARKERS = ['omega', 'quickbooks', 'sage', 'square'];

describe('migration contract', () => {
  it('is versioned and exposes required Phase 1 templates', () => {
    expect(MIGRATION_CONTRACT_VERSION).toBe('1.0.0');
    expect(headersForTemplate('CATALOGUE')).toContain('legacyProductId');
    expect(headersForTemplate('SUPPLIERS')).toContain('legacySupplierId');
    expect(headersForTemplate('OPENING_STOCK')).toContain('branchCode');
  });

  it('classifies every catalogue field', () => {
    for (const spec of [...CATALOGUE_FIELD_SPECS, ...SUPPLIER_FIELD_SPECS, ...OPENING_STOCK_FIELD_SPECS]) {
      expect(['required', 'optional', 'conditionally_required', 'unsupported']).toContain(
        spec.requirement,
      );
      expect(spec.tillflowTarget).toBeTruthy();
      expect(spec.blankMeaning).toBeTruthy();
    }
  });

  it('keeps exported contract surface source-neutral', () => {
    const surface = JSON.stringify({
      kinds: MIGRATION_TEMPLATE_KINDS,
      catalogue: CATALOGUE_FIELD_SPECS,
      suppliers: SUPPLIER_FIELD_SPECS,
      opening: OPENING_STOCK_FIELD_SPECS,
      csv: templateCsv('CATALOGUE'),
    }).toLowerCase();
    for (const marker of VENDOR_MARKERS) {
      expect(surface.includes(marker), `contract surface contains ${marker}`).toBe(false);
    }
  });

  it('template CSV includes contract version banner', () => {
    expect(templateCsv('CATALOGUE')).toContain(`v${MIGRATION_CONTRACT_VERSION}`);
  });
});
