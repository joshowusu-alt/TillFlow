import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

// Temporary endpoint — deploy, hit once, then delete this file
export const maxDuration = 30; // Allow up to 30s for the wipe

export async function POST(req: Request) {
  const { secret } = await req.json();
  if (secret !== 'wipe-stale-2025') {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const prisma = new PrismaClient();

  try {
    // Use TRUNCATE CASCADE for near-instant deletion of all data
    await prisma.$executeRawUnsafe(`
      TRUNCATE TABLE
        "JournalEntry",
        "SalesPayment",
        "SalesInvoiceLine",
        "SalesReturn",
        "MobileMoneyCollection",
        "SalesInvoice",
        "PurchasePayment",
        "PurchaseInvoiceLine",
        "PurchaseInvoice",
        "ExpensePayment",
        "Expense",
        "StockAdjustment",
        "StockTransferLine",
        "StockTransfer",
        "InventoryBalance",
        "Shift",
        "AuditLog",
        "Notification",
        "Session",
        "Till",
        "Branch",
        "ProductUnit",
        "Product",
        "Category",
        "Customer",
        "Supplier",
        "Account",
        "User",
        "Store",
        "Business",
        "Unit"
      CASCADE
    `);

    return NextResponse.json({ ok: true, message: 'All tables truncated.' });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}
