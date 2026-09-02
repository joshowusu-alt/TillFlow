/**
 * Preview reliability original defects. Owner evidence, not a hosted rerun.
 * Registration-helper fill failures are test-infrastructure debt and must not
 * reopen an application defect that owner review already closed.
 */

export const RELIABILITY_PREVIEW_DEFECT_1 = {
  id: 'new-business-manual-product-routing',
  verdict: 'PREVIEW VALIDATED — NEW-BUSINESS MANUAL PRODUCT ROUTING FIXED',
  previewSha: '17960fd49729882c03fd09df1c2f38973ed64b44',
  evidence: 'owner hosted manual review on dedicated account 2',
  doNotRerunOnboardingManual: true,
  doNotCreateAnotherOnboardingIdentity: true,
  registrationHelperIsTestInfrastructureDebt: true,
} as const;

export const RELIABILITY_PREVIEW_DEFECT_2 = {
  id: 'till3-sale-shift-totals-remain-zero',
  verdict: 'PREVIEW VALIDATED — TILL 3 ACCOUNTING FIXED',
  gateProject: 'reliability-till3-accounting',
  symptom: 'TILL 3 SALE COMPLETES BUT SHIFT CASH/TENDER TOTALS REMAIN ZERO',
  hostedSaleCompletedOnSha: '4a36d52206bc8e67a26f8c01fa3a5b670b0814d1',
  evidence: 'owner hosted INV-000001 split sale on Till 3 with invoice/shift linkage, CASH_SALE, non-zero Shift Reconciliation',
  doNotCreateAnotherSale: true,
  doNotReusePaymentRefs: true,
  doNotCloseShift: true,
  evidenceOnly: true,
} as const;
