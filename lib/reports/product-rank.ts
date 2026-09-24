import { allocateInvoiceDiscountHalfUp } from '@/lib/reports/margin-line';

/**
 * Product sales rank reconciles to recognised SalesInvoice.totalPence.
 * Line totals already store line discounts, promo discounts, and line tax.
 * The invoice-level gap (order discount and scaled VAT) is allocated in integer
 * half-up shares. Not a margin figure and not stamped authoritative v1.
 */
export type ProductRankLine = {
  productId: string;
  lineSubtotalPence: number;
  lineDiscountPence: number;
  promoDiscountPence: number;
  lineVatPence: number;
  lineNhilComponentPence?: number;
  lineGetFundComponentPence?: number;
  lineVatComponentPence?: number;
  lineTotalPence: number;
};

export type ProductRankInvoice = {
  paymentStatus: string;
  discountPence: number;
  vatPence: number;
  nhilComponentPence?: number;
  getFundComponentPence?: number;
  totalPence: number;
  lines: ProductRankLine[];
};

export type ProductRankResult = {
  ok: boolean;
  differencePence: number;
  lines: Array<{ productId: string; amountPence: number }>;
};

export function rankRecognisedProductSales(invoice: ProductRankInvoice): ProductRankResult {
  if (invoice.paymentStatus === 'RETURNED' || invoice.paymentStatus === 'VOID') {
    return {
      ok: true,
      differencePence: 0,
      lines: invoice.lines.map((line) => ({ productId: line.productId, amountPence: 0 })),
    };
  }

  const stored = invoice.lines.reduce((sum, line) => sum + line.lineTotalPence, 0);
  const gap = invoice.totalPence - stored;
  const hasPositive = invoice.lines.some((line) => line.lineTotalPence > 0);
  if (gap !== 0 && !hasPositive) {
    return { ok: false, differencePence: gap, lines: [] };
  }

  const shares = allocateInvoiceDiscountHalfUp(
    invoice.lines.map((line) => (line.lineTotalPence > 0 ? line.lineTotalPence : 0)),
    gap,
  );
  const lines = invoice.lines.map((line, index) => ({
    productId: line.productId,
    amountPence: line.lineTotalPence + shares[index],
  }));
  const ranked = lines.reduce((sum, line) => sum + line.amountPence, 0);
  if (ranked !== invoice.totalPence) {
    return { ok: false, differencePence: invoice.totalPence - ranked, lines: [] };
  }
  return { ok: true, differencePence: 0, lines };
}
