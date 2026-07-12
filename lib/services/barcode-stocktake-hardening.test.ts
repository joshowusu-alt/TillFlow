import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

function read(rel: string) {
  return readFileSync(join(root, rel), 'utf8');
}

describe('barcode + stocktake hardening source guards', () => {
  it('no longer generates risky 200… EAN-13 internal barcodes', () => {
    const src = read('app/actions/products.ts');
    expect(src).not.toContain("'200'");
    expect(src).not.toContain('"200"');
    expect(src).toContain('allocateUniqueInternalBarcode');
    expect(src).toContain('already has a barcode');
    expect(src).toContain('BARCODE_GENERATE');
    expect(src).toContain('generateMissingBarcodesAction');
    expect(src).toContain('advancedOps');
  });

  it('blocks stocktake and barcode generation behind Growth features', () => {
    const stocktake = read('app/actions/stocktake.ts');
    expect(stocktake).toContain('assertGrowthStocktake');
    expect(stocktake).toContain('Enter a reason for the variance');
    expect(stocktake).toContain('Stocktake:');

    const page = read('app/(protected)/inventory/stocktake/page.tsx');
    expect(page).toContain('AdvancedModeNotice');
    expect(page).toContain('minimumPlan="GROWTH"');
  });

  it('stocktake client reuses POS scanner buffer and requires reason UX', () => {
    const client = read('app/(protected)/inventory/stocktake/StocktakeClient.tsx');
    expect(client).toContain('usePosScannerBuffer');
    expect(client).toContain('varianceReason');
    expect(client).toContain('bumpCount');
    expect(client).toContain('Scan or search product');
  });

  it('exposes stocktake in navigation as Growth+', () => {
    const nav = read('lib/navigation-config.ts');
    expect(nav).toContain("href: '/inventory/stocktake'");
    expect(nav).toContain("minimumPlan: 'GROWTH'");
  });

  it('label stickers can mark internal barcodes', () => {
    const sticker = read('lib/labels/templates/product-sticker.ts');
    expect(sticker).toContain('isInternalBarcode');
    expect(sticker).toContain('Internal');

    const preview = read('components/LabelPreview.tsx');
    expect(preview).toContain('isInternalBarcode');
    expect(preview).toContain('Internal');
  });

  it('shows a visible overwrite-blocked explanation without relying on tooltip alone', () => {
    const field = read('components/BarcodeFieldWithGenerate.tsx');
    expect(field).toContain('Existing barcode detected');
    expect(field).toContain(
      'This product already has a barcode. Remove it first if you want to generate an internal barcode.',
    );
  });

  it('keeps bulk generate success feedback across products revalidation', () => {
    const button = read('components/products/GenerateMissingBarcodesButton.tsx');
    expect(button).toContain('barcodesGenerated');
    expect(button).toContain('You can now print labels');
    expect(button).toContain('Print labels');

    const page = read('app/(protected)/products/page.tsx');
    expect(page).toContain('barcodesGenerated');
    expect(page).toContain('initialGenerated');
  });
});