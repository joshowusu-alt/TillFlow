import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  IMPORT_BLOCKING_COPY,
  IMPORT_STOCK_PATH,
  assertCatalogueDidNotWriteMoney,
  catalogueFinancialFingerprint,
} from './preview-qa-catalogue';

const root = join(__dirname, '..', '..', '..');

function source(rel: string) {
  return readFileSync(join(root, rel), 'utf8');
}

describe('Reliability catalogue/import helpers', () => {
  it('pins the original owner-reported manual-import route', () => {
    expect(IMPORT_STOCK_PATH).toBe('/settings/import-stock');
    expect(source('app/(protected)/settings/import-stock/page.tsx')).toContain('title="Import Stock"');
    expect(source('app/(protected)/settings/import-stock/ImportStockClient.tsx')).toContain(
      'What are you importing?',
    );
    const helper = source('tests/e2e/helpers/preview-qa-catalogue.ts');
    expect(helper).toContain("goto(IMPORT_STOCK_PATH");
    expect(helper).toContain("name: 'Product catalogue'");
    expect(helper).toContain('import-stock-file-input');
    expect(helper).not.toMatch(/Download[\s\S]{0,40}template[\s\S]{0,80}\.click\(/);
    expect(source('playwright/reliability-catalogue.spec.ts')).toContain('enterManualImportRoute');
    expect(source('playwright/reliability-journey.spec.ts')).toContain('enterManualImportRoute');
  });

  it('treats the three blocking empty states as fail-closed visible copy', () => {
    expect(IMPORT_BLOCKING_COPY.noProductsYet).toBe('No products yet.');
    expect(IMPORT_BLOCKING_COPY.noProductRows).toBe(
      'The file had no product rows. Check the file and try again.',
    );
    expect(IMPORT_BLOCKING_COPY.noReadyRows).toBe('No ready rows to import.');
    const helper = source('tests/e2e/helpers/preview-qa-catalogue.ts');
    expect(helper).toContain('assertImportBlockingStatesAbsent');
    expect(helper).toContain("locator('visible=true')");
    expect(source('app/(protected)/products/page.tsx')).toContain('No products yet.');
    expect(source('app/(protected)/settings/import-stock/ImportStockClient.tsx')).toContain(
      'The file had no product rows. Check the file and try again.',
    );
  });

  it('does not pass merely because another catalogue product already exists', () => {
    const spec = source('playwright/reliability-catalogue.spec.ts');
    expect(spec).toContain('ensureSellableQaProduct');
    expect(spec).toContain('ensureImportedQaProduct');
    expect(spec).toContain('RELIABILITY_IMPORT_PRODUCT');
    expect(spec).toContain('expectUniqueQaProductRowVisible(page, RELIABILITY_SELLABLE_PRODUCT)');
    expect(spec).toContain('expectUniqueQaProductRowVisible(page, RELIABILITY_IMPORT_PRODUCT)');
    expect(spec.indexOf("enter exact manual-import route")).toBeGreaterThan(-1);
    expect(spec.indexOf("enter exact manual-import route")).toBeLessThan(
      spec.indexOf('complete or reuse deterministic import product'),
    );
  });

  it('fails if invoices, expenses, or CASH_SALE drawers grow during the catalogue gate', () => {
    const before = catalogueFinancialFingerprint({
      invoices: [{ drawer: [] }],
      expenses: [],
    });
    expect(before).toEqual({ invoiceCount: 1, expenseCount: 0, cashSaleDrawerCount: 0 });
    expect(() =>
      assertCatalogueDidNotWriteMoney(before, {
        invoiceCount: 2,
        expenseCount: 0,
        cashSaleDrawerCount: 0,
      }),
    ).toThrow(/invoice count/);
    expect(() =>
      assertCatalogueDidNotWriteMoney(before, {
        invoiceCount: 1,
        expenseCount: 1,
        cashSaleDrawerCount: 0,
      }),
    ).toThrow(/expense count/);
    expect(() =>
      assertCatalogueDidNotWriteMoney(before, {
        invoiceCount: 1,
        expenseCount: 0,
        cashSaleDrawerCount: 1,
      }),
    ).toThrow(/CASH_SALE drawer/);
    expect(() => assertCatalogueDidNotWriteMoney(before, before)).not.toThrow();
  });
});
