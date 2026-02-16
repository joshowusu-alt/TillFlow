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
    tinNumber?: string | null;
    phone?: string | null;
    address?: string | null;
    momoNumber?: string | null;
    momoProvider?: string | null;
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
  const momoPaid = payments
    .filter((payment) => payment.method === 'MOBILE_MONEY')
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
        {business.address ? <p className="text-xs">{business.address}</p> : null}
        {business.phone ? <p className="text-xs">Tel: {business.phone}</p> : null}
        {business.vatEnabled ? <p className="text-xs">VAT: {business.vatNumber ?? 'N/A'}</p> : null}
        {business.tinNumber ? <p className="text-xs">TIN: {business.tinNumber}</p> : null}
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
        {momoPaid > 0 ? (
          <div className="flex justify-between">
            <span>Paid (MoMo)</span>
            <span>{formatMoney(momoPaid, business.currency)}</span>
          </div>
        ) : null}
      </div>

      {/* MoMo payment info */}
      {business.momoNumber && momoPaid > 0 && (
        <div className="mt-3 rounded border border-yellow-300 bg-yellow-50 p-2 text-center text-xs">
          <div className="font-semibold text-yellow-800">Mobile Money Payment</div>
          <div className="text-yellow-700">{business.momoProvider ?? 'MoMo'}: {business.momoNumber}</div>
        </div>
      )}

      {/* WhatsApp receipt sharing */}
      {customer?.phone && (
        <div className="no-print mt-4">
          <a
            href={`https://wa.me/${customer.phone.replace(/[^0-9+]/g, '')}?text=${encodeURIComponent(
              `Receipt from ${business.name}\n` +
              `Date: ${formatDateTime(new Date(invoice.createdAt))}\n` +
              `Total: ${formatMoney(invoice.totalPence, business.currency)}\n` +
              `Receipt #${invoice.id.slice(0, 8)}\n\n` +
              lines.map((l) => `${l.name} (${l.qtyLabel}) — ${formatMoney(l.lineTotalPence, business.currency)}`).join('\n') +
              `\n\nThank you for your patronage!`
            )}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-green-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-green-600"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
            Send via WhatsApp
          </a>
        </div>
      )}

      <div className="mt-6 text-center text-xs text-black/50">Thank you for shopping.</div>
    </div>
  );
}
