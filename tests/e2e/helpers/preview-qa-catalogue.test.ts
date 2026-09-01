import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  IMPORT_BLOCKING_COPY,
  IMPORT_STOCK_PATH,
  assertCatalogueDidNotWriteMoney,
  catalogueFinancialFingerprint,
} from './preview-qa-catalogue';
import {
  MANUAL_IMPORT_GATE_CSV_FILENAME,
  RELIABILITY_MANUAL_IMPORT_GATE_PRODUCT,
  isVacuousImportAbsencePass,
} from '../../../lib/reliability/manual-import-gate';

const root = join(__dirname, '..', '..', '..');

function source(rel: string) {
  return readFileSync(join(root, rel), 'utf8');
}

describe('Reliability catalogue/import helpers', () => {
  it('pins the original owner-reported manual-import route and P104 CSV identity', () => {
    expect(IMPORT_STOCK_PATH).toBe('/settings/import-stock');
    expect(RELIABILITY_MANUAL_IMPORT_GATE_PRODUCT.sku).toBe('REL-IMP-P104-01');
    expect(MANUAL_IMPORT_GATE_CSV_FILENAME).toContain('rel-imp-p104-01');
    expect(source('app/(protected)/settings/import-stock/page.tsx')).toContain('title="Import Stock"');
    const helper = source('tests/e2e/helpers/preview-qa-catalogue.ts');
    expect(helper).toContain('openManualImportEntryPoint');
    expect(helper).toContain('Import products');
    expect(helper).toContain("getByTestId('import-mode-CATALOGUE')");
    expect(helper).not.toContain("name: 'Product catalogue', exact: true");
    expect(helper).toContain('attachManualImportGateCsv');
    expect(source('tests/e2e/helpers/preview-qa-manual-entry.ts')).toContain('Add a product manually');
    expect(source('tests/e2e/helpers/preview-qa-manual-entry.ts')).toContain('/products#product-create');
    expect(source('tests/e2e/helpers/preview-qa-manual-entry.ts')).toContain('REL-MAN-P104-01');
    expect(source('tests/e2e/helpers/preview-qa-manual-entry.ts')).toContain(
      "details.getByRole('heading', { name: 'Add product', exact: true })",
    );
    expect(source('tests/e2e/helpers/preview-qa-manual-entry.ts')).not.toContain(
      "form.getByRole('heading', { name: 'Add product' })",
    );
    expect(source('tests/e2e/helpers/preview-qa-manual-entry.ts')).toContain("toHaveURL(/\\/products(?:\\?[^#]*)?#product-create/)");
    expect(source('tests/e2e/helpers/preview-qa-manual-entry.ts')).toContain('toBeFocused');
    expect(source('playwright/reliability-catalogue.spec.ts')).not.toContain('runManualProductEntryGate');
    expect(source('playwright/reliability-catalogue.spec.ts')).not.toContain('Add a product manually');
    expect(helper).toContain('proveManualImportPreview');
    expect(helper).toContain('runManualImportGate');
    expect(helper).toContain('setInputFiles');
    expect(helper).not.toMatch(/Download[\s\S]{0,40}template[\s\S]{0,80}\.click\(/);
    expect(source('playwright/reliability-catalogue.spec.ts')).toContain('runManualImportGate');
    expect(source('playwright/reliability-catalogue.spec.ts')).not.toContain('ensureImportedQaProduct');
    expect(source('components/ReadinessJourney.tsx')).toContain('Import products');
    expect(source('components/ReadinessJourney.tsx')).toContain('ONBOARDING_ADD_PRODUCT_MANUALLY_NAME');
    expect(source('components/ReadinessJourney.tsx')).toContain('PRODUCT_CREATE_HREF');
  });

  it('does not treat visit-only absence of No products yet as a pass', () => {
    expect(
      isVacuousImportAbsencePass({
        visitedImportStock: true,
        uploadedCsv: false,
        blockingCopyAbsent: true,
      }),
    ).toBe(true);
    const spec = source('playwright/reliability-catalogue.spec.ts');
    expect(spec).toContain('REL-IMP-P104-01');
    expect(spec).toContain('runManualImportGate');
    expect(source('tests/e2e/helpers/preview-qa-catalogue.ts')).toContain('uploadedCsv: true');
  });

  it('treats the three blocking empty states as fail-closed visible copy', () => {
    expect(IMPORT_BLOCKING_COPY.noProductsYet).toBe('No products yet.');
    expect(IMPORT_BLOCKING_COPY.noProductRows).toBe(
      'The file had no product rows. Check the file and try again.',
    );
    expect(IMPORT_BLOCKING_COPY.noReadyRows).toBe('No ready rows to import.');
    const helper = source('tests/e2e/helpers/preview-qa-catalogue.ts');
    expect(helper).toContain('collectVisibleBlockingCopy');
    expect(helper).toContain("locator('visible=true')");
    expect(source('lib/reliability/manual-import-gate.ts')).toContain('assertManualImportPreviewGate');
  });

  it('does not pass merely because Reliability SKU or Import SKU already exists', () => {
    const spec = source('playwright/reliability-catalogue.spec.ts');
    expect(spec).toContain('ensureSellableQaProduct');
    expect(spec).toContain('RELIABILITY_MANUAL_IMPORT_GATE_PRODUCT');
    expect(spec).not.toContain('ensureImportedQaProduct');
    expect(spec).not.toContain('RELIABILITY_IMPORT_PRODUCT');
    expect(spec).toContain('assertCatalogueOpeningStockPersisted');
  });

  it('fails if invoices, payments, expenses, or CASH_SALE drawers grow during the catalogue gate', () => {
    const before = catalogueFinancialFingerprint({
      invoices: [{ drawer: [], payments: [] }],
      expenses: [],
    });
    expect(before).toEqual({
      invoiceCount: 1,
      expenseCount: 0,
      cashSaleDrawerCount: 0,
      paymentCount: 0,
    });
    expect(() =>
      assertCatalogueDidNotWriteMoney(before, { ...before, invoiceCount: 2 }),
    ).toThrow(/invoice count/);
    expect(() =>
      assertCatalogueDidNotWriteMoney(before, { ...before, expenseCount: 1 }),
    ).toThrow(/expense count/);
    expect(() =>
      assertCatalogueDidNotWriteMoney(before, { ...before, cashSaleDrawerCount: 1 }),
    ).toThrow(/CASH_SALE drawer/);
    expect(() =>
      assertCatalogueDidNotWriteMoney(before, { ...before, paymentCount: 1 }),
    ).toThrow(/payment count/);
    expect(() => assertCatalogueDidNotWriteMoney(before, before)).not.toThrow();
  });
});
