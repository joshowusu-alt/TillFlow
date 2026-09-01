import { describe, expect, it } from 'vitest';
import { parseStockFileDetailed } from '@/lib/import/parse-stock-file';
import {
  IMPORT_BLOCKING_COPY,
  MANUAL_IMPORT_GATE_CSV_FILENAME,
  RELIABILITY_MANUAL_IMPORT_GATE_PRODUCT,
  assertManualImportPreviewGate,
  assertPersistedManualImport,
  assertPersistedOpeningStock,
  classifyManualImportSubmit,
  isVacuousImportAbsencePass,
  manualImportGateCsv,
  zeroRowImportCsv,
} from './manual-import-gate';

const validPreview = {
  uploadedCsv: true,
  fileNameAccepted: true,
  fileName: MANUAL_IMPORT_GATE_CSV_FILENAME,
  mode: 'CATALOGUE' as const,
  parsedRowCount: 1,
  readyRowCount: 1,
  confirmEnabled: true,
  identityVisible: true,
  visibleBlockingCopy: [] as string[],
  parseError: null,
};

function csvFile(contents: string, name: string) {
  const file = new File([contents], name, { type: 'text/csv' });
  if (typeof file.text !== 'function') {
    Object.defineProperty(file, 'text', {
      configurable: true,
      value: async () => contents,
    });
  }
  return file;
}

describe('manual import gate identity', () => {
  it('pins the P104 catalogue-gate CSV identity', () => {
    expect(RELIABILITY_MANUAL_IMPORT_GATE_PRODUCT).toEqual({
      name: 'Reliability Manual Import Gate',
      sku: 'REL-IMP-P104-01',
      barcode: 'RELIMPP10401',
      sellingPrice: '4.00',
      defaultCost: '2.00',
    });
    expect(MANUAL_IMPORT_GATE_CSV_FILENAME).toBe(
      'reliability-manual-import-p104-rel-imp-p104-01.csv',
    );
    expect(manualImportGateCsv()).toContain('REL-IMP-P104-01');
    expect(manualImportGateCsv()).toContain('Reliability Manual Import Gate');
    expect(zeroRowImportCsv().trim().split(/\r?\n/).length).toBe(1);
  });

  it('parses REL-IMP-P104-01 through the real CSV parser', async () => {
    const file = csvFile(manualImportGateCsv(), MANUAL_IMPORT_GATE_CSV_FILENAME);
    const parsed = await parseStockFileDetailed(file);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]?.sku).toBe('REL-IMP-P104-01');
    expect(parsed.rows[0]?.name).toBe('Reliability Manual Import Gate');
    expect(parsed.rows[0]?.errors).toEqual([]);
  });
});

describe('vacuous absence is not a pass', () => {
  it('treats visit-only missing “No products yet.” as the old vacuous pass', () => {
    expect(
      isVacuousImportAbsencePass({
        visitedImportStock: true,
        uploadedCsv: false,
        blockingCopyAbsent: true,
      }),
    ).toBe(true);
    expect(
      isVacuousImportAbsencePass({
        visitedImportStock: true,
        uploadedCsv: true,
        blockingCopyAbsent: true,
      }),
    ).toBe(false);
  });

  it('fails when the erroneous empty state is visible after a valid CSV', () => {
    expect(() =>
      assertManualImportPreviewGate({
        ...validPreview,
        visibleBlockingCopy: [IMPORT_BLOCKING_COPY.noProductsYet],
      }),
    ).toThrow(/No products yet/);
  });

  it('passes a valid CSV preview with ready rows and Confirm enabled', () => {
    expect(() => assertManualImportPreviewGate(validPreview)).not.toThrow();
  });

  it('fails a zero-row CSV (no parsed rows / no-product-rows copy)', () => {
    expect(() =>
      assertManualImportPreviewGate({
        ...validPreview,
        parsedRowCount: 0,
        readyRowCount: 0,
        confirmEnabled: false,
        identityVisible: false,
        parseError: IMPORT_BLOCKING_COPY.noProductRows,
        visibleBlockingCopy: [IMPORT_BLOCKING_COPY.noProductRows],
      }),
    ).toThrow(/had no product rows|zero rows/i);
  });
});

describe('already-imported / partial rerun', () => {
  const completedRun = {
    fileName: MANUAL_IMPORT_GATE_CSV_FILENAME,
    status: 'COMPLETED',
    rowsParsed: 1,
    rowsImported: 1,
  };

  it('matches ProductImport by exact canonical filename, not substring', () => {
    expect(() =>
      assertPersistedManualImport({
        gateProducts: [{ sku: 'REL-IMP-P104-01', name: 'Reliability Manual Import Gate' }],
        importRuns: [
          {
            fileName: 'reliability-catalogue.csv',
            status: 'COMPLETED',
            rowsParsed: 1,
            rowsImported: 1,
          },
        ],
      }),
    ).toThrow(/Import complete|matching COMPLETED ProductImport|fileName/i);
    expect(() =>
      assertPersistedManualImport({
        gateProducts: [{ sku: 'REL-IMP-P104-01', name: 'Reliability Manual Import Gate' }],
        importRuns: [
          {
            fileName: `prefix-${MANUAL_IMPORT_GATE_CSV_FILENAME}`,
            status: 'COMPLETED',
            rowsParsed: 1,
            rowsImported: 1,
          },
        ],
      }),
    ).toThrow(/Import complete|matching COMPLETED ProductImport|fileName/i);
    expect(() =>
      assertPersistedManualImport({
        gateProducts: [{ sku: 'REL-IMP-P104-01', name: 'Reliability Manual Import Gate' }],
        importRuns: [completedRun],
      }),
    ).not.toThrow();
  });

  it('requires a matching COMPLETED ProductImport, not an in-session heading', () => {
    expect(() =>
      assertPersistedManualImport({
        gateProducts: [{ sku: 'REL-IMP-P104-01', name: 'Reliability Manual Import Gate' }],
        importRuns: [],
      }),
    ).toThrow(/Import complete/);
    expect(() =>
      assertPersistedManualImport({
        gateProducts: [{ sku: 'REL-IMP-P104-01', name: 'Reliability Manual Import Gate' }],
        importRuns: [completedRun],
      }),
    ).not.toThrow();
  });

  it('creates when the identity is absent after a genuine parse', () => {
    expect(
      classifyManualImportSubmit({
        tableRowCount: 0,
        uploadedCsv: true,
        parsedRowCount: 1,
        importRuns: [],
      }).decision,
    ).toBe('create');
  });

  it('resumes when unique row + matching ProductImport exist; does not fabricate a submit', () => {
    expect(
      classifyManualImportSubmit({
        tableRowCount: 1,
        uploadedCsv: true,
        parsedRowCount: 1,
        importRuns: [completedRun],
      }),
    ).toMatchObject({ decision: 'resume' });
  });

  it('fails if the catalogue row exists without import-run evidence', () => {
    expect(
      classifyManualImportSubmit({
        tableRowCount: 1,
        uploadedCsv: true,
        parsedRowCount: 1,
        importRuns: [],
      }).decision,
    ).toBe('fail');
  });

  it('fails a partial rerun that never uploaded a CSV', () => {
    expect(
      classifyManualImportSubmit({
        tableRowCount: 1,
        uploadedCsv: false,
        parsedRowCount: 0,
        importRuns: [completedRun],
      }).decision,
    ).toBe('fail');
  });

  it('fails duplicate persisted products', () => {
    expect(
      classifyManualImportSubmit({
        tableRowCount: 2,
        uploadedCsv: true,
        parsedRowCount: 1,
        importRuns: [completedRun],
      }).decision,
    ).toBe('fail');
  });
});

describe('persisted opening stock', () => {
  const movement = {
    productMatchesQa: true,
    storeId: 'store-1',
    productId: 'prod-1',
    qtyBase: 1,
    type: 'OPENING',
    referenceType: 'OPENING_BALANCE_INVENTORY',
  };

  it('requires movement store/product/qty plus opening-equity journal', () => {
    expect(() =>
      assertPersistedOpeningStock({
        movements: [movement],
        openingJournals: [{ referenceType: 'OPENING_BALANCE_INVENTORY' }],
        openingCapitalPence: 0,
      }),
    ).not.toThrow();
  });

  it('does not accept an in-session heading substitute (missing journal or store)', () => {
    expect(() =>
      assertPersistedOpeningStock({
        movements: [movement],
        openingJournals: [],
        openingCapitalPence: 0,
      }),
    ).toThrow(/opening equity/);
    expect(() =>
      assertPersistedOpeningStock({
        movements: [{ ...movement, storeId: null }],
        openingJournals: [{ referenceType: 'OPENING_BALANCE_INVENTORY' }],
        openingCapitalPence: 0,
      }),
    ).toThrow(/storeId/);
  });
});
