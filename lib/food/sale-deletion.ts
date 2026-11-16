import { formatMoney } from '@/lib/format';
import { confirmedTenderMethods, isPendingMomo } from '@/lib/payments/receipt-ledger';

export function deletedSaleLabel(saleReturn: { managerApprovalMode: string | null; reasonCode: string | null } | null) {
  if (saleReturn?.managerApprovalMode !== 'OWNER_DELETE') return null;
  return saleReturn.reasonCode === 'TEST_SALE' ? 'Deleted · test sale' : 'Deleted · mistake';
}

export function saleDeletionPreview(sale: {
  tillId: string | null;
  shift: { status: string; tillId: string; till: { active: boolean; name: string } } | null;
  payments: { method: string; amountPence: number; status?: string | null }[];
}, currency: string) {
  const methods = confirmedTenderMethods(sale.payments);
  if (methods.length > 1) return { mixedTender: true, refund: null };
  const method = methods[0];
  if (!method) return { mixedTender: false, refund: 'No payment to refund.' };
  const amount = formatMoney(sale.payments.reduce((total, payment) =>
    payment.method === method && !isPendingMomo(payment) ? total + payment.amountPence : total, 0), currency);

  if (method === 'CASH') {
    const shift = sale.shift;
    if (sale.tillId && shift?.tillId === sale.tillId && shift.status === 'OPEN' && shift.till.active) {
      return { mixedTender: false, refund: `${amount} comes off ${shift.till.name}’s cash.` };
    }
    const detail = shift?.status === 'CLOSED' ? ' (till already closed)' : '';
    return { mixedTender: false, refund: `${amount} comes off cash on hand${detail}.` };
  }

  const label = method === 'MOBILE_MONEY' ? 'MoMo' : method === 'CARD' ? 'card' : 'bank transfer';
  return { mixedTender: false, refund: `${amount} ${label} refund recorded.` };
}
