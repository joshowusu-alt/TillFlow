'use server';

/**
 * Repair / recovery actions for accounting data.
 *
 * These are idempotent — running them twice is safe.
 */

import { prisma } from '@/lib/prisma';
import { withBusinessContext, safeAction, ok, type ActionResult } from '@/lib/action-utils';
import { postJournalEntry, ensureChartOfAccounts, ACCOUNT_CODES } from '@/lib/accounting';
import { splitPayments, debitCashBankLines, creditCashBankLines, type PaymentMethod } from '@/lib/services/shared';
import { revalidatePath } from 'next/cache';
import { audit } from '@/lib/audit';

/**
 * Find purchase invoices that have no journal entry and create the missing entries.
 * This fixes the balance sheet showing GHS 0 for inventory when purchases exist.
 *
 * Safe to run multiple times — only processes invoices with no existing journal entry.
 */
export async function repairPurchaseJournalEntriesAction(): Promise<ActionResult<{ repaired: number }>> {
  return safeAction(async () => {
    const { user, businessId } = await withBusinessContext(['MANAGER', 'OWNER']);

    // Ensure accounts exist (lazy seed) before we try to post anything.
    await ensureChartOfAccounts(businessId);

    // Find purchase invoices that have no journal entry linked to them.
    const invoices = await prisma.purchaseInvoice.findMany({
      where: {
        businessId,
        // No JournalEntry with referenceType='PURCHASE_INVOICE' and referenceId=invoice.id
        NOT: {
          id: {
            in: await prisma.journalEntry
              .findMany({
                where: { businessId, referenceType: 'PURCHASE_INVOICE' },
                select: { referenceId: true },
              })
              .then(entries => entries.map(e => e.referenceId).filter(Boolean) as string[]),
          },
        },
      },
      include: { payments: true },
    });

    if (invoices.length === 0) {
      return ok({ repaired: 0 });
    }

    let repaired = 0;
    for (const invoice of invoices) {
      try {
        const split = splitPayments(
          invoice.payments.map(p => ({ method: p.method as PaymentMethod, amountPence: p.amountPence }))
        );
        const apAmount = invoice.totalPence - split.totalPence;

        type JL = { accountCode: string; debitPence?: number; creditPence?: number };
        const journalLines: JL[] = [
          { accountCode: ACCOUNT_CODES.inventory, debitPence: invoice.subtotalPence },
          // VAT receivable only if VAT was charged
          invoice.vatPence > 0
            ? { accountCode: ACCOUNT_CODES.vatReceivable, debitPence: invoice.vatPence }
            : null,
          ...creditCashBankLines(split),
          apAmount > 0 ? { accountCode: ACCOUNT_CODES.ap, creditPence: apAmount } : null,
        ].filter(Boolean) as JL[];

        await postJournalEntry({
          businessId,
          description: `Purchase ${invoice.id} (repaired)`,
          referenceType: 'PURCHASE_INVOICE',
          referenceId: invoice.id,
          entryDate: invoice.createdAt,
          lines: journalLines,
        });
        repaired++;
      } catch (err) {
        // Log but don't abort — repair as many as possible.
        console.error(`[repair] Failed to post journal for purchase ${invoice.id}:`, err);
      }
    }

    await audit({
      businessId,
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      action: 'JOURNAL_REPAIR',
      entity: 'JournalEntry',
      details: { repaired, total: invoices.length },
    });

    revalidatePath('/reports/balance-sheet');
    revalidatePath('/reports/income-statement');
    revalidatePath('/reports/cashflow');

    return ok({ repaired });
  });
}

/**
 * Find sales invoices that have no journal entry and create the missing entries.
 * This fixes the income statement showing GHS 0 revenue when sales exist.
 *
 * Safe to run multiple times — only processes invoices with no existing journal entry.
 */
export async function repairSalesJournalEntriesAction(): Promise<ActionResult<{ repaired: number }>> {
  return safeAction(async () => {
    const { user, businessId } = await withBusinessContext(['MANAGER', 'OWNER']);

    await ensureChartOfAccounts(businessId);

    const existingSalesJournalIds = await prisma.journalEntry
      .findMany({
        where: { businessId, referenceType: 'SALES_INVOICE' },
        select: { referenceId: true },
      })
      .then(entries => entries.map(e => e.referenceId).filter(Boolean) as string[]);

    const invoices = await prisma.salesInvoice.findMany({
      where: {
        businessId,
        paymentStatus: { notIn: ['VOID'] },
        NOT: { id: { in: existingSalesJournalIds } },
      },
      include: {
        payments: true,
        lines: {
          include: {
            product: { select: { defaultCostBasePence: true } },
          },
        },
      },
    });

    if (invoices.length === 0) {
      return ok({ repaired: 0 });
    }

    let repaired = 0;
    for (const invoice of invoices) {
      try {
        const split = splitPayments(
          invoice.payments.map(p => ({ method: p.method as PaymentMethod, amountPence: p.amountPence }))
        );
        const arAmount = invoice.totalPence - split.totalPence;

        type JL = { accountCode: string; debitPence?: number; creditPence?: number };
        const journalLines: JL[] = [
          ...debitCashBankLines(split),
          arAmount > 0 ? { accountCode: ACCOUNT_CODES.ar, debitPence: arAmount } : null,
          { accountCode: ACCOUNT_CODES.sales, creditPence: invoice.subtotalPence },
          invoice.vatPence > 0
            ? { accountCode: ACCOUNT_CODES.vatPayable, creditPence: invoice.vatPence }
            : null,
        ].filter(Boolean) as JL[];

        // Estimate COGS from line items
        const cogsTotal = invoice.lines.reduce((sum, line) => {
          const cost = line.product?.defaultCostBasePence ?? 0;
          return sum + cost * line.qtyBase;
        }, 0);
        if (cogsTotal > 0) {
          journalLines.push({ accountCode: ACCOUNT_CODES.cogs, debitPence: cogsTotal });
          journalLines.push({ accountCode: ACCOUNT_CODES.inventory, creditPence: cogsTotal });
        }

        await postJournalEntry({
          businessId,
          description: `Sale ${invoice.id} (repaired)`,
          referenceType: 'SALES_INVOICE',
          referenceId: invoice.id,
          entryDate: invoice.createdAt,
          lines: journalLines,
        });
        repaired++;
      } catch (err) {
        console.error(`[repair] Failed to post journal for sale ${invoice.id}:`, err);
      }
    }

    await audit({
      businessId,
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      action: 'JOURNAL_REPAIR',
      entity: 'JournalEntry',
      details: { type: 'sales', repaired, total: invoices.length },
    });

    revalidatePath('/reports/balance-sheet');
    revalidatePath('/reports/income-statement');
    revalidatePath('/reports/cashflow');
    revalidatePath('/reports/dashboard');

    return ok({ repaired });
  });
}

/**
 * Restore products that were deleted by "Clear Sample Data" but still have
 * sales invoice lines referencing them.  Re-creates the product with its
 * original name/SKU/pricing from the known demo definitions so that existing
 * sales display correctly again.
 *
 * Safe to run multiple times — only creates products that don't already exist.
 */
export async function restoreOrphanedSaleProducts(): Promise<ActionResult<{ restored: number }>> {
  return safeAction(async () => {
    const { businessId, user } = await withBusinessContext();

    const store = await prisma.store.findFirst({
      where: { businessId },
      select: { id: true },
    });
    if (!store) return ok({ restored: 0 });
    const storeId = store.id;

    // Known demo product definitions (from register.ts seedDemoData)
    const demoProductDefs = [
      { sku: 'CARN-001', name: 'Carnation Milk', selling: 150, cost: 100, reorder: 24 },
      { sku: 'COCA-001', name: 'Coca-Cola 500ml', selling: 120, cost: 80, reorder: 24 },
      { sku: 'MILO-001', name: 'Milo 400g', selling: 550, cost: 400, reorder: 12 },
      { sku: 'SUGAR-001', name: 'Sugar 1kg', selling: 150, cost: 100, reorder: 20 },
      { sku: 'RICE-001', name: 'Basmati Rice 5kg', selling: 800, cost: 600, reorder: 10 },
      { sku: 'OIL-001', name: 'Vegetable Oil 1L', selling: 350, cost: 250, reorder: 12 },
      { sku: 'INDO-001', name: 'Indomie Noodles', selling: 80, cost: 50, reorder: 40 },
      { sku: 'SOAP-001', name: 'Key Soap', selling: 100, cost: 70, reorder: 20 },
      { sku: 'CORB-001', name: 'Exeter Corned Beef', selling: 300, cost: 200, reorder: 12 },
      { sku: 'COLG-001', name: 'Colgate Toothpaste 100ml', selling: 180, cost: 120, reorder: 12 },
    ];

    // Find orphaned product IDs — referenced in sales lines but product doesn't exist
    const allLines = await prisma.salesInvoiceLine.findMany({
      where: { salesInvoice: { businessId } },
      select: { productId: true },
      distinct: ['productId'],
    });
    const existingProducts = await prisma.product.findMany({
      where: { businessId },
      select: { id: true },
    });
    const existingIds = new Set(existingProducts.map(p => p.id));
    const orphanedProductIds = allLines
      .map(l => l.productId)
      .filter(id => !existingIds.has(id));

    if (orphanedProductIds.length === 0) {
      return ok({ restored: 0 });
    }

    // For each orphaned product, try to match by looking at the sales line data
    const pieceUnit = await prisma.unit.findFirst({ where: { name: 'piece' } });
    if (!pieceUnit) {
      return ok({ restored: 0 });
    }

    let restored = 0;

    for (const productId of orphanedProductIds) {
      // Get a sample line to figure out the unit price
      const sampleLine = await prisma.salesInvoiceLine.findFirst({
        where: { productId },
        select: { unitPricePence: true, unitId: true },
      });
      if (!sampleLine) continue;

      // Try to match to a demo product by selling price
      const matchingDef = demoProductDefs.find(d => d.selling === sampleLine.unitPricePence);

      // Check if this SKU already exists (avoid duplicate)
      if (matchingDef) {
        const existingSku = await prisma.product.findFirst({
          where: { businessId, sku: matchingDef.sku },
        });
        if (existingSku) continue;
      }

      await prisma.$transaction(async (tx) => {
        await tx.product.create({
          data: {
            id: productId, // Re-use the original ID so existing lines reconnect
            businessId,
            sku: matchingDef?.sku ?? `RECOVERED-${productId.slice(-6)}`,
            name: matchingDef?.name ?? `Recovered Product (${sampleLine.unitPricePence}p)`,
            sellingPriceBasePence: matchingDef?.selling ?? sampleLine.unitPricePence,
            defaultCostBasePence: matchingDef?.cost ?? Math.round(sampleLine.unitPricePence * 0.6),
            vatRateBps: 0,
            reorderPointBase: matchingDef?.reorder ?? 0,
          },
        });

        // Re-create base unit association
        const unitId = sampleLine.unitId ?? pieceUnit.id;
        await tx.productUnit.create({
          data: {
            productId,
            unitId,
            isBaseUnit: true,
            conversionToBase: 1,
          },
        });

        // Create a zero inventory balance
        await tx.inventoryBalance.create({
          data: {
            storeId,
            productId,
            qtyOnHandBase: 0,
            avgCostBasePence: matchingDef?.cost ?? Math.round(sampleLine.unitPricePence * 0.6),
          },
        });
      });

      restored++;
    }

    await audit({
      businessId,
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      action: 'PRODUCT_CREATE',
      entity: 'Product',
      details: { restored, orphanedCount: orphanedProductIds.length },
    });

    revalidatePath('/sales');
    revalidatePath('/products');
    revalidatePath('/reports/dashboard');
    revalidatePath('/reports/income-statement');

    return ok({ restored });
  });
}
