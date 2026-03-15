'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getLastReceiptStorageKey } from '@/lib/business-scope';
import { formatDateTime, formatMoney } from '@/lib/format';
import { openCashDrawer, isCashDrawerEnabled } from '@/lib/hardware';
import { buildEscPosReceipt, toHexString } from '@/lib/escpos';
import { ensureQzConnection, printRawEscPos } from '@/lib/qz';

type ReceiptClientProps = {
  business: {
    id: string;
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
  store: { id: string; name: string };
  cashier: { name: string };
  customer?: { name: string; phone?: string | null } | null;
  invoice: {
    id: string;
    createdAt: string;
    transactionNumber?: string | null;
    subtotalPence: number;
    vatPence: number;
    totalPence: number;
    discountPence?: number;
    cashReceivedPence?: number;
    changeDuePence?: number;
  };
  payments: {
    method: string;
    amountPence: number;
    reference?: string | null;
    network?: string | null;
    payerMsisdn?: string | null;
    provider?: string | null;
    receivedAt?: string;
  }[];
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
  const momoPayments = payments.filter(
    (payment) => payment.method === 'MOBILE_MONEY' && payment.amountPence > 0
  );
  const lineDiscountTotal = lines.reduce(
    (sum, line) => sum + line.lineDiscountPence + line.promoDiscountPence,
    0
  );
  const lastReceiptStorageKey = getLastReceiptStorageKey({ businessId: business.id, storeId: store.id });
  const receiptReference = invoice.transactionNumber ?? invoice.id.slice(0, 8).toUpperCase();
  const itemGridClass =
    template === 'A4'
      ? 'grid-cols-[1.5rem_minmax(0,1fr)_4.5rem_5rem] sm:grid-cols-[2rem_minmax(0,1fr)_6rem_6rem]'
      : 'grid-cols-[1.25rem_minmax(0,1fr)_3.75rem_4.25rem] sm:grid-cols-[1.5rem_minmax(0,1fr)_4.75rem_5rem]';

  const handleDirectPrint = useCallback(async () => {
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
  }, [business, cashier, customer, invoice, lines, payments, store, template]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(lastReceiptStorageKey, invoice.id);
      if (cashPaid > 0 && isCashDrawerEnabled({ businessId: business.id })) {
        openCashDrawer().catch(() => null);
      }
    }
  }, [business.id, cashPaid, invoice.id, lastReceiptStorageKey]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (didPrintRef.current) return;
    didPrintRef.current = true;

    if (printMode === 'BROWSER_DIALOG') {
      window.print();
      return;
    }

    const isAutomationBrowser = navigator.webdriver || /HeadlessChrome/i.test(navigator.userAgent);
    if (isAutomationBrowser) {
      setDirectStatus('idle');
      setDirectError(null);
      return;
    }

    void handleDirectPrint();
  }, [handleDirectPrint, printMode]);

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
              {formatMoney(invoice.totalPence, business.currency)} | Receipt {receiptReference}
            </div>
          </div>
        </div>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
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
          {printMode === 'DIRECT_ESC_POS' && directStatus === 'failed' ? (
            <button
              type="button"
              className="btn-secondary text-xs"
              onClick={() => {
                void handleDirectPrint();
              }}
            >
              Retry Direct Print
            </button>
          ) : null}
        </div>
        <div className="mt-3 text-xs text-emerald-700">
          {printMode === 'DIRECT_ESC_POS' ? 'Direct print enabled' : 'Browser print enabled'}
          {directStatus === 'printing' ? ' | Sending to printer...' : null}
          {directStatus === 'success' ? ' | Printed' : null}
          {directStatus === 'failed' ? ' | Direct print failed' : null}
        </div>
      </div>

      {directError ? (
        <div className="no-print mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {directError.includes('qz-tray') || directError.toLowerCase().includes('qz') ? (
            <>
              QZ Tray is not running on this computer. QZ Tray is the small desktop helper that
              sends receipts straight to the printer without opening the browser print dialog. You
              can still use <strong>Print Receipt</strong> above, or{' '}
              <a
                href="https://qz.io"
                target="_blank"
                rel="noopener"
                className="underline font-medium"
              >
                install/start QZ Tray
              </a>{' '}
              for automatic direct printing.
            </>
          ) : (
            <>
              Print error - {directError}. Try <strong>Print Receipt</strong> instead.
            </>
          )}
        </div>
      ) : null}

      <div className="text-center">
        <div className="text-[10px] font-semibold uppercase tracking-[0.34em] text-black/45">
          Sales Receipt
        </div>
        <h1 className="mt-2 text-xl font-display font-semibold">{business.name}</h1>
        <p className="text-xs font-medium text-black/75">{store.name}</p>
        {business.address ? <p className="text-xs">{business.address}</p> : null}
        {business.phone ? <p className="text-xs">Tel: {business.phone}</p> : null}
        {business.vatEnabled ? <p className="text-xs">VAT: {business.vatNumber ?? 'N/A'}</p> : null}
        {business.tinNumber ? <p className="text-xs">TIN: {business.tinNumber}</p> : null}
      </div>

      <div className="mt-5 rounded-xl border border-black/10 px-3 py-3">
        <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-black/45">
          Receipt Details
        </div>
        <div className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11px] text-black/70">
          <div className="font-semibold text-black/50">Receipt</div>
          <div className="text-right font-mono">{receiptReference}</div>
          <div className="font-semibold text-black/50">Date</div>
          <div className="text-right">{formatDateTime(new Date(invoice.createdAt))}</div>
          <div className="font-semibold text-black/50">Cashier</div>
          <div className="text-right">{cashier.name}</div>
          {customer ? (
            <>
              <div className="font-semibold text-black/50">Customer</div>
              <div className="text-right">{customer.name}</div>
            </>
          ) : null}
          {customer?.phone ? (
            <>
              <div className="font-semibold text-black/50">Phone</div>
              <div className="text-right">{customer.phone}</div>
            </>
          ) : null}
        </div>
      </div>

      <div className="mt-5">
        <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-black/45">
          Items
        </div>
        <div className="mt-2 overflow-hidden rounded-xl border border-black/10">
          <div
            className={`grid ${itemGridClass} gap-x-2 border-b border-black/10 bg-black/[0.03] px-2 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-black/55`}
          >
            <div>#</div>
            <div>Description</div>
            <div className="text-right">Qty</div>
            <div className="text-right">Total</div>
          </div>
          <div className="divide-y divide-black/10">
            {lines.map((line, index) => {
              const discountPence = line.lineDiscountPence + line.promoDiscountPence;

              return (
                <div
                  key={`${line.name}-${index}`}
                  className={`grid ${itemGridClass} gap-x-2 px-2 py-2 text-[11px]`}
                >
                  <div className="font-mono text-black/45">{index + 1}</div>
                  <div className="min-w-0">
                    <div className="font-semibold leading-tight text-black">{line.name}</div>
                    {discountPence > 0 ? (
                      <div className="mt-1 text-[10px] leading-tight text-emerald-700">
                        Discount {formatMoney(discountPence, business.currency)}
                      </div>
                    ) : null}
                  </div>
                  <div className="text-right leading-tight text-black/75">{line.qtyLabel}</div>
                  <div className="text-right font-mono font-semibold text-black">
                    {formatMoney(line.lineTotalPence, business.currency)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mt-5 rounded-xl border border-black/10 px-3 py-3 text-xs">
        <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-black/45">
          Totals
        </div>
        <div className="mt-2 space-y-1">
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
      </div>

      <div className="mt-4 rounded-xl border border-black/10 px-3 py-3 text-xs">
        <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-black/45">
          Payments
        </div>
        <div className="mt-2 space-y-1">
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
            <>
              <div className="flex justify-between">
                <span>Paid (MoMo)</span>
                <span>{formatMoney(momoPaid, business.currency)}</span>
              </div>
              {momoPayments.map((payment, index) => (
                <div
                  key={`${payment.reference ?? 'momo'}-${index}`}
                  className="text-[11px] text-black/60"
                >
                  {(payment.provider ?? payment.network ?? 'MoMo').toUpperCase()} |{' '}
                  {payment.payerMsisdn ?? 'payer'} | Ref: {payment.reference ?? 'pending'}
                  {payment.receivedAt
                    ? ` | ${new Date(payment.receivedAt).toLocaleString('en-GB')}`
                    : ''}
                </div>
              ))}
            </>
          ) : null}
        </div>
      </div>

      {invoice.changeDuePence != null && invoice.changeDuePence > 0 ? (
        <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
          <div className="flex justify-between">
            <span>Change Due</span>
            <span>{formatMoney(invoice.changeDuePence, business.currency)}</span>
          </div>
        </div>
      ) : null}

      {business.momoNumber && momoPaid > 0 ? (
        <div className="mt-3 rounded border border-yellow-300 bg-yellow-50 p-2 text-center text-xs">
          <div className="font-semibold text-yellow-800">Mobile Money Payment</div>
          <div className="text-yellow-700">
            {business.momoProvider ?? 'MoMo'}: {business.momoNumber}
          </div>
        </div>
      ) : null}

      {customer?.phone ? (
        <div className="no-print mt-4">
          <a
            href={`https://wa.me/${customer.phone.replace(/[^0-9+]/g, '')}?text=${encodeURIComponent(
              `Receipt from ${business.name}\n` +
                `Date: ${formatDateTime(new Date(invoice.createdAt))}\n` +
                `Total: ${formatMoney(invoice.totalPence, business.currency)}\n` +
                `Receipt ${receiptReference}\n\n` +
                lines
                  .map(
                    (line) =>
                      `${line.name} (${line.qtyLabel}) - ${formatMoney(line.lineTotalPence, business.currency)}`
                  )
                  .join('\n') +
                `\n\nThank you for shopping with us.`
            )}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-green-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-green-600"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
            </svg>
            Send via WhatsApp
          </a>
        </div>
      ) : null}

      <div className="mt-6 text-center text-xs text-black/50">Thank you for shopping with us.</div>
    </div>
  );
}
