'use client';

import { useEffect, useRef, useState } from 'react';
import { formatMoney, formatDateTime } from '@/lib/format';
import { openCashDrawer, isCashDrawerEnabled } from '@/lib/hardware';
import { buildEscPosReceipt, toHexString } from '@/lib/escpos';
import { ensureQzConnection, printRawEscPos } from '@/lib/qz';

type ReceiptClientProps = {
  business: {
    name: string;
    currency: string;
    vatEnabled: boolean;
    vatNumber?: string | null;
    receiptTemplate?: string | null;
    printMode?: string | null;
    printerName?: string | null;
  };
  store: { name: string };
  cashier: { name: string };
  customer?: { name: string; phone?: string | null } | null;
  invoice: {
    id: string;
    createdAt: string;
    subtotalPence: number;
    vatPence: number;
    totalPence: number;
    discountPence?: number;
  };
  payments: { method: string; amountPence: number }[];
  lines: {
    name: string;
    qtyLabel: string;
    unitPricePence: number;
    lineTotalPence: number;
    lineDiscountPence: number;
    promoDiscountPence: number;
  }[];
};

export default function ReceiptClient({
  business,
  store,
  cashier,
  customer,
  invoice,
  lines,
  payments
}: ReceiptClientProps) {
  const [directStatus, setDirectStatus] = useState<'idle' | 'printing' | 'failed' | 'success'>('idle');
  const [directError, setDirectError] = useState<string | null>(null);
  const didPrintRef = useRef(false);
  const template = business.receiptTemplate ?? 'THERMAL_80';
  const printMode = business.printMode ?? 'DIRECT_ESC_POS';
  const cashPaid = payments
    .filter((payment) => payment.method === 'CASH')
    .reduce((sum, payment) => sum + payment.amountPence, 0);
  const cardPaid = payments
    .filter((payment) => payment.method === 'CARD')
    .reduce((sum, payment) => sum + payment.amountPence, 0);
  const transferPaid = payments
    .filter((payment) => payment.method === 'TRANSFER')
    .reduce((sum, payment) => sum + payment.amountPence, 0);
  const lineDiscountTotal = lines.reduce(
    (sum, line) => sum + line.lineDiscountPence + line.promoDiscountPence,
    0
  );

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('lastReceiptId', invoice.id);
      if (cashPaid > 0 && isCashDrawerEnabled()) {
        openCashDrawer().catch(() => null);
      }
    }
  }, [cashPaid, invoice.id]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (didPrintRef.current) return;
    didPrintRef.current = true;

    if (printMode === 'BROWSER_DIALOG') {
      window.print();
      return;
    }

    const directPrint = async () => {
      try {
        setDirectStatus('printing');
        setDirectError(null);
        await ensureQzConnection();
        const bytes = buildEscPosReceipt({
          business,
          store,
          cashier,
          customer,
          invoice,
          lines,
          payments,
          template
        });
        const hex = toHexString(bytes);
        await printRawEscPos(business.printerName ?? null, hex);
        setDirectStatus('success');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Direct print failed.';
        setDirectError(message);
        setDirectStatus('failed');
      }
    };

    directPrint();
  }, [business, cashier, customer, invoice, lines, payments, printMode, store, template]);

  return (
    <div
      className={`receipt mx-auto bg-white p-6 text-sm text-black ${
        template === 'A4' ? 'receipt-a4' : 'receipt-thermal'
      }`}
    >
      <div className="no-print mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500">
            <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div>
            <div className="font-semibold text-emerald-800">Sale Complete!</div>
            <div className="text-xs text-emerald-700">
              {formatMoney(invoice.totalPence, business.currency)} · Receipt #{invoice.id.slice(0, 8)}
            </div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <a href="/pos" className="btn-primary text-xs">
            New Sale
          </a>
          <button
            type="button"
            className="btn-secondary text-xs"
            onClick={() => window.print()}
          >
            Print Receipt
          </button>
          <button
            type="button"
            className="btn-ghost text-xs"
            onClick={() => openCashDrawer().catch(() => null)}
          >
            Open Drawer
          </button>
        </div>
        <div className="mt-3 text-xs text-emerald-700">
          {printMode === 'DIRECT_ESC_POS' ? 'Direct print enabled' : 'Browser print enabled'}
          {directStatus === 'printing' ? ' · Sending to printer…' : null}
          {directStatus === 'success' ? ' · Printed' : null}
          {directStatus === 'failed' ? ' · Direct print failed' : null}
        </div>
      </div>
      {directError ? (
        <div className="no-print mb-4 rounded-xl border border-rose/30 bg-rose/10 px-3 py-2 text-xs text-rose">
          Direct print error: {directError}
        </div>
      ) : null}
      <div className="text-center">
        <h1 className="text-xl font-display font-semibold">{business.name}</h1>
        <p className="text-xs">{store.name}</p>
        {business.vatEnabled ? <p className="text-xs">VAT: {business.vatNumber ?? 'N/A'}</p> : null}
      </div>

      <div className="mt-4 space-y-1 text-xs text-black/60">
        <div>Receipt: {invoice.id.slice(0, 8)}</div>
        <div>Date: {formatDateTime(new Date(invoice.createdAt))}</div>
        <div>Cashier: {cashier.name}</div>
        {customer ? <div>Customer: {customer.name}</div> : null}
        {customer?.phone ? <div>Phone: {customer.phone}</div> : null}
      </div>

      <div className="mt-4 border-t border-black/20 pt-3">
        {lines.map((line, index) => (
          <div key={`${line.name}-${index}`} className="flex justify-between text-xs">
            <div>
              <div className="font-semibold">{line.name}</div>
              <div className="text-black/60">{line.qtyLabel}</div>
            </div>
            <div className="text-right">
              <div>{formatMoney(line.lineTotalPence, business.currency)}</div>
              <div className="text-black/60">{formatMoney(line.unitPricePence, business.currency)}</div>
              {line.lineDiscountPence > 0 || line.promoDiscountPence > 0 ? (
                <div className="text-emerald-700">
                  - {formatMoney(line.lineDiscountPence + line.promoDiscountPence, business.currency)}
                </div>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 border-t border-black/20 pt-3 text-xs">
        <div className="flex justify-between">
          <span>Net subtotal</span>
          <span>{formatMoney(invoice.subtotalPence, business.currency)}</span>
        </div>
        {lineDiscountTotal > 0 ? (
          <div className="flex justify-between text-emerald-700">
            <span>Discounts applied (included)</span>
            <span>{formatMoney(lineDiscountTotal, business.currency)}</span>
          </div>
        ) : null}
        {invoice.discountPence && invoice.discountPence > 0 ? (
          <div className="flex justify-between text-emerald-700">
            <span>Order discount (included)</span>
            <span>{formatMoney(invoice.discountPence, business.currency)}</span>
          </div>
        ) : null}
        {business.vatEnabled ? (
          <div className="flex justify-between">
            <span>VAT</span>
            <span>{formatMoney(invoice.vatPence, business.currency)}</span>
          </div>
        ) : null}
        <div className="flex justify-between font-semibold">
          <span>Total</span>
          <span>{formatMoney(invoice.totalPence, business.currency)}</span>
        </div>
      </div>

      <div className="mt-4 border-t border-black/20 pt-3 text-xs">
        <div className="flex justify-between">
          <span>Paid (cash)</span>
          <span>{formatMoney(cashPaid, business.currency)}</span>
        </div>
        {cardPaid > 0 ? (
          <div className="flex justify-between">
            <span>Paid (card)</span>
            <span>{formatMoney(cardPaid, business.currency)}</span>
          </div>
        ) : null}
        {transferPaid > 0 ? (
          <div className="flex justify-between">
            <span>Paid (transfer)</span>
            <span>{formatMoney(transferPaid, business.currency)}</span>
          </div>
        ) : null}
      </div>

      <div className="mt-6 text-center text-xs text-black/50">Thank you for shopping.</div>
    </div>
  );
}
