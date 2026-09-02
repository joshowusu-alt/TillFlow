/**
 * Catalogue-gate manual import: REL-IMP-P104-01.
 *
 * Visiting /settings/import-stock and observing that “No products yet.” is
 * absent is not validation. A valid CSV must be attached, parsed, previewed,
 * and either submitted (first run) or resumed from persisted ProductImport
 * evidence (partial rerun). Never fabricate Import complete! without a submit.
 */
export const RELIABILITY_MANUAL_IMPORT_GATE_PRODUCT = {
  name: 'Reliability Manual Import Gate',
  sku: 'REL-IMP-P104-01',
  barcode: 'RELIMPP10401',
  sellingPrice: '4.00',
  defaultCost: '2.00',
} as const;

export const MANUAL_IMPORT_GATE_CSV_FILENAME =
  'reliability-manual-import-p104-rel-imp-p104-01.csv';

export const IMPORT_BLOCKING_COPY = {
  noProductsYet: 'No products yet.',
  noProductRows: 'The file had no product rows. Check the file and try again.',
  noReadyRows: 'No ready rows to import.',
} as const;

export type ManualImportSubmitDecision = 'create' | 'resume' | 'fail';

export type ManualImportRunHit = {
  fileName?: string | null;
  status?: string | null;
  rowsParsed?: number;
  rowsImported?: number;
};

export type ManualImportPreviewEvidence = {
  uploadedCsv: boolean;
  fileNameAccepted: boolean;
  fileName?: string;
  mode: 'CATALOGUE' | 'OPENING_STOCK' | 'PURCHASES' | null;
  parsedRowCount: number;
  readyRowCount: number;
  confirmEnabled: boolean;
  identityVisible: boolean;
  visibleBlockingCopy: string[];
  parseError?: string | null;
};

export type ManualImportSubmitInput = {
  tableRowCount: number;
  uploadedCsv: boolean;
  parsedRowCount: number;
  importRuns: ManualImportRunHit[];
};

function matchingImportRuns(runs: ManualImportRunHit[]) {
  return runs.filter((run) => {
    const status = (run.status ?? '').toUpperCase();
    const parsed = run.rowsParsed ?? 0;
    const imported = run.rowsImported ?? 0;
    return (
      run.fileName === MANUAL_IMPORT_GATE_CSV_FILENAME &&
      status === 'COMPLETED' &&
      parsed > 0 &&
      imported >= 1
    );
  });
}

export function assertPersistedManualImport(input: {
  gateProducts: Array<{ sku?: string | null; name?: string }>;
  importRuns: ManualImportRunHit[];
}) {
  if (input.gateProducts.length !== 1) {
    throw new Error(
      `Catalogue gate blocked at import: expected one persisted ${RELIABILITY_MANUAL_IMPORT_GATE_PRODUCT.sku}, found ${input.gateProducts.length}.`,
    );
  }
  const completed = matchingImportRuns(input.importRuns);
  if (completed.length !== 1) {
    throw new Error(
      `Catalogue gate blocked at import: expected one COMPLETED ProductImport for ${MANUAL_IMPORT_GATE_CSV_FILENAME} (rowsParsed>0, rowsImported>=1), found ${completed.length}. In-session “Import complete!” is not evidence.`,
    );
  }
}

/** Old broken gate: visit + absence of copy, no CSV. Must never be treated as pass. */
export function isVacuousImportAbsencePass(input: {
  visitedImportStock: boolean;
  uploadedCsv: boolean;
  blockingCopyAbsent: boolean;
}) {
  return input.visitedImportStock && input.blockingCopyAbsent && !input.uploadedCsv;
}

export function assertManualImportPreviewGate(evidence: ManualImportPreviewEvidence) {
  if (!evidence.uploadedCsv) {
    throw new Error(
      'Catalogue gate blocked at import: CSV was not attached. Visiting import-stock is not enough.',
    );
  }
  if (evidence.mode !== 'CATALOGUE') {
    throw new Error(
      `Catalogue gate blocked at import: expected Product catalogue mode, got ${evidence.mode}.`,
    );
  }
  if (!evidence.fileNameAccepted) {
    throw new Error('Catalogue gate blocked at import: uploaded filename was not accepted.');
  }
  if (
    evidence.fileName &&
    evidence.fileName !== MANUAL_IMPORT_GATE_CSV_FILENAME
  ) {
    throw new Error(
      `Catalogue gate blocked at import: expected ${MANUAL_IMPORT_GATE_CSV_FILENAME}, got ${evidence.fileName}.`,
    );
  }
  const blocking = evidence.visibleBlockingCopy.filter(Boolean);
  if (blocking.includes(IMPORT_BLOCKING_COPY.noProductsYet)) {
    throw new Error(
      'Catalogue gate blocked at import: “No products yet.” appeared after a valid file was attached.',
    );
  }
  if (blocking.includes(IMPORT_BLOCKING_COPY.noProductRows) || evidence.parseError === IMPORT_BLOCKING_COPY.noProductRows) {
    throw new Error('Catalogue gate blocked at import: “The file had no product rows” is visible.');
  }
  if (blocking.includes(IMPORT_BLOCKING_COPY.noReadyRows)) {
    throw new Error('Catalogue gate blocked at import: “No ready rows to import” is visible.');
  }
  if (evidence.parsedRowCount <= 0) {
    throw new Error('Catalogue gate blocked at import: zero rows were parsed.');
  }
  if (evidence.readyRowCount <= 0) {
    throw new Error('Catalogue gate blocked at import: parsed preview has no ready product rows.');
  }
  if (!evidence.identityVisible) {
    throw new Error(
      `Catalogue gate blocked at import: ${RELIABILITY_MANUAL_IMPORT_GATE_PRODUCT.sku} / ${RELIABILITY_MANUAL_IMPORT_GATE_PRODUCT.name} not visible in ready-row preview.`,
    );
  }
  if (!evidence.confirmEnabled) {
    throw new Error('Catalogue gate blocked at import: Confirm Import stayed disabled.');
  }
}

export function classifyManualImportSubmit(input: ManualImportSubmitInput): {
  decision: ManualImportSubmitDecision;
  reason: string;
} {
  if (!input.uploadedCsv || input.parsedRowCount <= 0) {
    return {
      decision: 'fail',
      reason: 'CSV upload/parse was not exercised; cannot classify import submit.',
    };
  }
  if (input.tableRowCount < 0) {
    return { decision: 'fail', reason: 'import identity table count is invalid' };
  }
  if (input.tableRowCount > 1) {
    return {
      decision: 'fail',
      reason: `${input.tableRowCount} persisted products share ${RELIABILITY_MANUAL_IMPORT_GATE_PRODUCT.sku}.`,
    };
  }
  const completed = matchingImportRuns(input.importRuns);
  if (input.tableRowCount === 0) {
    if (completed.length > 0) {
      return {
        decision: 'fail',
        reason: 'ProductImport history exists but the catalogue row is missing.',
      };
    }
    return { decision: 'create', reason: 'gate identity absent; submit Confirm Import' };
  }
  if (completed.length === 1) {
    return {
      decision: 'resume',
      reason: 'persisted ProductImport + unique catalogue row; do not re-submit',
    };
  }
  if (completed.length > 1) {
    return {
      decision: 'fail',
      reason: `${completed.length} completed ProductImport runs for the gate CSV.`,
    };
  }
  return {
    decision: 'fail',
    reason:
      'Catalogue row exists without matching ProductImport evidence. Do not fabricate a fresh import.',
  };
}

export function assertPersistedOpeningStock(input: {
  movements: Array<{
    productMatchesQa: boolean;
    storeId?: string | null;
    productId?: string | null;
    qtyBase: number;
    type?: string | null;
    referenceType?: string | null;
  }>;
  openingJournals: Array<{ referenceType?: string | null }>;
  openingCapitalPence: number;
  expectedQtyBase?: number;
}) {
  const expectedQty = input.expectedQtyBase ?? 1;
  const qa = input.movements.filter((row) => row.productMatchesQa);
  if (qa.length !== 1) {
    throw new Error(
      `Catalogue gate blocked at opening stock: expected exactly one persisted QA movement, found ${qa.length}.`,
    );
  }
  const row = qa[0]!;
  if (!row.storeId) {
    throw new Error('Catalogue gate blocked at opening stock: movement storeId is missing.');
  }
  if (!row.productId) {
    throw new Error('Catalogue gate blocked at opening stock: movement productId is missing.');
  }
  if ((row.type ?? '').toUpperCase() !== 'OPENING') {
    throw new Error(`Catalogue gate blocked at opening stock: type=${row.type}`);
  }
  if ((row.referenceType ?? '').toUpperCase() !== 'OPENING_BALANCE_INVENTORY') {
    throw new Error(`Catalogue gate blocked at opening stock: referenceType=${row.referenceType}`);
  }
  if (row.qtyBase !== expectedQty) {
    throw new Error(
      `Catalogue gate blocked at opening stock: qty ${row.qtyBase} !== expected ${expectedQty}.`,
    );
  }
  if ((input.openingCapitalPence ?? 0) !== 0) {
    throw new Error(
      `Catalogue gate blocked at opening stock: openingCapitalPence=${input.openingCapitalPence}; cash capital is forbidden.`,
    );
  }
  const equity = input.openingJournals.filter(
    (journal) => (journal.referenceType ?? '').toUpperCase() === 'OPENING_BALANCE_INVENTORY',
  );
  if (equity.length < 1) {
    throw new Error(
      'Catalogue gate blocked at opening stock: no OPENING_BALANCE_INVENTORY journal (opening equity) persisted.',
    );
  }
}

export function manualImportGateCsv() {
  const product = RELIABILITY_MANUAL_IMPORT_GATE_PRODUCT;
  return [
    'name,sku,barcode,category,selling_price,cost_price,base_unit,pack_unit,pack_size,supplier_name,reorder_point,storefront_published,image_url,notes',
    `${product.name},${product.sku},${product.barcode},Drinks,${product.sellingPrice},${product.defaultCost},Piece,,,,,yes,,`,
  ].join('\r\n');
}

export function zeroRowImportCsv() {
  return 'name,sku,barcode,category,selling_price,cost_price,base_unit,pack_unit,pack_size,supplier_name,reorder_point,storefront_published,image_url,notes\r\n';
}
