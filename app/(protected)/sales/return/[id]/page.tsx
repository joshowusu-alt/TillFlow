import PageHeader from '@/components/PageHeader';
import { prisma } from '@/lib/prisma';
import { requireBusiness } from '@/lib/auth';
import { formatMoney, formatDateTime } from '@/lib/format';
import ReturnFormClient from './ReturnFormClient';

export default async function SalesReturnPage({ params }: { params: { id: string } }) {
  const { user, business } = await requireBusiness(['CASHIER', 'MANAGER', 'OWNER']);
  if (!business) {
    return (
      <div className="card p-6 text-center">
        <div className="text-lg font-semibold">Setup Required</div>
        <div className="mt-2 text-sm text-black/60">Complete your business setup in Settings to get started.</div>
        <a href="/settings" className="btn-primary mt-4 inline-block">Go to Settings</a>
      </div>
    );
  }

  const invoice = await prisma.salesInvoice.findFirst({
    where: { id: params.id, businessId: business.id },
    select: {
      id: true,
      createdAt: true,
      totalPence: true,
      payments: { select: { amountPence: true } },
      customer: { select: { name: true } },
      salesReturn: { select: { id: true } }
    }
  });

  if (!invoice) {
    return (
      <div className="card p-6 text-center">
        <div className="text-lg font-semibold">Sale Not Found</div>
        <div className="mt-2 text-sm text-black/60">The sale you're looking for doesn't exist.</div>
        <a href="/sales" className="btn-primary mt-4 inline-block">Back to Sales</a>
      </div>
    );
  }

  if (invoice.salesReturn) {
    return (
      <div className="card p-6 text-center">
        <div className="text-lg font-semibold">Already Returned</div>
        <div className="mt-2 text-sm text-black/60">This sale has already been returned or voided.</div>
        <a href="/sales" className="btn-primary mt-4 inline-block">Back to Sales</a>
      </div>
    );
  }

  const paid = invoice.payments.reduce((sum, payment) => sum + payment.amountPence, 0);
  const balance = Math.max(invoice.totalPence - paid, 0);
  const isVoid = paid === 0;

  return (
    <div className="space-y-6">
      <PageHeader title="Return Sale" subtitle="Process a full return or void an unpaid sale." secondaryCta={{ label: '← Back to Sales', href: '/sales' }} />

      <div className="card p-6 space-y-2 text-sm">
        <div className="flex items-center gap-2">
          <span className="text-black/50">Invoice:</span>
          <span className="font-semibold">{invoice.id.slice(0, 8)}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-black/50">Date:</span>
          <span>{formatDateTime(invoice.createdAt)}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-black/50">Customer:</span>
          <span>{invoice.customer?.name ?? 'Walk-in'}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-black/50">Total:</span>
          <span className="font-semibold">{formatMoney(invoice.totalPence, business.currency)}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-black/50">Paid:</span>
          <span className="font-semibold text-emerald-700">{formatMoney(paid, business.currency)}</span>
        </div>
        {balance > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-black/50">Balance:</span>
            <span className="font-semibold text-rose">{formatMoney(balance, business.currency)}</span>
          </div>
        )}
      </div>

      <div className="card p-6">
        <ReturnFormClient
          invoiceId={invoice.id}
          paid={paid}
          currency={business.currency}
          isVoid={isVoid}
          userRole={user.role}
        />
      </div>
    </div>
  );
}
