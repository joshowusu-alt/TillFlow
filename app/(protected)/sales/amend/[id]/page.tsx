import PageHeader from '@/components/PageHeader';
import { prisma } from '@/lib/prisma';
import { requireBusiness } from '@/lib/auth';
import { formatMoney, formatDateTime } from '@/lib/format';
import AmendSaleClient from './AmendSaleClient';
import Link from 'next/link';

export default async function AmendSalePage({ params }: { params: { id: string } }) {
  const { business } = await requireBusiness(['MANAGER', 'OWNER']);
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
      paymentStatus: true,
      totalPence: true,
      payments: { select: { amountPence: true } },
      customer: { select: { name: true } },
      salesReturn: { select: { id: true } },
      lines: {
        select: {
          id: true,
          productId: true,
          qtyInUnit: true,
          unitPricePence: true,
          lineDiscountPence: true,
          promoDiscountPence: true,
          lineTotalPence: true,
          lineVatPence: true,
          product: { select: { name: true } },
          unit: { select: { name: true } }
        }
      }
    }
  });

  if (!invoice) {
    return (
      <div className="card p-6 text-center">
        <div className="text-lg font-semibold">Sale Not Found</div>
        <div className="mt-2 text-sm text-black/60">The sale you&apos;re looking for doesn&apos;t exist.</div>
        <Link href="/sales" className="btn-primary mt-4 inline-block">Back to Sales</Link>
      </div>
    );
  }

  if (invoice.salesReturn || ['RETURNED', 'VOID'].includes(invoice.paymentStatus)) {
    return (
      <div className="card p-6 text-center">
        <div className="text-lg font-semibold">Cannot Amend</div>
        <div className="mt-2 text-sm text-black/60">This sale has already been returned or voided and cannot be amended.</div>
        <Link href="/sales" className="btn-primary mt-4 inline-block">Back to Sales</Link>
      </div>
    );
  }

  if (invoice.lines.length <= 1) {
    return (
      <div className="card p-6 text-center">
        <div className="text-lg font-semibold">Cannot Amend</div>
        <div className="mt-2 text-sm text-black/60">This sale has only one item. Use Return/Void to cancel the entire sale instead.</div>
        <div className="mt-4 flex justify-center gap-3">
          <Link href="/sales" className="btn-ghost">Back to Sales</Link>
          <Link href={`/sales/return/${invoice.id}`} className="btn-primary">Return Sale</Link>
        </div>
      </div>
    );
  }

  const totalPaid = invoice.payments.reduce((sum, p) => sum + p.amountPence, 0);

  const lines = invoice.lines.map((line) => ({
    id: line.id,
    productId: line.productId,
    productName: line.product.name,
    unitName: line.unit.name,
    qtyInUnit: line.qtyInUnit,
    unitPricePence: line.unitPricePence,
    lineDiscountPence: line.lineDiscountPence,
    promoDiscountPence: line.promoDiscountPence,
    lineTotalPence: line.lineTotalPence,
    lineVatPence: line.lineVatPence,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Amend Sale"
        subtitle="Remove items from this sale. Stock will be restored and payments adjusted."
      />

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
          <span className="text-black/50">Current Total:</span>
          <span className="font-semibold">{formatMoney(invoice.totalPence, business.currency)}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-black/50">Paid:</span>
          <span className="font-semibold text-emerald-700">{formatMoney(totalPaid, business.currency)}</span>
        </div>
      </div>

      <AmendSaleClient
        invoiceId={invoice.id}
        lines={lines}
        totalPence={invoice.totalPence}
        totalPaid={totalPaid}
        currency={business.currency}
      />
    </div>
  );
}
