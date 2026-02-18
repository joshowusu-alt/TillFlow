import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import ReceiptClient from './ReceiptClient';
import { formatMixedUnit, getPrimaryPackagingUnit } from '@/lib/units';

export default async function ReceiptPage({ params }: { params: { id: string } }) {
  const user = await requireUser();
  const invoice = await prisma.salesInvoice.findFirst({
    where: { id: params.id, businessId: user.businessId },
    select: {
      id: true,
      createdAt: true,
      subtotalPence: true,
      vatPence: true,
      totalPence: true,
      discountPence: true,
      store: { select: { name: true } },
      cashierUser: { select: { name: true } },
      customer: { select: { name: true, phone: true } },
      business: {
        select: {
          name: true,
          currency: true,
          vatEnabled: true,
          vatNumber: true,
          receiptTemplate: true,
          printMode: true,
          printerName: true,
          tinNumber: true,
          phone: true,
          address: true,
          momoNumber: true,
          momoProvider: true
        }
      },
      payments: {
        select: {
          method: true,
          amountPence: true,
          reference: true,
          network: true,
          payerMsisdn: true,
          provider: true,
          receivedAt: true,
        }
      },
      lines: {
        select: {
          qtyBase: true,
          unitPricePence: true,
          lineTotalPence: true,
          lineDiscountPence: true,
          promoDiscountPence: true,
          product: {
            select: {
              name: true,
              productUnits: {
                select: {
                  isBaseUnit: true,
                  conversionToBase: true,
                  unit: { select: { name: true, pluralName: true } }
                }
              }
            }
          }
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
        printerName: invoice.business.printerName,
        tinNumber: (invoice.business as any).tinNumber ?? null,
        phone: (invoice.business as any).phone ?? null,
        address: (invoice.business as any).address ?? null,
        momoNumber: (invoice.business as any).momoNumber ?? null,
        momoProvider: (invoice.business as any).momoProvider ?? null
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
        amountPence: payment.amountPence,
        reference: payment.reference,
        network: payment.network,
        payerMsisdn: payment.payerMsisdn,
        provider: payment.provider,
        receivedAt: payment.receivedAt.toISOString(),
      }))}
      lines={lines}
    />
  );
}
