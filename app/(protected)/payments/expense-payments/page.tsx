import Link from 'next/link';
import PageHeader from '@/components/PageHeader';
import FormError from '@/components/FormError';
import HashScroll from '@/components/HashScroll';
import ResponsiveDataTable from '@/components/ResponsiveDataTable';
import { DataCard, DataCardActions, DataCardField, DataCardHeader } from '@/components/DataCard';
import RemainingBalance from '@/components/RemainingBalance';
import { prisma } from '@/lib/prisma';
import { requireBusiness } from '@/lib/auth';
import { formatMoney, formatDateTime } from '@/lib/format';
import { displayDocumentNumber, remainingBalancePence } from '@/lib/reliability/walkthrough-contracts';
import ExpensePaymentForm from './ExpensePaymentForm';

type OpenTillOption = { tillId: string; tillName: string; shiftId: string };

export default async function ExpensePaymentsPage({
  searchParams,
}: {
  searchParams?: { error?: string; expenseId?: string; paid?: string };
}) {
  const { business } = await requireBusiness(['MANAGER', 'OWNER']);
  if (!business) return <div className="card p-6">Seed data missing.</div>;
  // "Record payment" on the Expenses list arrives here with the expense to settle.
  // A success redirect (`?paid=`) keeps that same expense in focus after the payment.
  const focusExpenseId = searchParams?.expenseId?.trim() || searchParams?.paid?.trim() || '';

  const [unpaidExpenses, openShifts, focusedExpense] = await Promise.all([
    prisma.expense.findMany({
      where: { businessId: business.id, paymentStatus: { in: ['UNPAID', 'PART_PAID'] } },
      select: {
        id: true,
        storeId: true,
        transactionNumber: true,
        createdAt: true,
        amountPence: true,
        paymentStatus: true,
        account: { select: { name: true } },
        payments: { select: { amountPence: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.shift.findMany({
      where: {
        status: 'OPEN',
        till: { active: true, store: { businessId: business.id } },
      },
      select: { id: true, tillId: true, till: { select: { name: true } } },
      orderBy: { openedAt: 'desc' },
    }),
    focusExpenseId
      ? prisma.expense.findFirst({
          where: { id: focusExpenseId, businessId: business.id },
          select: { id: true, transactionNumber: true, paymentStatus: true },
        })
      : Promise.resolve(null),
  ]);

  // The focused expense is listed first so it is the row the owner sees on arrival.
  const expenses = focusedExpense
    ? [
        ...unpaidExpenses.filter((expense) => expense.id === focusedExpense.id),
        ...unpaidExpenses.filter((expense) => expense.id !== focusedExpense.id),
      ]
    : unpaidExpenses;
  const focusedLabel = focusedExpense
    ? displayDocumentNumber('expense', focusedExpense.transactionNumber, focusedExpense.id)
    : null;
  const focusedIsSettled = Boolean(focusedExpense) && !unpaidExpenses.some((expense) => expense.id === focusedExpense?.id);

  const openTills: OpenTillOption[] = openShifts.map((shift) => ({
    tillId: shift.tillId,
    tillName: shift.till.name,
    shiftId: shift.id,
  }));

  return (
    <div className="space-y-6">
      <HashScroll />
      <PageHeader
        title="Expense Payments"
        subtitle="Settle unpaid operating expenses."
        actions={
          <Link className="btn-secondary w-full text-center text-xs sm:w-auto" href="/expenses">
            ← Back to Expenses
          </Link>
        }
      />
      {focusedLabel ? (
        <div
          className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-accent/30 bg-accentSoft px-4 py-3 text-sm"
          data-testid="expense-payment-focus"
        >
          <span className="font-semibold text-ink">
            {focusedIsSettled ? `${focusedLabel} is fully paid.` : `Paying ${focusedLabel} — it is listed first below.`}
          </span>
          <Link className="text-xs font-semibold text-accent underline" href="/payments/expense-payments">
            Show all unpaid expenses
          </Link>
        </div>
      ) : null}
      <FormError error={searchParams?.error} />
      <ResponsiveDataTable
        mode="cards"
        desktop={
          <div className="card p-6">
            <div className="responsive-table-shell">
              <table className="table w-full min-w-[56rem] border-separate border-spacing-y-2">
                <thead>
                  <tr>
                    <th>Number</th>
                    <th>Date</th>
                    <th>Category</th>
                    <th>Balance</th>
                    <th>Payment</th>
                  </tr>
                </thead>
                <tbody>
                  {expenses.map((expense) => {
                    const paid = expense.payments.reduce((sum, payment) => sum + payment.amountPence, 0);
                    const outstanding = remainingBalancePence(expense.amountPence, paid);
                    return (
                      <tr
                        key={expense.id}
                        id={`expense-${expense.id}`}
                        className={`rounded-xl align-top ${expense.id === focusedExpense?.id ? 'bg-accentSoft' : 'bg-white'}`}
                      >
                        <td className="px-3 py-3 font-mono text-xs">
                          {displayDocumentNumber('expense', expense.transactionNumber, expense.id)}
                        </td>
                        <td className="px-3 py-3 text-sm">{formatDateTime(expense.createdAt)}</td>
                        <td className="px-3 py-3 text-sm">{expense.account.name}</td>
                        <td className="px-3 py-3">
                          <RemainingBalance
                            amountPence={expense.amountPence}
                            paidPence={paid}
                            currency={business.currency}
                          />
                          <div className="mt-1 text-xs text-black/45">
                            Outstanding {formatMoney(outstanding, business.currency)}
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <ExpensePaymentForm
                            expenseId={expense.id}
                            storeId={expense.storeId}
                            openTills={openTills}
                            remainingPence={outstanding}
                          />
                        </td>
                      </tr>
                    );
                  })}
                  {expenses.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-3 py-8 text-center text-sm text-black/50">
                        No unpaid expenses.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        }
        mobile={
          expenses.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-black/15 bg-white px-5 py-6 text-center text-sm text-black/50">
              No unpaid expenses.
            </div>
          ) : (
            <div className="space-y-3">
              {expenses.map((expense) => {
                const paid = expense.payments.reduce((sum, payment) => sum + payment.amountPence, 0);
                const outstanding = remainingBalancePence(expense.amountPence, paid);
                const statusLabel =
                  expense.paymentStatus === 'PART_PAID'
                    ? 'Part paid'
                    : expense.paymentStatus === 'UNPAID'
                      ? 'Unpaid'
                      : expense.paymentStatus;

                return (
                  <div key={expense.id} id={`expense-${expense.id}`}>
                  <DataCard className={expense.id === focusedExpense?.id ? 'border-accent/40 ring-1 ring-accent/30' : ''}>
                    <DataCardHeader
                      title={expense.account.name}
                      subtitle={`${displayDocumentNumber('expense', expense.transactionNumber, expense.id)} · ${formatDateTime(expense.createdAt)}`}
                      aside={
                        <span className="font-semibold tabular-nums text-amber-700">
                          {formatMoney(outstanding, business.currency)}
                        </span>
                      }
                    />
                    <RemainingBalance
                      className="mt-3"
                      amountPence={expense.amountPence}
                      paidPence={paid}
                      currency={business.currency}
                    />
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <DataCardField label="Status" value={statusLabel} valueClassName="font-semibold text-amber-700" />
                      <DataCardField
                        label="Original amount"
                        value={formatMoney(expense.amountPence, business.currency)}
                        valueClassName="tabular-nums"
                      />
                    </div>
                    <DataCardActions className="flex-col">
                      <ExpensePaymentForm
                        expenseId={expense.id}
                        storeId={expense.storeId}
                        openTills={openTills}
                        remainingPence={outstanding}
                      />
                    </DataCardActions>
                  </DataCard>
                  </div>
                );
              })}
            </div>
          )
        }
      />
    </div>
  );
}
