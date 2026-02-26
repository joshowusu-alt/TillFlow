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
