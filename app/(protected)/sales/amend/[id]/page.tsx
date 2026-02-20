import PageHeader from '@/components/PageHeader';
import { prisma } from '@/lib/prisma';
import { requireBusiness } from '@/lib/auth';
import { formatMoney, formatDateTime } from '@/lib/format';
import AmendSaleClient from './AmendSaleClient';
import Link from 'next/link';
import { unstable_cache } from 'next/cache';

const getCachedProducts = unstable_cache(
  (businessId: string) =>
    prisma.product.findMany({
      where: { businessId, active: true },
      select: {
        id: true,
        name: true,
        barcode: true,
        sellingPriceBasePence: true,
        vatRateBps: true,
        categoryId: true,
        imageUrl: true,
        category: { select: { name: true } },
        productUnits: {
          select: {
            unitId: true,
            conversionToBase: true,
            isBaseUnit: true,
            unit: { select: { name: true } },
          },
        },
      },
    }),
  ['pos-products'],
  { revalidate: 60, tags: ['pos-products'] }
);

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

  const [invoice, products] = await Promise.all([
    prisma.salesInvoice.findFirst({
      where: { id: params.id, businessId: business.id },
      select: {
        id: true,
        storeId: true,
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
            unit: { select: { name: true } },
          },
        },
      },
    }),
    getCachedProducts(business.id),
  ]);

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

  // Fetch inventory for the store so we can show stock levels
  const inventory = invoice.storeId
    ? await prisma.inventoryBalance.findMany({
        where: { storeId: invoice.storeId },
        select: { productId: true, qtyOnHandBase: true },
      })
    : [];
  const inventoryMap = new Map(inventory.map((i) => [i.productId, i.qtyOnHandBase]));

  // Exclude products already on this sale
  const existingProductIds = new Set(invoice.lines.map((l) => l.productId));
  const availableProducts = products
    .filter((p) => !existingProductIds.has(p.id))
    .map((p) => ({
      id: p.id,
      name: p.name,
      barcode: p.barcode,
      sellingPriceBasePence: p.sellingPriceBasePence,
      categoryName: p.category?.name ?? null,
      imageUrl: p.imageUrl,
      onHandBase: inventoryMap.get(p.id) ?? 0,
      units: p.productUnits.map((pu) => ({
        id: pu.unitId,
        name: pu.unit.name,
        conversionToBase: pu.conversionToBase,
        isBaseUnit: pu.isBaseUnit,
      })),
    }));

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
        subtitle="Add or remove items from this sale. Stock and payments will be adjusted."
        secondaryCta={{ label: '← Back to Sales', href: '/sales' }}
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
        availableProducts={availableProducts}
      />
    </div>
  );
}
