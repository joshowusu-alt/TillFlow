import PageHeader from '@/components/PageHeader';
import SubmitButton from '@/components/SubmitButton';
import { prisma } from '@/lib/prisma';
import { requireBusiness } from '@/lib/auth';
import { formatMoney, formatDateTime } from '@/lib/format';
import { createPurchaseReturnAction } from '@/app/actions/returns';

export default async function PurchaseReturnPage({ params }: { params: { id: string } }) {
  const { business } = await requireBusiness(['MANAGER', 'OWNER']);
  if (!business) return <div className="card p-6">Seed data missing.</div>;

  const invoice = await prisma.purchaseInvoice.findFirst({
    where: { id: params.id, businessId: business.id },
    select: {
      id: true,
      createdAt: true,
      totalPence: true,
      paymentStatus: true,
      payments: { select: { amountPence: true } },
      supplier: { select: { name: true } },
      purchaseReturn: { select: { id: true } }
    }
  });

  if (!invoice) return <div className="card p-6">Purchase not found.</div>;
  if (invoice.purchaseReturn) {
    return <div className="card p-6">This purchase has already been returned.</div>;
  }

  const paid = invoice.payments.reduce((sum, payment) => sum + payment.amountPence, 0);
  const balance = Math.max(invoice.totalPence - paid, 0);
  const isVoid = paid === 0;

  return (
    <div className="space-y-6">
      <PageHeader title="Return Purchase" subtitle="Process a full purchase return or void an unpaid invoice." />

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-black/5 bg-white px-4 py-3">
          <div className="text-xs uppercase tracking-[0.2em] text-black/40">Invoice</div>
          <div className="mt-1 text-2xl font-display font-semibold text-ink">#{invoice.id.slice(0, 8)}</div>
          <div className="mt-1 text-sm text-black/55">{formatDateTime(invoice.createdAt)}</div>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
          <div className="text-xs uppercase tracking-[0.2em] text-emerald-700/70">Paid</div>
          <div className="mt-1 text-2xl font-display font-semibold text-emerald-700">{formatMoney(paid, business.currency)}</div>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
          <div className="text-xs uppercase tracking-[0.2em] text-amber-700/70">Balance</div>
          <div className="mt-1 text-2xl font-display font-semibold text-amber-800">{formatMoney(balance, business.currency)}</div>
        </div>
      </div>

      <div className="card p-4 sm:p-6">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 text-sm">
          <div className="rounded-xl border border-black/5 bg-black/[0.02] px-4 py-3">
            <div className="text-xs uppercase tracking-[0.16em] text-black/40">Supplier</div>
            <div className="mt-1 font-medium text-ink">{invoice.supplier?.name ?? 'Supplier not set'}</div>
          </div>
          <div className="rounded-xl border border-black/5 bg-black/[0.02] px-4 py-3">
            <div className="text-xs uppercase tracking-[0.16em] text-black/40">Total</div>
            <div className="mt-1 font-medium text-ink">{formatMoney(invoice.totalPence, business.currency)}</div>
          </div>
          <div className="rounded-xl border border-black/5 bg-black/[0.02] px-4 py-3">
            <div className="text-xs uppercase tracking-[0.16em] text-black/40">Status</div>
            <div className="mt-1 font-medium text-ink">{invoice.paymentStatus.replace('_', ' ')}</div>
          </div>
          <div className="rounded-xl border border-black/5 bg-black/[0.02] px-4 py-3">
            <div className="text-xs uppercase tracking-[0.16em] text-black/40">Action</div>
            <div className="mt-1 font-medium text-ink">{isVoid ? 'Void unpaid purchase' : 'Refund paid purchase'}</div>
          </div>
        </div>
      </div>

      <div className="card p-4 sm:p-6">
        <form action={createPurchaseReturnAction} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <input type="hidden" name="purchaseInvoiceId" value={invoice.id} />
          <input type="hidden" name="refundAmountPence" value={paid} />
          <input type="hidden" name="type" value={isVoid ? 'VOID' : 'RETURN'} />
          {!isVoid ? (
            <>
              <div>
                <label className="label">Refund Method</label>
                <select className="input" name="refundMethod" defaultValue="CASH">
                  <option value="CASH">Cash</option>
                  <option value="CARD">Card</option>
                  <option value="TRANSFER">Transfer</option>
                  <option value="MOBILE_MONEY">Mobile Money</option>
                </select>
              </div>
              <div>
                <label className="label">Refund Amount</label>
                <div className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm font-semibold">
                  {formatMoney(paid, business.currency)}
                </div>
              </div>
            </>
          ) : (
            <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-3 text-sm text-amber-900 sm:col-span-2">
              No payments made. This will void the purchase and remove stock.
            </div>
          )}
          <div className="sm:col-span-2 xl:col-span-3">
            <label className="label">Reason (optional)</label>
            <input className="input" name="reason" placeholder="Reason for return/void" />
          </div>
          <div className="sm:col-span-2 xl:col-span-3 flex flex-col gap-3 rounded-2xl border border-black/5 bg-black/[0.02] p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-black/60">
              {isVoid
                ? 'This will reverse the purchase and remove the related stock from inventory.'
                : `This will refund ${formatMoney(paid, business.currency)} and create a purchase return record.`}
            </div>
            <SubmitButton className="btn-primary" loadingText="Processing…">{isVoid ? 'Void Purchase' : 'Process Return'}</SubmitButton>
          </div>
        </form>
      </div>
    </div>
  );
}
