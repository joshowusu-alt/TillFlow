/**
 * Shared line-margin evaluation for Wave A callers.
 * Intended margin.line semantics. Not stamped authoritative v1. No effective_from.
 *
 * Cost authority: no persisted field distinguishes an intentional zero from an
 * unfilled default. A stored 0 without explicit fixture evidence is INCOMPLETE_COSTS.
 * A positive lineCostPence is stored-cost evidence. A positive default is used
 * only when the caller proves the line cost is missing.
 */

export type MarginState = 'READY' | 'INCOMPLETE_COSTS';

export type MarginCostEvidence = 'AUTHORITATIVE_ZERO' | 'MISSING';

export type MarginReturnKind =
  | 'NONE'
  | 'FULL_RETURN'
  | 'FULL_VOID'
  | 'PARTIAL_GOODS'
  | 'PAYMENT_ONLY_REFUND'
  | 'EXCHANGE'
  | 'BACKUP_OR_REPLAY'
  | 'UNATTRIBUTABLE';

export type MarginLineInput = {
  lineSubtotalPence: number;
  lineDiscountPence: number;
  promoDiscountPence: number;
  lineCostPence: number;
  qtyBase: number;
  qtyInUnit?: number;
  defaultCostBasePence?: number | null;
  costEvidence?: MarginCostEvidence;
  productId?: string;
  name?: string;
};

export type MarginInvoiceInput = {
  paymentStatus: string;
  discountPence: number;
  lines: MarginLineInput[];
  returnKind?: MarginReturnKind;
};

export type MarginSetResult = {
  state: MarginState;
  recognisedSalesPence: number;
  incompleteLineCount: number;
  grossProfitPence: number | null;
  grossProfitPercent: number | null;
  unsupportedReturn: boolean;
};

const UNSUPPORTED_RETURNS = new Set<MarginReturnKind>([
  'PARTIAL_GOODS',
  'PAYMENT_ONLY_REFUND',
  'EXCHANGE',
  'BACKUP_OR_REPLAY',
  'UNATTRIBUTABLE',
]);

export function lineNetBeforeTaxPence(line: Pick<MarginLineInput, 'lineSubtotalPence' | 'lineDiscountPence' | 'promoDiscountPence'>): number {
  return line.lineSubtotalPence - line.lineDiscountPence - line.promoDiscountPence;
}

/** Integer half-up. Remainder lands on the largest eligible line so the shares sum to discountPence. */
export function allocateInvoiceDiscountHalfUp(lineNets: number[], discountPence: number): number[] {
  const shares = lineNets.map(() => 0);
  if (discountPence === 0 || lineNets.length === 0) return shares;
  const eligible = lineNets
    .map((net, index) => ({ net, index }))
    .filter((row) => row.net > 0);
  const sumNets = eligible.reduce((sum, row) => sum + row.net, 0);
  if (sumNets <= 0) return shares;

  let largestIndex = eligible[0].index;
  for (const row of eligible) {
    const numerator = row.net * discountPence;
    shares[row.index] = Math.floor((numerator + Math.floor(sumNets / 2)) / sumNets);
    if (row.net > lineNets[largestIndex]) largestIndex = row.index;
  }
  const allocated = shares.reduce((sum, share) => sum + share, 0);
  shares[largestIndex] += discountPence - allocated;
  return shares;
}

export type ResolvedLineCost =
  | { authoritative: true; costPence: number }
  | { authoritative: false; costPence: null };

export function resolveAuthoritativeLineCost(line: MarginLineInput): ResolvedLineCost {
  if (line.qtyBase === 0 && (line.qtyInUnit ?? 0) > 0) {
    return { authoritative: false, costPence: null };
  }
  if (line.costEvidence === 'AUTHORITATIVE_ZERO') {
    return { authoritative: true, costPence: 0 };
  }
  if (line.lineCostPence > 0) {
    return { authoritative: true, costPence: line.lineCostPence };
  }
  if (line.costEvidence === 'MISSING' && (line.defaultCostBasePence ?? 0) > 0) {
    return { authoritative: true, costPence: (line.defaultCostBasePence ?? 0) * line.qtyBase };
  }
  return { authoritative: false, costPence: null };
}

function isFullRemoval(invoice: MarginInvoiceInput): boolean {
  const status = invoice.paymentStatus;
  const kind = invoice.returnKind ?? 'NONE';
  if (kind === 'FULL_RETURN') return status === 'RETURNED';
  if (kind === 'FULL_VOID') return status === 'VOID';
  if (kind !== 'NONE') return false;
  return status === 'RETURNED' || status === 'VOID';
}

function isUnsupported(invoice: MarginInvoiceInput): boolean {
  const kind = invoice.returnKind ?? 'NONE';
  if (UNSUPPORTED_RETURNS.has(kind)) return true;
  if ((kind === 'FULL_RETURN' || kind === 'FULL_VOID') && !isFullRemoval(invoice)) return true;
  return false;
}

export type EvaluatedMarginLine = {
  productId: string | null;
  name: string | null;
  revenuePence: number;
  allocatedDiscountPence: number;
  costPence: number | null;
  profitPence: number | null;
  ready: boolean;
  incompleteReason: string | null;
};

export function evaluateMarginLines(invoices: MarginInvoiceInput[]): {
  state: MarginState;
  lines: EvaluatedMarginLine[];
} {
  const lines: EvaluatedMarginLine[] = [];
  let unsupportedReturn = false;
  for (const invoice of invoices) {
    if (isUnsupported(invoice)) unsupportedReturn = true;
    if (isFullRemoval(invoice)) continue;
    if (invoice.paymentStatus === 'RETURNED' || invoice.paymentStatus === 'VOID') continue;
    const nets = invoice.lines.map((line) => lineNetBeforeTaxPence(line));
    const allocated = allocateInvoiceDiscountHalfUp(nets, invoice.discountPence);
    invoice.lines.forEach((line, index) => {
      const revenuePence = nets[index] - allocated[index];
      const cost = resolveAuthoritativeLineCost(line);
      const blocked = !cost.authoritative || isUnsupported(invoice);
      lines.push({
        productId: line.productId ?? null,
        name: line.name ?? null,
        revenuePence,
        allocatedDiscountPence: allocated[index],
        costPence: cost.authoritative ? cost.costPence : null,
        profitPence: blocked || !cost.authoritative ? null : revenuePence - cost.costPence,
        ready: !blocked,
        incompleteReason: blocked ? (isUnsupported(invoice) ? 'UNSUPPORTED_RETURN' : 'INCOMPLETE_COSTS') : null,
      });
    });
  }
  const incompleteLineCount = lines.filter((line) => !line.ready).length;
  return {
    state: !unsupportedReturn && incompleteLineCount === 0 ? 'READY' : 'INCOMPLETE_COSTS',
    lines,
  };
}

export function evaluateMarginSet(invoices: MarginInvoiceInput[]): MarginSetResult {
  let recognisedSalesPence = 0;
  let grossProfitPence = 0;
  let incompleteLineCount = 0;
  let unsupportedReturn = false;
  let sawRecognisedLine = false;

  const evaluated = evaluateMarginLines(invoices);
  for (const invoice of invoices) {
    if (isUnsupported(invoice)) unsupportedReturn = true;
  }
  for (const line of evaluated.lines) {
    sawRecognisedLine = true;
    recognisedSalesPence += line.revenuePence;
    if (!line.ready || line.profitPence == null) {
      incompleteLineCount += 1;
      continue;
    }
    grossProfitPence += line.profitPence;
  }
  if (evaluated.state === 'INCOMPLETE_COSTS') unsupportedReturn = unsupportedReturn || evaluated.lines.some((line) => line.incompleteReason === 'UNSUPPORTED_RETURN');

  const ready = !unsupportedReturn && incompleteLineCount === 0;
  void sawRecognisedLine;
  if (!ready) {
    return {
      state: 'INCOMPLETE_COSTS',
      recognisedSalesPence,
      incompleteLineCount,
      grossProfitPence: null,
      grossProfitPercent: null,
      unsupportedReturn,
    };
  }

  const grossProfitPercent = recognisedSalesPence > 0
    ? Math.round((grossProfitPence / recognisedSalesPence) * 100)
    : 0;

  return {
    state: 'READY',
    recognisedSalesPence,
    incompleteLineCount: 0,
    grossProfitPence,
    grossProfitPercent,
    unsupportedReturn: false,
  };
}
