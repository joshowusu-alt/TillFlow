import { formatMoney } from '@/lib/format';
import { pendingMomoReceipt, type TenderEvidence } from '@/lib/payments/pending-momo-receipt';

export function MomoPendingQualification({
  invoiceStatus,
  payments,
  currency,
}: {
  invoiceStatus: string;
  payments: TenderEvidence[];
  currency: string;
}) {
  const pending = pendingMomoReceipt({ invoiceStatus, payments });
  if (!pending.label) return null;
  return (
    <p className="mt-1 text-xs font-medium text-amber-900" data-testid="momo-confirmation-pending">
      {pending.label} · {formatMoney(pending.pendingMomoPence, currency)}
    </p>
  );
}
