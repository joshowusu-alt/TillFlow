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

      <div className="card p-6 space-y-2 text-sm">
        <div>Invoice: {invoice.id.slice(0, 8)}</div>
        <div>Date: {formatDateTime(invoice.createdAt)}</div>
        <div>Supplier: {invoice.supplier?.name ?? 'Default Supplier'}</div>
        <div>Total: {formatMoney(invoice.totalPence, business.currency)}</div>
        <div>Paid: {formatMoney(paid, business.currency)}</div>
        <div>Balance: {formatMoney(balance, business.currency)}</div>
      </div>

      <div className="card p-6">
        <form action={createPurchaseReturnAction} className="grid gap-4 md:grid-cols-3">
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
            <div className="md:col-span-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              No payments made. This will void the purchase and remove stock.
            </div>
          )}
          <div className="md:col-span-3">
            <label className="label">Reason (optional)</label>
            <input className="input" name="reason" placeholder="Reason for return/void" />
          </div>
          <div className="md:col-span-3">
            <SubmitButton className="btn-primary" loadingText="Processing…">{isVoid ? 'Void Purchase' : 'Process Return'}</SubmitButton>
          </div>
        </form>
      </div>
    </div>
  );
}
