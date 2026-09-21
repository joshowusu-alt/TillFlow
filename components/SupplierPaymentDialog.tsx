'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { formatMoney } from '@/lib/format';
import RemainingBalance from '@/components/RemainingBalance';
import SupplierPaymentForm, { type OpenTillOption } from '@/components/SupplierPaymentForm';

type Props = {
  invoiceId: string;
  purchaseNumber: string;
  supplierName: string;
  storeName: string;
  storeId: string;
  today: string;
  currency: string;
  originalPence: number;
  paidPence: number;
  remainingPence: number;
  returnTo?: string;
  openTills?: OpenTillOption[];
};

export default function SupplierPaymentDialog({
  invoiceId,
  purchaseNumber,
  supplierName,
  storeName,
  storeId,
  today,
  currency,
  originalPence,
  paidPence,
  remainingPence,
  returnTo,
  openTills = [],
}: Props) {
  const [open, setOpen] = useState(false);
  // The dialog is portalled to <body>: the trigger lives inside a table row whose
  // hover transform would otherwise become the containing block of the
  // `fixed` overlay, leaving the dialog under later page content and its
  // "Record payment" button unreachable by pointer.
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setPortalTarget(document.body);
  }, []);
  const tillLabel = openTills.length === 1 ? openTills[0].tillName : 'the selected till';
  const confirmation = useMemo(
    () => `Record a cash supplier payment from ${tillLabel} — ${storeName}.`,
    [tillLabel, storeName],
  );

  return (
    <div>
      <button type="button" className="btn-primary text-xs sm:text-sm" onClick={() => setOpen(true)}>
        Record payment
      </button>
      {open && portalTarget ? createPortal(
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`Supplier payment ${purchaseNumber}`}
          data-supplier-payment-dialog={invoiceId}
        >
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-black/40">
                  Supplier payment
                </div>
                <h3 className="mt-1 text-lg font-display font-semibold">{purchaseNumber}</h3>
                <p className="text-sm text-black/60">{supplierName}</p>
              </div>
              <button type="button" className="btn-ghost text-xs" onClick={() => setOpen(false)}>
                Close
              </button>
            </div>
            <div className="mt-3 rounded-xl border border-accent/20 bg-accent/5 px-3 py-2 text-sm">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">Recording in</div>
              <div className="font-semibold">{storeName}</div>
              <div className="mt-1 text-xs text-black/60">{confirmation}</div>
            </div>
            <RemainingBalance
              className="mt-4"
              amountPence={originalPence}
              paidPence={paidPence}
              currency={currency}
            />
            <div className="mt-4">
              <SupplierPaymentForm
                invoiceId={invoiceId}
                today={today}
                returnTo={returnTo}
                openTills={openTills}
                storeId={storeId}
                storeName={storeName}
                formClassName="grid gap-3"
                amountPlaceholder={formatMoney(remainingPence, currency).replace(/[^\d.]/g, '') || '0.00'}
              />
            </div>
          </div>
        </div>,
        portalTarget,
      ) : null}
    </div>
  );
}
