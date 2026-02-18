import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

// Temporary endpoint — deploy, hit once, then delete this file
export async function POST(req: Request) {
  const { secret } = await req.json();
  if (secret !== 'wipe-stale-2025') {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const prisma = new PrismaClient();
  const log: string[] = [];

  const del = async (label: string, fn: () => Promise<{ count: number }>) => {
    try {
      const r = await fn();
      log.push(`${label}: deleted ${r.count}`);
    } catch (e: unknown) {
      log.push(`${label}: skipped — ${(e as Error).message?.split('\n')[0]}`);
    }
  };

  try {
    // Layer 1 — leaf tables
    await Promise.all([
      del('JournalEntry', () => prisma.journalEntry.deleteMany()),
      del('SalesPayment', () => prisma.salesPayment.deleteMany()),
      del('SalesInvoiceLine', () => prisma.salesInvoiceLine.deleteMany()),
      del('SalesReturn', () => prisma.salesReturn.deleteMany()),
      del('PurchasePayment', () => prisma.purchasePayment.deleteMany()),
      del('PurchaseInvoiceLine', () => prisma.purchaseInvoiceLine.deleteMany()),
      del('ExpensePayment', () => prisma.expensePayment.deleteMany()),
      del('StockAdjustment', () => prisma.stockAdjustment.deleteMany()),
      del('StockTransferLine', () => prisma.stockTransferLine.deleteMany()),
      del('AuditLog', () => prisma.auditLog.deleteMany()),
      del('Session', () => prisma.session.deleteMany()),
    ]);

    // Layer 2
    await Promise.all([
      del('MobileMoneyCollection', () => prisma.mobileMoneyCollection.deleteMany()),
      del('SalesInvoice', () => prisma.salesInvoice.deleteMany()),
      del('PurchaseInvoice', () => prisma.purchaseInvoice.deleteMany()),
      del('Expense', () => prisma.expense.deleteMany()),
      del('StockTransfer', () => prisma.stockTransfer.deleteMany()),
      del('Shift', () => prisma.shift.deleteMany()),
    ]);

    // Layer 3
    await Promise.all([
      del('InventoryBalance', () => prisma.inventoryBalance.deleteMany()),
      del('ProductUnit', () => prisma.productUnit.deleteMany()),
    ]);

    // Layer 4
    await Promise.all([
      del('Product', () => prisma.product.deleteMany()),
      del('Customer', () => prisma.customer.deleteMany()),
      del('Supplier', () => prisma.supplier.deleteMany()),
      del('Account', () => prisma.account.deleteMany()),
      del('Till', () => prisma.till.deleteMany()),
      del('Category', () => prisma.category.deleteMany()),
    ]);

    // Layer 5
    await Promise.all([
      del('Unit', () => prisma.unit.deleteMany()),
      del('User', () => prisma.user.deleteMany()),
    ]);

    // Layer 6
    await del('Branch', () => prisma.branch.deleteMany());
    await del('Store', () => prisma.store.deleteMany());
    await del('Business', () => prisma.business.deleteMany());

    // Also try Notification table (exists in Postgres schema only)
    await del('Notification', () => (prisma as any).notification.deleteMany());

    return NextResponse.json({ ok: true, log });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message, log }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}
