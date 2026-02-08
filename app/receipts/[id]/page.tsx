import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import ReceiptClient from './ReceiptClient';
import { formatMixedUnit, getPrimaryPackagingUnit } from '@/lib/units';

export default async function ReceiptPage({ params }: { params: { id: string } }) {
  await requireUser();
  const invoice = await prisma.salesInvoice.findUnique({
    where: { id: params.id },
    include: {
      store: true,
      cashierUser: true,
      customer: true,
      business: true,
      payments: true,
      lines: {
        include: {
          unit: true,
          product: { include: { productUnits: { include: { unit: true } } } }
        }
      }
    }
  });

  if (!invoice) {
    return <div className="card p-6">Receipt not found.</div>;
  }

  const lines = invoice.lines.map((line) => {
    const baseUnit = line.product.productUnits.find((unit) => unit.isBaseUnit);
    const packaging = getPrimaryPackagingUnit(
      line.product.productUnits.map((pu) => ({ conversionToBase: pu.conversionToBase, unit: pu.unit }))
    );
    const qtyLabel = formatMixedUnit({
      qtyBase: line.qtyBase,
      baseUnit: baseUnit?.unit.name ?? 'unit',
      baseUnitPlural: baseUnit?.unit.pluralName,
      packagingUnit: packaging?.unit.name,
      packagingUnitPlural: packaging?.unit.pluralName,
      packagingConversion: packaging?.conversionToBase
    });
    return {
      name: line.product.name,
      qtyLabel,
      unitPricePence: line.unitPricePence,
      lineTotalPence: line.lineTotalPence,
      lineDiscountPence: line.lineDiscountPence,
      promoDiscountPence: line.promoDiscountPence
    };
  });

  return (
    <ReceiptClient
      business={{
        name: invoice.business.name,
        currency: invoice.business.currency,
        vatEnabled: invoice.business.vatEnabled,
        vatNumber: invoice.business.vatNumber,
        receiptTemplate: invoice.business.receiptTemplate,
        printMode: invoice.business.printMode,
        printerName: invoice.business.printerName
      }}
      store={{ name: invoice.store.name }}
      cashier={{ name: invoice.cashierUser.name }}
      customer={invoice.customer ? { name: invoice.customer.name, phone: invoice.customer.phone } : null}
      invoice={{
        id: invoice.id,
        createdAt: invoice.createdAt.toISOString(),
        subtotalPence: invoice.subtotalPence,
        vatPence: invoice.vatPence,
        totalPence: invoice.totalPence,
        discountPence: invoice.discountPence
      }}
      payments={invoice.payments.map((payment) => ({
        method: payment.method,
        amountPence: payment.amountPence
      }))}
      lines={lines}
    />
  );
}
