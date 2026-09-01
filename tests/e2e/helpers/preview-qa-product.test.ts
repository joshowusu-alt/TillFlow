import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  RELIABILITY_IMPORT_PRODUCT,
  RELIABILITY_SELLABLE_PRODUCT,
  assertUniqueQaProductPresence,
  classifyQaProductPresence,
  countQaProductIdentityHits,
  duplicateQaProductMessage,
  type QaProductDomHit,
} from './preview-qa-product';

const root = join(__dirname, '..', '..', '..');

function source(rel: string) {
  return readFileSync(join(root, rel), 'utf8');
}

const hostedDesktopHits: QaProductDomHit[] = [
  {
    role: 'link',
    inTable: false,
    visible: false,
    accessibleName: RELIABILITY_SELLABLE_PRODUCT.name,
  },
  {
    role: 'row',
    inTable: true,
    visible: true,
    accessibleName: `${RELIABILITY_SELLABLE_PRODUCT.name} GH₵5.00 GH₵2.00`,
  },
  {
    role: 'link',
    inTable: true,
    visible: true,
    accessibleName: RELIABILITY_SELLABLE_PRODUCT.name,
  },
];

describe('Reliability QA product identity', () => {
  it('counts one table row separately from a hidden responsive name link', () => {
    const summary = countQaProductIdentityHits(hostedDesktopHits, RELIABILITY_SELLABLE_PRODUCT);
    expect(summary.tableRowCount).toBe(1);
    expect(summary.hiddenLinkCount).toBe(1);
    expect(summary.visibleTableLinkCount).toBe(1);
    expect(classifyQaProductPresence(summary.tableRowCount)).toBe('reuse');
  });

  it('does not treat Playwright retries of the same hidden link as extra products', () => {
    const retriedHiddenLinks: QaProductDomHit[] = Array.from({ length: 43 }, () => ({
      role: 'link' as const,
      inTable: false,
      visible: false,
      accessibleName: RELIABILITY_SELLABLE_PRODUCT.name,
    }));
    const summary = countQaProductIdentityHits(
      [...retriedHiddenLinks, hostedDesktopHits[1]!, hostedDesktopHits[2]!],
      RELIABILITY_SELLABLE_PRODUCT,
    );
    expect(summary.hiddenLinkCount).toBe(43);
    expect(summary.tableRowCount).toBe(1);
    expect(classifyQaProductPresence(summary.tableRowCount)).toBe('reuse');
  });

  it('does not treat Reliability Import SKU as the sellable QA product', () => {
    const summary = countQaProductIdentityHits(
      [
        {
          role: 'row',
          inTable: true,
          visible: true,
          accessibleName: `${RELIABILITY_IMPORT_PRODUCT.name} GH₵4.00 GH₵2.00`,
        },
        {
          role: 'link',
          inTable: true,
          visible: true,
          accessibleName: RELIABILITY_IMPORT_PRODUCT.name,
        },
      ],
      RELIABILITY_SELLABLE_PRODUCT,
    );
    expect(summary.tableRowCount).toBe(0);
    expect(summary.visibleTableLinkCount).toBe(0);
    expect(classifyQaProductPresence(summary.tableRowCount)).toBe('missing');
  });

  it('reuses when one table row exists for the QA name or SKU', () => {
    expect(classifyQaProductPresence(1)).toBe('reuse');
    expect(assertUniqueQaProductPresence(1, RELIABILITY_SELLABLE_PRODUCT)).toBe('reuse');
    expect(
      countQaProductIdentityHits(
        [
          {
            role: 'row',
            inTable: true,
            visible: true,
            accessibleName: `Catalog ${RELIABILITY_SELLABLE_PRODUCT.sku}`,
          },
        ],
        RELIABILITY_SELLABLE_PRODUCT,
      ).tableRowCount,
    ).toBe(1);
  });

  it('creates (missing) when no table row matches the QA identity', () => {
    expect(classifyQaProductPresence(0)).toBe('missing');
    expect(assertUniqueQaProductPresence(0, RELIABILITY_SELLABLE_PRODUCT)).toBe('missing');
    expect(countQaProductIdentityHits(hostedDesktopHits.slice(0, 1), RELIABILITY_SELLABLE_PRODUCT)).toEqual({
      tableRowCount: 0,
      hiddenLinkCount: 1,
      visibleTableLinkCount: 0,
    });
  });

  it('fails when two table rows share the same name or SKU', () => {
    expect(classifyQaProductPresence(2)).toBe('duplicate');
    expect(() => assertUniqueQaProductPresence(2, RELIABILITY_SELLABLE_PRODUCT)).toThrow(
      /Genuine duplicates — do not pick a visible one/,
    );
    expect(() => assertUniqueQaProductPresence(2, RELIABILITY_SELLABLE_PRODUCT)).toThrow(
      duplicateQaProductMessage(RELIABILITY_SELLABLE_PRODUCT, 2),
    );
    const twoRows = countQaProductIdentityHits(
      [
        {
          role: 'row',
          inTable: true,
          visible: true,
          accessibleName: RELIABILITY_SELLABLE_PRODUCT.name,
        },
        {
          role: 'row',
          inTable: true,
          visible: true,
          accessibleName: `${RELIABILITY_SELLABLE_PRODUCT.name} ${RELIABILITY_SELLABLE_PRODUCT.sku}`,
        },
        {
          role: 'link',
          inTable: true,
          visible: true,
          accessibleName: RELIABILITY_SELLABLE_PRODUCT.name,
        },
      ],
      RELIABILITY_SELLABLE_PRODUCT,
    );
    expect(twoRows.tableRowCount).toBe(2);
    expect(() => assertUniqueQaProductPresence(twoRows.tableRowCount, RELIABILITY_SELLABLE_PRODUCT)).toThrow(
      /2 table rows share QA identity/,
    );
  });

  it('locator must use role=row or table link, not getByText().first()', () => {
    const helper = source('tests/e2e/helpers/preview-qa-product.ts');
    const spec = source('playwright/reliability-journey.spec.ts');
    expect(helper).toContain("getByRole('table')");
    expect(helper).toContain("getByRole('row')");
    expect(helper).toContain("getByRole('link'");
    expect(helper).toContain('exact: true');
    expect(helper).not.toMatch(/getByText\([^;\n]*\)\.first\(\)/);
    expect(helper).toContain("sku: 'REL-SKU-1'");
    expect(helper).toContain("barcode: 'RELSKU1'");
    expect(helper).toContain('qaProductTableRows');
    expect(helper).toContain('qaProductTableLink');
    expect(spec).toContain('ensureSellableQaProduct');
    expect(spec).toContain('ensureImportedQaProduct');
    expect(spec).not.toMatch(/getByText\(\s*PRODUCT_NAME\s*\)\.first\(\)/);
    expect(spec).not.toMatch(/getByText\(\s*IMPORT_PRODUCT_NAME[^)]*\)\.first\(\)/);
    expect(spec).not.toMatch(/getByText\(\s*RELIABILITY_SELLABLE_PRODUCT\.name\s*\)\.first\(\)/);
    expect(spec).not.toMatch(/getByText\(\s*RELIABILITY_IMPORT_PRODUCT\.name[^)]*\)\.first\(\)/);
  });

  it('pins a stable SKU/barcode identity distinct from the import product', () => {
    expect(RELIABILITY_SELLABLE_PRODUCT).toMatchObject({
      name: 'Reliability SKU',
      sku: 'REL-SKU-1',
      barcode: 'RELSKU1',
    });
    expect(RELIABILITY_IMPORT_PRODUCT).toMatchObject({
      name: 'Reliability Import SKU',
      sku: 'REL-IMP-1',
      barcode: 'RELIMP1',
    });
    expect(RELIABILITY_SELLABLE_PRODUCT.sku).not.toBe(RELIABILITY_IMPORT_PRODUCT.sku);
    const helper = source('tests/e2e/helpers/preview-qa-product.ts');
    expect(helper).toContain('REL-SKU-1');
    expect(helper).toContain('RELSKU1');
    expect(source('playwright/reliability-journey.spec.ts')).toContain('RELIABILITY_SELLABLE_PRODUCT');
  });
});
