'use server';

import { prisma } from '@/lib/prisma';
import { ACCOUNT_CODES, postJournalEntry, ensureChartOfAccounts } from '@/lib/accounting';
import { requireRole } from '@/lib/auth';
import { safeAction, ok, err, UserError, type ActionResult } from '@/lib/action-utils';
import { revalidateTag } from 'next/cache';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CashBankInput = {
  cashOnHandPence: number;
  bankBalancePence: number;
};

type CustomerDebt = {
  customerId: string;
  amountPence: number;
};

type SupplierDebt = {
  supplierId: string;
  amountPence: number;
};

// ---------------------------------------------------------------------------
// Helper: delete previous opening-balance journal entries for a given refType
// ---------------------------------------------------------------------------
async function deleteOpeningBalanceJournals(
  businessId: string,
  referenceType: string,
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
) {
  const entries = await tx.journalEntry.findMany({
    where: { businessId, referenceType },
    select: { id: true },
  });
  if (entries.length > 0) {
    const ids = entries.map(e => e.id);
    await tx.journalLine.deleteMany({ where: { journalEntryId: { in: ids } } });
    await tx.journalEntry.deleteMany({ where: { id: { in: ids } } });
  }
}

// ---------------------------------------------------------------------------
// 1. Save Cash & Bank opening balances
// ---------------------------------------------------------------------------
export async function saveCashBankOpeningBalances(
  input: CashBankInput,
): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requireRole(['OWNER', 'MANAGER']);
    const businessId = user.businessId;

    if (input.cashOnHandPence < 0 || input.bankBalancePence < 0) {
      throw new UserError('Opening balances cannot be negative.');
    }

    await ensureChartOfAccounts(businessId);

    // Pre-fetch GL accounts outside the transaction (libSQL/Turso limitation)
    const glCodes = [ACCOUNT_CODES.cash, ACCOUNT_CODES.bank, ACCOUNT_CODES.equity];
    let glAccounts = await prisma.account.findMany({
      where: { businessId, code: { in: glCodes } },
      select: { id: true, code: true },
    });
    const accountMap = new Map(glAccounts.map(a => [a.code, a.id]));

    await prisma.$transaction(async (tx) => {
      // Upsert Cash on Hand opening balance
      await tx.openingBalance.upsert({
        where: { businessId_accountCode: { businessId, accountCode: ACCOUNT_CODES.cash } },
        update: {
          amountPence: input.cashOnHandPence,
          accountName: 'Cash on Hand',
          accountType: 'ASSET',
        },
        create: {
          businessId,
          accountCode: ACCOUNT_CODES.cash,
          accountName: 'Cash on Hand',
          accountType: 'ASSET',
          amountPence: input.cashOnHandPence,
        },
      });

      // Upsert Bank opening balance
      await tx.openingBalance.upsert({
        where: { businessId_accountCode: { businessId, accountCode: ACCOUNT_CODES.bank } },
        update: {
          amountPence: input.bankBalancePence,
          accountName: 'Bank',
          accountType: 'ASSET',
        },
        create: {
          businessId,
          accountCode: ACCOUNT_CODES.bank,
          accountName: 'Bank',
          accountType: 'ASSET',
          amountPence: input.bankBalancePence,
        },
      });

      // Delete previous OB journal entries for cash/bank
      await deleteOpeningBalanceJournals(businessId, 'OPENING_BALANCE_CASH_BANK', tx);

      // Post balanced journal entry: DR Cash + Bank, CR Equity
      const totalAssets = input.cashOnHandPence + input.bankBalancePence;
      if (totalAssets > 0) {
        const lines = [];
        if (input.cashOnHandPence > 0) {
          lines.push({ accountCode: ACCOUNT_CODES.cash, debitPence: input.cashOnHandPence });
        }
        if (input.bankBalancePence > 0) {
          lines.push({ accountCode: ACCOUNT_CODES.bank, debitPence: input.bankBalancePence });
        }
        lines.push({ accountCode: ACCOUNT_CODES.equity, creditPence: totalAssets });

        await postJournalEntry({
          businessId,
          description: 'Opening Balance — Cash & Bank',
          referenceType: 'OPENING_BALANCE_CASH_BANK',
          lines,
          prismaClient: tx as any,
          accountMap,
        });
      }
    });

    revalidateTag('reports');
    return ok();
  });
}

// ---------------------------------------------------------------------------
// 2. Save opening AR (per-customer SalesInvoices)
// ---------------------------------------------------------------------------
export async function saveOpeningAR(
  customers: CustomerDebt[],
): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requireRole(['OWNER', 'MANAGER']);
    const businessId = user.businessId;

    // Validate
    for (const c of customers) {
      if (c.amountPence < 0) throw new UserError('Customer debt amounts cannot be negative.');
      if (!c.customerId) throw new UserError('Customer ID is required for each entry.');
    }

    // Only process customers with non-zero amounts
    const validEntries = customers.filter(c => c.amountPence > 0);

    // Need a store and till for SalesInvoice creation
    const store = await prisma.store.findFirst({
      where: { businessId },
      select: { id: true },
    });
    if (!store) throw new UserError('No store found. Please create a store first.');

    const till = await prisma.till.findFirst({
      where: { storeId: store.id },
      select: { id: true },
    });
    if (!till) throw new UserError('No till found. Please create a till first.');

    await ensureChartOfAccounts(businessId);

    // Pre-fetch GL accounts
    const glCodes = [ACCOUNT_CODES.ar, ACCOUNT_CODES.equity];
    const glAccounts = await prisma.account.findMany({
      where: { businessId, code: { in: glCodes } },
      select: { id: true, code: true },
    });
    const accountMap = new Map(glAccounts.map(a => [a.code, a.id]));

    await prisma.$transaction(async (tx) => {
      // Delete existing opening balance AR invoices
      const existingOB = await tx.salesInvoice.findMany({
        where: { businessId, externalRef: { startsWith: 'OB-AR-' } },
        select: { id: true },
      });
      if (existingOB.length > 0) {
        const ids = existingOB.map(i => i.id);
        await tx.salesPayment.deleteMany({ where: { salesInvoiceId: { in: ids } } });
        await tx.salesInvoiceLine.deleteMany({ where: { salesInvoiceId: { in: ids } } });
        await tx.salesInvoice.deleteMany({ where: { id: { in: ids } } });
      }

      // Delete previous OB AR journal entries
      await deleteOpeningBalanceJournals(businessId, 'OPENING_BALANCE_AR', tx);

      // Upsert the AR opening balance total
      const totalAR = validEntries.reduce((sum, c) => sum + c.amountPence, 0);
      await tx.openingBalance.upsert({
        where: { businessId_accountCode: { businessId, accountCode: ACCOUNT_CODES.ar } },
        update: { amountPence: totalAR, accountName: 'Accounts Receivable', accountType: 'ASSET' },
        create: {
          businessId,
          accountCode: ACCOUNT_CODES.ar,
          accountName: 'Accounts Receivable',
          accountType: 'ASSET',
          amountPence: totalAR,
        },
      });

      // Create one SalesInvoice per customer
      for (const entry of validEntries) {
        await tx.salesInvoice.create({
          data: {
            businessId,
            storeId: store.id,
            tillId: till.id,
            cashierUserId: user.id,
            customerId: entry.customerId,
            paymentStatus: 'UNPAID',
            externalRef: `OB-AR-${entry.customerId}`,
            subtotalPence: entry.amountPence,
            vatPence: 0,
            totalPence: entry.amountPence,
          },
        });
      }

      // Post single journal: DR AR, CR Equity
      if (totalAR > 0) {
        await postJournalEntry({
          businessId,
          description: 'Opening Balance — Accounts Receivable',
          referenceType: 'OPENING_BALANCE_AR',
          lines: [
            { accountCode: ACCOUNT_CODES.ar, debitPence: totalAR },
            { accountCode: ACCOUNT_CODES.equity, creditPence: totalAR },
          ],
          prismaClient: tx as any,
          accountMap,
        });
      }
    });

    revalidateTag('reports');
    return ok();
  });
}

// ---------------------------------------------------------------------------
// 3. Save opening AP (per-supplier PurchaseInvoices)
// ---------------------------------------------------------------------------
export async function saveOpeningAP(
  suppliers: SupplierDebt[],
): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requireRole(['OWNER', 'MANAGER']);
    const businessId = user.businessId;

    // Validate
    for (const s of suppliers) {
      if (s.amountPence < 0) throw new UserError('Supplier debt amounts cannot be negative.');
      if (!s.supplierId) throw new UserError('Supplier ID is required for each entry.');
    }

    const validEntries = suppliers.filter(s => s.amountPence > 0);

    const store = await prisma.store.findFirst({
      where: { businessId },
      select: { id: true },
    });
    if (!store) throw new UserError('No store found. Please create a store first.');

    await ensureChartOfAccounts(businessId);

    // Pre-fetch GL accounts
    const glCodes = [ACCOUNT_CODES.ap, ACCOUNT_CODES.equity];
    const glAccounts = await prisma.account.findMany({
      where: { businessId, code: { in: glCodes } },
      select: { id: true, code: true },
    });
    const accountMap = new Map(glAccounts.map(a => [a.code, a.id]));

    await prisma.$transaction(async (tx) => {
      // Delete existing opening balance AP invoices
      const existingOB = await tx.purchaseInvoice.findMany({
        where: {
          businessId,
          // Use a date-based marker: Opening balances have year 1970 (epoch)
          // We'll use a special approach: find by the OPENING_BALANCE_AP journal
        },
        select: { id: true },
      });

      // More reliable: find by cross-referencing with journal entries
      const obJournals = await tx.journalEntry.findMany({
        where: { businessId, referenceType: 'OPENING_BALANCE_AP' },
        select: { referenceId: true },
      });
      const obPurchaseIds = obJournals
        .map(j => j.referenceId)
        .filter((id): id is string => !!id);

      if (obPurchaseIds.length > 0) {
        await tx.purchasePayment.deleteMany({ where: { purchaseInvoiceId: { in: obPurchaseIds } } });
        await tx.purchaseInvoiceLine.deleteMany({ where: { purchaseInvoiceId: { in: obPurchaseIds } } });
        await tx.purchaseInvoice.deleteMany({ where: { id: { in: obPurchaseIds } } });
      }

      // Delete previous OB AP journal entries
      await deleteOpeningBalanceJournals(businessId, 'OPENING_BALANCE_AP', tx);

      // Upsert the AP opening balance total
      const totalAP = validEntries.reduce((sum, s) => sum + s.amountPence, 0);
      await tx.openingBalance.upsert({
        where: { businessId_accountCode: { businessId, accountCode: ACCOUNT_CODES.ap } },
        update: { amountPence: totalAP, accountName: 'Accounts Payable', accountType: 'LIABILITY' },
        create: {
          businessId,
          accountCode: ACCOUNT_CODES.ap,
          accountName: 'Accounts Payable',
          accountType: 'LIABILITY',
          amountPence: totalAP,
        },
      });

      // Create one PurchaseInvoice per supplier + individual journal
      for (const entry of validEntries) {
        const invoice = await tx.purchaseInvoice.create({
          data: {
            businessId,
            storeId: store.id,
            supplierId: entry.supplierId,
            paymentStatus: 'UNPAID',
            subtotalPence: entry.amountPence,
            vatPence: 0,
            totalPence: entry.amountPence,
          },
        });

        // Post journal per invoice: DR Equity, CR AP
        await postJournalEntry({
          businessId,
          description: `Opening Balance — Supplier Debt`,
          referenceType: 'OPENING_BALANCE_AP',
          referenceId: invoice.id,
          lines: [
            { accountCode: ACCOUNT_CODES.equity, debitPence: entry.amountPence },
            { accountCode: ACCOUNT_CODES.ap, creditPence: entry.amountPence },
          ],
          prismaClient: tx as any,
          accountMap,
        });
      }
    });

    revalidateTag('reports');
    return ok();
  });
}
