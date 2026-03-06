import { NextResponse } from 'next/server';
import { requireBusiness } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

/**
 * Diagnostic endpoint — returns raw GL state so you can verify
 * that purchase invoices, journal entries and AP lines really exist.
 *
 * GET /api/debug-financials
 */
export async function GET() {
  try {
    const { business } = await requireBusiness(['OWNER', 'MANAGER']);
    if (!business) return NextResponse.json({ error: 'not found' }, { status: 404 });

    const businessId = business.id;

    const [invoices, journalEntries, apAccount, allAccounts] = await Promise.all([
      prisma.purchaseInvoice.groupBy({
        by: ['paymentStatus'],
        where: { businessId },
        _count: true,
        _sum: { totalPence: true },
      }),
      prisma.journalEntry.groupBy({
        by: ['referenceType'],
        where: { businessId },
        _count: true,
      }),
      prisma.account.findFirst({
        where: { businessId, code: '2000' },
        select: { id: true, code: true, name: true, type: true },
      }),
      prisma.account.findMany({
        where: { businessId },
        select: { code: true, name: true, type: true },
        orderBy: { code: 'asc' },
      }),
    ]);

    // Get AP journal lines if account exists
    let apLines = null;
    if (apAccount) {
      const agg = await prisma.journalLine.aggregate({
        where: { accountId: apAccount.id },
        _sum: { debitPence: true, creditPence: true },
        _count: true,
      });
      apLines = {
        lineCount: agg._count,
        totalDebitPence: agg._sum.debitPence ?? 0,
        totalCreditPence: agg._sum.creditPence ?? 0,
        // LIABILITY balance = credit - debit
        balancePence: (agg._sum.creditPence ?? 0) - (agg._sum.debitPence ?? 0),
        balanceGHS: ((agg._sum.creditPence ?? 0) - (agg._sum.debitPence ?? 0)) / 100,
      };
    }

    // Inventory account
    const invAccount = await prisma.account.findFirst({
      where: { businessId, code: '1200' },
      select: { id: true },
    });
    let invLines = null;
    if (invAccount) {
      const agg = await prisma.journalLine.aggregate({
        where: { accountId: invAccount.id },
        _sum: { debitPence: true, creditPence: true },
        _count: true,
      });
      invLines = {
        lineCount: agg._count,
        totalDebitPence: agg._sum.debitPence ?? 0,
        totalCreditPence: agg._sum.creditPence ?? 0,
        // ASSET balance = debit - credit
        balancePence: (agg._sum.debitPence ?? 0) - (agg._sum.creditPence ?? 0),
        balanceGHS: ((agg._sum.debitPence ?? 0) - (agg._sum.creditPence ?? 0)) / 100,
      };
    }

    return NextResponse.json({
      invoicesByStatus: invoices.map(g => ({
        status: g.paymentStatus,
        count: g._count,
        totalGHS: (g._sum.totalPence ?? 0) / 100,
      })),
      journalEntriesByRefType: journalEntries.map(g => ({
        referenceType: g.referenceType,
        count: g._count,
      })),
      apAccount,
      apLines,
      invLines,
      allAccounts,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
