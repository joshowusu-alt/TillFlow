/**
 * Catalogue-gate manual product entry: REL-MAN-P104-01.
 *
 * Onboarding “Add a product manually” lands on /products#product-create.
 * Native hash used to scroll to a closed <details> while “No products yet.”
 * stayed visible. The gate must prove the form opened without clicking
 * the summary.
 */
export const RELIABILITY_MANUAL_ENTRY_PRODUCT = {
  name: 'Reliability Manual Entry Gate',
  sku: 'REL-MAN-P104-01',
  barcode: 'RELMANP10401',
  sellingPrice: '3.00',
  defaultCost: '1.50',
} as const;

export type ManualEntrySubmitDecision = 'create' | 'resume' | 'fail';

export function classifyManualEntrySubmit(tableRowCount: number): {
  decision: ManualEntrySubmitDecision;
  reason: string;
} {
  if (tableRowCount < 0) {
    return { decision: 'fail', reason: 'manual-entry identity table count is invalid' };
  }
  if (tableRowCount > 1) {
    return {
      decision: 'fail',
      reason: `${tableRowCount} persisted products share ${RELIABILITY_MANUAL_ENTRY_PRODUCT.sku}.`,
    };
  }
  if (tableRowCount === 1) {
    return {
      decision: 'resume',
      reason: 'unique manual-entry product already persisted; do not create a duplicate',
    };
  }
  return { decision: 'create', reason: 'manual-entry identity absent; submit Create product' };
}

export function assertPersistedManualEntry(input: {
  products: Array<{ sku?: string | null; name?: string }>;
}) {
  if (input.products.length !== 1) {
    throw new Error(
      `Catalogue gate blocked at manual entry: expected one persisted ${RELIABILITY_MANUAL_ENTRY_PRODUCT.sku}, found ${input.products.length}.`,
    );
  }
  const row = input.products[0]!;
  if (row.sku !== RELIABILITY_MANUAL_ENTRY_PRODUCT.sku) {
    throw new Error(
      `Catalogue gate blocked at manual entry: expected sku ${RELIABILITY_MANUAL_ENTRY_PRODUCT.sku}, got ${row.sku}.`,
    );
  }
  if (row.name !== RELIABILITY_MANUAL_ENTRY_PRODUCT.name) {
    throw new Error(
      `Catalogue gate blocked at manual entry: expected name ${RELIABILITY_MANUAL_ENTRY_PRODUCT.name}, got ${row.name}.`,
    );
  }
}

export function assertManualEntryFormNotTrapped(input: {
  detailsOpen: boolean;
  formVisible: boolean;
  nameFieldVisible: boolean;
  summaryClicked: boolean;
}) {
  if (input.summaryClicked) {
    throw new Error(
      'Catalogue gate blocked at manual entry: opened the form by clicking the closed details summary. The hash must open it.',
    );
  }
  if (!input.detailsOpen) {
    throw new Error(
      'Catalogue gate blocked at manual entry: #product-create left the Add product details closed (owner “No products yet” trap).',
    );
  }
  if (!input.formVisible || !input.nameFieldVisible) {
    throw new Error(
      'Catalogue gate blocked at manual entry: Add product form was not visible after #product-create.',
    );
  }
}
