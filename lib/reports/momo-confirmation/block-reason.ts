/** Returned and void sales stay visible, but confirmation is refused on the server. */
export function momoConfirmationSaleBlockReason(saleStatus: string): string | null {
  if (saleStatus === 'RETURNED') {
    return 'This sale was returned, so confirmation is blocked. Do not confirm. The receipt stays listed for investigation.';
  }
  if (saleStatus === 'VOID') {
    return 'This sale was voided, so confirmation is blocked. Do not confirm. The receipt stays listed for investigation.';
  }
  return null;
}
