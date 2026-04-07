export type HistoricalSaleLineCandidateInput = {
  id: string;
  salesInvoiceId: string;
  transactionNumber: string | null;
  createdAt: Date;
  productId: string;
  productName: string;
  sku: string | null;
  unitName: string;
  qtyInUnit: number;
  qtyBase: number;
  unitPricePence: number;
  lineSubtotalPence: number;
  lineTotalPence: number;
  lineCostPence: number;
  currentProductCostBasePence: number;
};

export type HistoricalSaleLineCandidate = HistoricalSaleLineCandidateInput & {
  storedUnitCostBasePence: number;
  correctedUnitCostBasePence: number;
  correctedLineCostPence: number;
  profitBeforePence: number;
  profitAfterPence: number;
  marginBeforePercent: number;
  marginAfterPercent: number;
  profitDeltaPence: number;
  belowCostBefore: boolean;
  belowCostAfter: boolean;
  needsCorrection: boolean;
};

function toMarginPercent(revenuePence: number, profitPence: number) {
  if (revenuePence <= 0) return 0;
  return (profitPence / revenuePence) * 100;
}

export function buildHistoricalSaleLineCandidate(
  input: HistoricalSaleLineCandidateInput,
): HistoricalSaleLineCandidate {
  const storedUnitCostBasePence = input.qtyBase > 0
    ? Math.round(input.lineCostPence / input.qtyBase)
    : 0;
  const correctedUnitCostBasePence = input.currentProductCostBasePence;
  const correctedLineCostPence = correctedUnitCostBasePence * input.qtyBase;
  const effectiveLineCostPence = input.lineCostPence > 0
    ? input.lineCostPence
    : input.currentProductCostBasePence * input.qtyBase;
  const profitBeforePence = input.lineSubtotalPence - effectiveLineCostPence;
  const profitAfterPence = input.lineSubtotalPence - correctedLineCostPence;

  return {
    ...input,
    storedUnitCostBasePence,
    correctedUnitCostBasePence,
    correctedLineCostPence,
    profitBeforePence,
    profitAfterPence,
    marginBeforePercent: toMarginPercent(input.lineSubtotalPence, profitBeforePence),
    marginAfterPercent: toMarginPercent(input.lineSubtotalPence, profitAfterPence),
    profitDeltaPence: profitAfterPence - profitBeforePence,
    belowCostBefore: profitBeforePence < 0,
    belowCostAfter: profitAfterPence < 0,
    needsCorrection: input.lineCostPence !== correctedLineCostPence,
  };
}

export function buildInvoiceGrossMarginMap(
  lines: Array<{ salesInvoiceId: string; lineSubtotalPence: number; lineCostPence: number }>,
) {
  const map = new Map<string, number>();

  for (const line of lines) {
    map.set(
      line.salesInvoiceId,
      (map.get(line.salesInvoiceId) ?? 0) + (line.lineSubtotalPence - line.lineCostPence),
    );
  }

  return map;
}