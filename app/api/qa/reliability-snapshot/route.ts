import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

function evidenceApiEnabled() {
  if (process.env.VERCEL_ENV === 'production') return false;
  return (
    process.env.VERCEL_ENV === 'preview' ||
    process.env.RELIABILITY_EVIDENCE_API === '1' ||
    process.env.NODE_ENV !== 'production'
  );
}

/**
 * Owner-only, Preview/local snapshot of recent till/shift/sale identity.
 * Never enabled on Vercel Production. No customer PII, no secrets.
 */
export async function GET() {
  if (!evidenceApiEnabled()) {
    return NextResponse.json({ error: 'not_available' }, { status: 404 });
  }

  const user = await getUser();
  if (!user || (user.role !== 'OWNER' && user.role !== 'MANAGER')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const invoices = await prisma.salesInvoice.findMany({
    where: { businessId: user.businessId },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: {
      id: true,
      transactionNumber: true,
      businessId: true,
      storeId: true,
      tillId: true,
      shiftId: true,
      cashierUserId: true,
      saleSource: true,
      totalPence: true,
      paymentStatus: true,
      till: { select: { name: true, active: true } },
      shift: {
        select: {
          id: true,
          status: true,
          tillId: true,
          expectedCashPence: true,
          cardTotalPence: true,
          transferTotalPence: true,
          momoTotalPence: true,
        },
      },
      payments: { select: { id: true, method: true, amountPence: true, reference: true } },
    },
  });

  const shiftIds = [...new Set(invoices.map((row) => row.shiftId).filter(Boolean))] as string[];
  const drawers = shiftIds.length
    ? await prisma.cashDrawerEntry.findMany({
        where: { businessId: user.businessId, shiftId: { in: shiftIds } },
        select: {
          id: true,
          tillId: true,
          shiftId: true,
          entryType: true,
          amountPence: true,
          referenceType: true,
          referenceId: true,
        },
      })
    : [];

  const stock = invoices.length
    ? await prisma.stockMovement.findMany({
        where: {
          storeId: { in: [...new Set(invoices.map((row) => row.storeId))] },
          referenceType: 'SALES_INVOICE',
          referenceId: { in: invoices.map((row) => row.id) },
        },
        select: { id: true, referenceId: true, productId: true, qtyBase: true, storeId: true },
      })
    : [];

  const invoiceIds = invoices.map((row) => row.id);
  const journals = invoiceIds.length
    ? await prisma.journalEntry.findMany({
        where: {
          businessId: user.businessId,
          referenceId: { in: invoiceIds },
        },
        select: { id: true, referenceType: true, referenceId: true },
      })
    : [];

  const moneyKeys = await prisma.moneyIdempotency.findMany({
    where: { businessId: user.businessId },
    orderBy: { createdAt: 'desc' },
    take: 40,
    select: { commandKind: true, createdAt: true },
  });

  const productCount = await prisma.product.count({
    where: { businessId: user.businessId, active: true },
  });

  const business = await prisma.business.findUnique({
    where: { id: user.businessId },
    select: { openingCapitalPence: true },
  });

  const openingMovements = await prisma.stockMovement.findMany({
    where: {
      store: { businessId: user.businessId },
      type: 'OPENING',
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: {
      storeId: true,
      productId: true,
      qtyBase: true,
      type: true,
      referenceType: true,
      product: { select: { name: true, sku: true } },
    },
  });

  const openingJournals = await prisma.journalEntry.findMany({
    where: {
      businessId: user.businessId,
      referenceType: 'OPENING_BALANCE_INVENTORY',
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: { id: true, referenceType: true, referenceId: true },
  });

  const productImports = await prisma.productImport.findMany({
    where: { businessId: user.businessId },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: {
      id: true,
      fileName: true,
      status: true,
      rowsParsed: true,
      rowsImported: true,
      rowsUpdated: true,
      rowsSkipped: true,
    },
  });

  const gateProducts = await prisma.product.findMany({
    where: {
      businessId: user.businessId,
      active: true,
      OR: [
        { sku: 'REL-IMP-P104-01' },
        { name: 'Reliability Manual Import Gate' },
      ],
    },
    select: { id: true, name: true, sku: true, barcode: true },
    take: 5,
  });

  const manualEntryProducts = await prisma.product.findMany({
    where: {
      businessId: user.businessId,
      active: true,
      OR: [
        { sku: 'REL-MAN-P104-01' },
        { name: 'Reliability Manual Entry Gate' },
      ],
    },
    select: { id: true, name: true, sku: true, barcode: true },
    take: 5,
  });

  const expenses = await prisma.expense.findMany({
    where: { businessId: user.businessId },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: { reference: true, amountPence: true, vendorName: true },
  });

  const sellableProduct = await prisma.product.findFirst({
    where: {
      businessId: user.businessId,
      active: true,
      OR: [{ sku: 'REL-SKU-1' }, { name: 'Reliability SKU' }],
    },
    select: {
      name: true,
      sku: true,
      inventoryBalances: { select: { qtyOnHandBase: true, storeId: true }, take: 5 },
    },
  });

  const [
    openShifts,
    purchaseInvoiceCount,
    saleInvoiceCount,
    salesPaymentCount,
    cashSaleDrawerCount,
    recentPurchases,
  ] = await Promise.all([
    prisma.shift.findMany({
      where: {
        status: 'OPEN',
        till: { store: { businessId: user.businessId } },
      },
      orderBy: { openedAt: 'asc' },
      take: 20,
      select: {
        id: true,
        tillId: true,
        userId: true,
        status: true,
        openingCashPence: true,
        expectedCashPence: true,
        cardTotalPence: true,
        transferTotalPence: true,
        momoTotalPence: true,
        till: { select: { name: true } },
        _count: {
          select: {
            salesInvoices: { where: { paymentStatus: { notIn: ['VOID', 'RETURNED'] } } },
          },
        },
        cashDrawerEntries: { select: { entryType: true } },
      },
    }),
    prisma.purchaseInvoice.count({ where: { businessId: user.businessId } }),
    prisma.salesInvoice.count({ where: { businessId: user.businessId } }),
    prisma.salesPayment.count({
      where: { salesInvoice: { businessId: user.businessId } },
    }),
    prisma.cashDrawerEntry.count({
      where: { businessId: user.businessId, entryType: 'CASH_SALE' },
    }),
    prisma.purchaseInvoice.findMany({
      where: { businessId: user.businessId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { id: true, paymentStatus: true, totalPence: true, qaTag: true },
    }),
  ]);

  return NextResponse.json({
    deployedSha: process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GIT_COMMIT_SHA ?? null,
    vercelEnv: process.env.VERCEL_ENV ?? null,
    businessId: user.businessId,
    userId: user.id,
    productCount,
    openingCapitalPence: business?.openingCapitalPence ?? 0,
    openingMovements: openingMovements.map((row) => ({
      storeId: row.storeId,
      productId: row.productId,
      qtyBase: row.qtyBase,
      type: row.type,
      referenceType: row.referenceType,
      productName: row.product.name,
      productSku: row.product.sku,
    })),
    openingJournals: openingJournals.map((row) => ({
      id: row.id,
      referenceType: row.referenceType,
      referenceId: row.referenceId,
    })),
    productImports: productImports.map((row) => ({
      id: row.id,
      fileName: row.fileName,
      status: row.status,
      rowsParsed: row.rowsParsed,
      rowsImported: row.rowsImported,
      rowsUpdated: row.rowsUpdated,
      rowsSkipped: row.rowsSkipped,
    })),
    gateProducts: gateProducts.map((row) => ({
      id: row.id,
      name: row.name,
      sku: row.sku,
      barcode: row.barcode,
    })),
    manualEntryProducts: manualEntryProducts.map((row) => ({
      id: row.id,
      name: row.name,
      sku: row.sku,
      barcode: row.barcode,
    })),
    expenses: expenses.map((row) => ({
      reference: row.reference,
      amountPence: row.amountPence,
      vendorName: row.vendorName,
    })),
    sellableProduct: sellableProduct
      ? {
          name: sellableProduct.name,
          sku: sellableProduct.sku,
          qtyOnHandBase: sellableProduct.inventoryBalances.reduce(
            (sum, row) => sum + row.qtyOnHandBase,
            0,
          ),
        }
      : null,
    openShifts: openShifts.map((shift) => ({
      id: shift.id,
      tillId: shift.tillId,
      tillName: shift.till.name,
      status: shift.status,
      openingCashPence: shift.openingCashPence,
      expectedCashPence: shift.expectedCashPence,
      cardTotalPence: shift.cardTotalPence,
      momoTotalPence: shift.momoTotalPence,
      transferTotalPence: shift.transferTotalPence,
      ownedByCurrentUser: shift.userId === user.id,
      openFloatCount: shift.cashDrawerEntries.filter((row) => row.entryType === 'OPEN_FLOAT').length,
      salesCount: shift._count.salesInvoices,
    })),
    purchaseInvoiceCount,
    saleInvoiceCount,
    salesPaymentCount,
    cashSaleDrawerCount,
    purchaseInvoices: recentPurchases.map((row) => ({
      id: row.id,
      paymentStatus: row.paymentStatus,
      totalPence: row.totalPence,
      qaTag: row.qaTag,
    })),
    moneyIdempotency: moneyKeys.map((row) => ({
      commandKind: row.commandKind,
      createdAt: row.createdAt,
    })),
    invoices: invoices.map((invoice) => ({
      invoiceId: invoice.id,
      transactionNumber: invoice.transactionNumber,
      businessId: invoice.businessId,
      storeId: invoice.storeId,
      tillId: invoice.tillId,
      tillName: invoice.till?.name ?? null,
      shiftId: invoice.shiftId,
      shiftTillId: invoice.shift?.tillId ?? null,
      shiftStatus: invoice.shift?.status ?? null,
      cashierUserId: invoice.cashierUserId,
      saleSource: invoice.saleSource,
      totalPence: invoice.totalPence,
      expectedCashPence: invoice.shift?.expectedCashPence ?? null,
      cardTotalPence: invoice.shift?.cardTotalPence ?? null,
      transferTotalPence: invoice.shift?.transferTotalPence ?? null,
      momoTotalPence: invoice.shift?.momoTotalPence ?? null,
      payments: invoice.payments,
      drawer: drawers.filter((row) => row.shiftId === invoice.shiftId),
      stockMovements: stock.filter((row) => row.referenceId === invoice.id),
      journals: journals.filter((row) => row.referenceId === invoice.id),
    })),
  });
}
