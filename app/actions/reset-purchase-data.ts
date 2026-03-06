'use server';

import { prisma } from '@/lib/prisma';
import { withBusinessContext, safeAction, ok, err } from '@/lib/action-utils';
import { revalidateTag } from 'next/cache';

/**
 * Deletes ALL purchase invoices, their journal entries, stock movements, and
 * inventory balances for the business — while keeping products, categories,
 * and all other non-financial data intact.
 *
 * Use this to undo duplicate imports caused by timeout-retries. After running
 * this action, re-run the stock import once to produce a single clean dataset.
 */
export async function resetPurchaseData() {
  let authContext;
  try {
    authContext = await withBusinessContext(['OWNER']);
  } catch {
    return err('Your session has expired or you do not have permission.');
  }

  return safeAction(async () => {
    const { businessId } = authContext;

    // Count before so we can report back what was removed.
    const [invoiceCount, journalCount, movementCount, balanceCount] = await Promise.all([
      prisma.purchaseInvoice.count({ where: { businessId } }),
      prisma.journalEntry.count({ where: { businessId, referenceType: 'PURCHASE_INVOICE' } }),
      prisma.stockMovement.count({ where: { referenceType: 'PURCHASE_INVOICE', store: { businessId } } }),
      prisma.inventoryBalance.count({ where: { store: { businessId } } }),
    ]);

    // Delete in dependency order (no FK from stockMovement → purchaseInvoice,
    // but JournalLine cascades from JournalEntry so we only need to delete JournalEntry).

    // 1. Stock movements from purchases (no FK — delete by referenceType filter)
    await prisma.stockMovement.deleteMany({
      where: { referenceType: 'PURCHASE_INVOICE', store: { businessId } },
    });

    // 2. Journal entries + lines (JournalLine has onDelete:Cascade from JournalEntry)
    await prisma.journalEntry.deleteMany({
      where: { businessId, referenceType: 'PURCHASE_INVOICE' },
    });

    // 3. Purchase-linked children, then invoices
    await prisma.purchasePayment.deleteMany({ where: { purchaseInvoice: { businessId } } });
    await prisma.purchaseReturn.deleteMany({ where: { purchaseInvoice: { businessId } } });
    await prisma.purchaseInvoiceLine.deleteMany({ where: { purchaseInvoice: { businessId } } });
    await prisma.purchaseInvoice.deleteMany({ where: { businessId } });

    // 4. Clear inventory balances so stock counts start from 0
    await prisma.inventoryBalance.deleteMany({ where: { store: { businessId } } });

    revalidateTag('pos-products');
    revalidateTag('reports');

    return ok({
      invoicesRemoved: invoiceCount,
      journalEntriesRemoved: journalCount,
      stockMovementsRemoved: movementCount,
      inventoryBalancesReset: balanceCount,
    });
  });
}
