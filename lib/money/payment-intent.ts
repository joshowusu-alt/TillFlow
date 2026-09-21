/** Success redirect that names the record (`paid`) and this payment (`pay`), so the next intention rotates. */
export function paymentIntentRedirect(returnTo: string, recordId: string, paymentId?: string | null) {
  const sep = returnTo.includes('?') ? '&' : '?';
  const paid = `paid=${encodeURIComponent(recordId)}`;
  const pay = paymentId ? `&pay=${encodeURIComponent(paymentId)}` : '';
  return `${returnTo}${sep}${paid}${pay}`;
}
