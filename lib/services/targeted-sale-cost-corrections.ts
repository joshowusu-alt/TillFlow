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
  /**
   * The unit cost recorded in the matching StockMovement (type=SALE) for this
   * invoice+product pair, if one exists.  When present and > 0, this is used
   * as the stable correction reference instead of the live `currentProductCostBasePence`.
   * This prevents drift: after a correction both `lineCostPence` and the movement cost
   * are aligned, so the line will not re-appear as "needs correction" just because
   * the product's setup cost is later changed.
   */
  movementUnitCostBasePence?: number | null;
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

  // Prefer the stable StockMovement cost (updated atomically with lineCostPence during every
  // correction) over the mutable product setup cost.  This prevents drift: once a line has been
  // corrected the movement and lineCostPence agree, so changing defaultCostBasePence later will
  // not re-flag the line.  Fall back to currentProductCostBasePence only when no movement exists
  // (genuine pre-movement-data gap) — in that case the comparison anchors to the current
  // product cost as the best available reference.
  const correctedUnitCostBasePence =
    input.movementUnitCostBasePence != null && input.movementUnitCostBasePence > 0
      ? input.movementUnitCostBasePence
      : input.currentProductCostBasePence;

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