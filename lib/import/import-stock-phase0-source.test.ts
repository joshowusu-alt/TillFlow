import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

describe('Phase 0 import-stock source contracts', () => {
  const importStock = readFileSync(join(process.cwd(), 'app/actions/import-stock.ts'), 'utf8');
  const openingStock = readFileSync(join(process.cwd(), 'app/actions/opening-stock.ts'), 'utf8');
  const client = readFileSync(
    join(process.cwd(), 'app/(protected)/settings/import-stock/ImportStockClient.tsx'),
    'utf8'
  );

  it('requires explicit importMode', () => {
    expect(importStock).toContain("Choose an import purpose first");
    expect(importStock).toContain('isImportMode(meta.importMode)');
  });

  it('catalogue path strips quantities and avoids stock posting', () => {
    expect(importStock).toContain("importMode === 'CATALOGUE'");
    expect(importStock).toContain('quantity: 0');
    expect(importStock).toContain('Catalogue only — no stock movements');
  });

  it('opening stock defaults to Opening Balance Equity, not AP or Cash', () => {
    expect(importStock).toContain('recordOpeningInventory');
    expect(importStock).toContain('Opening Balance Equity');
    expect(importStock).toContain('Legacy payment_status column ignored for opening stock');
    expect(importStock).toContain("importMode === 'OPENING_STOCK'");
    // Opening path must not synthesize PAID cash credits
    const openingBlock = importStock.slice(
      importStock.indexOf("importMode === 'OPENING_STOCK'"),
      importStock.indexOf("importMode === 'PURCHASES'")
    );
    expect(openingBlock).not.toContain("paymentStatus: 'PAID'");
  });

  it('supplier-credit opening stock requires named supplier', () => {
    expect(importStock).toContain('Opening stock on supplier credit requires a named supplier');
  });

  it('purchases mode retains PAID/UNPAID with PURCHASE movement type', () => {
    expect(importStock).toContain("importMode === 'PURCHASES'");
    expect(importStock).toContain("stockMovementType: 'PURCHASE'");
    expect(importStock).toContain('Unpaid purchases require a named supplier');
  });

  it('opening-stock UI action uses recordOpeningInventory', () => {
    expect(openingStock).toContain('recordOpeningInventory');
    expect(openingStock).toContain('till float remains non-GL');
  });

  it('importer UI requires purpose selection and mode-specific templates', () => {
    expect(client).toContain('What are you importing?');
    expect(client).toContain('downloadTemplateForMode');
    expect(client).toContain('Current cash will not be reduced');
  });
});
