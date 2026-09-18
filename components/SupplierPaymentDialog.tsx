'use client';

import { useMemo, useState } from 'react';
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
      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
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
        </div>
      ) : null}
    </div>
  );
}
