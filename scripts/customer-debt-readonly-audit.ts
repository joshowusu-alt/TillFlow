/**
 * Administrator-only reconciliation. No writes or payment confirmation.
 * Requires the existing PostgreSQL Prisma client and an explicitly chosen tenant.
 * Run: npx tsx scripts/customer-debt-readonly-audit.ts --business-id ID --store-id ID_OR_ALL --expected-database DB_NAME
 * Output has invoice/customer IDs but no names, credentials or connection strings.
 */
import { pinPrismaEnv } from '../lib/database-target-guard';
import { reconcileCustomerDebt } from '../lib/reports/customer-debt-reconciliation';
import { receivableDocumentBalance } from '../lib/reports/receivables-balance';
import { getReceivableAgeBucket } from '../lib/reports/operational-metrics';

function argument(name: string) {
  const index = process.argv.indexOf(name);
  const value = index < 0 ? undefined : process.argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`Required argument: ${name}`);
  return value;
}

async function main() {
  const businessId = argument('--business-id');
  const storeId = argument('--store-id');
  const expectedDatabase = argument('--expected-database');
  const url = process.env.POSTGRES_PRISMA_URL || process.env.DATABASE_URL;
  if (!url || !/^postgres(?:ql)?:\/\//.test(url)) throw new Error('An explicit PostgreSQL datasource is required.');
  pinPrismaEnv(process.env, url);
  process.env.NODE_ENV = 'production';
  const { prisma: client } = await import('../lib/prisma');
  try {
    const report = await client.$transaction(async tx => {
      // PostgreSQL itself refuses INSERT/UPDATE/DELETE for this transaction.
      await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
      const [identity] = await tx.$queryRaw<Array<{ database: string }>>`SELECT current_database() AS database`;
      if (identity?.database !== expectedDatabase) throw new Error('Unexpected database identity.');
      const business = await tx.business.findUniqueOrThrow({ where: { id: businessId }, select: { customerScope: true } });
      if (storeId !== 'ALL' && !(await tx.store.findFirst({ where: { id: storeId, businessId }, select: { id: true } }))) {
        throw new Error('Selected store does not belong to the specified business.');
      }
      const [customers, invoices] = await Promise.all([
        tx.customer.findMany({ where: { businessId, ...(business.customerScope === 'BRANCH' && storeId !== 'ALL' ? { storeId } : {}) }, select: { id: true } }),
        tx.salesInvoice.findMany({
          where: { businessId, paymentStatus: { notIn: ['RETURNED', 'VOID'] } },
          select: {
            id: true, storeId: true, paymentStatus: true, totalPence: true, createdAt: true, dueDate: true,
            customer: { select: { id: true, name: true } },
            payments: { select: { amountPence: true, status: true } },
          },
        }),
      ]);
      const accountIds = new Set(customers.map(customer => customer.id));
      const tradingInvoices = invoices.filter(invoice => storeId === 'ALL' || invoice.storeId === storeId);
      const accountInvoices = invoices.filter(invoice => invoice.customer && accountIds.has(invoice.customer.id));
      const trading = reconcileCustomerDebt(tradingInvoices);
      const accounts = reconcileCustomerDebt(accountInvoices);
      const scopedAccountBalances = accounts.accounts.filter(account => account.balancePence !== 0)
        .map(({ id, balancePence }) => ({ customerId: id, balancePence }));
      return {
        unit: 'integer minor currency units', database: identity.database, businessId, storeId, customerScope: business.customerScope,
        totals: {
          oldTradingDocumentBalancePence: trading.documentBalancePence,
          customerAccountsBalancePence: accounts.customerBalancePence,
          correctedCustomerAmountOwedPence: accounts.customerDuePence,
          customerCreditBalancesPence: accounts.customerCreditPence,
          differencePence: trading.documentBalancePence - accounts.customerBalancePence,
          linkedTradingBalancePence: trading.customerBalancePence,
          unlinkedTradingBalancePence: trading.unlinkedDuePence - trading.unlinkedExcessPence,
          customerScopeDifferencePence: trading.customerBalancePence - accounts.customerBalancePence,
          linkedInvoiceDuePence: trading.customerInvoiceDuePence,
          linkedExcessConfirmedPence: trading.customerExcessPence,
          unlinkedDuePence: trading.unlinkedDuePence,
          unlinkedExcessConfirmedPence: trading.unlinkedExcessPence,
        },
        scopedAccountBalances,
        unresolvedTradingInvoices: tradingInvoices.flatMap(invoice => {
          const balancePence = receivableDocumentBalance(invoice).balancePence;
          if (!balancePence) return [];
          return [{
            invoiceId: invoice.id, customerId: invoice.customer?.id ?? null, storeId: invoice.storeId,
            invoiceStatus: invoice.paymentStatus, balancePence,
            ageBucket: getReceivableAgeBucket(invoice.dueDate, invoice.createdAt),
            unconfirmedPayments: invoice.payments.filter(payment => payment.status !== 'CONFIRMED')
              .map(payment => ({ status: payment.status, amountPence: payment.amountPence })),
          }];
        }),
      };
    }, { isolationLevel: 'RepeatableRead', timeout: 60_000, maxWait: 10_000 });
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } finally {
    await client.$disconnect();
  }
}

main().catch(() => {
  // Never serialize Prisma errors that can include connection details.
  process.stderr.write('Read-only reconciliation failed. Check the selected tenant, store and PostgreSQL client configuration.\n');
  process.exitCode = 1;
});
