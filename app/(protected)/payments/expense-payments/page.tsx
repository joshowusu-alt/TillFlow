import PageHeader from '@/components/PageHeader';
import FormError from '@/components/FormError';
import SubmitButton from '@/components/SubmitButton';
import ResponsiveDataTable from '@/components/ResponsiveDataTable';
import { DataCard, DataCardActions, DataCardField, DataCardHeader } from '@/components/DataCard';
import { prisma } from '@/lib/prisma';
import { requireBusinessStore } from '@/lib/auth';
import { formatMoney, formatDateTime } from '@/lib/format';
import { recordExpensePaymentAction } from '@/app/actions/expense-payments';
import StableIdempotencyKeyInput from '@/components/StableIdempotencyKeyInput';

type OpenTillOption = { tillId: string; tillName: string; shiftId: string };

function ExpensePaymentForm({
  expenseId,
  openTills,
}: {
  expenseId: string;
  openTills: OpenTillOption[];
}) {
  return (
    <form action={recordExpensePaymentAction} className="grid gap-2 sm:grid-cols-2">
      <input type="hidden" name="expenseId" value={expenseId} />
      <StableIdempotencyKeyInput scope={`expense-payment:${expenseId}`} />
      <div>
        <div className="text-xs text-black/50">Payment method</div>
        <select className="input" name="method" defaultValue="CASH">
          <option value="CASH">Cash</option>
          <option value="CARD">Card</option>
          <option value="TRANSFER">Transfer</option>
          <option value="MOBILE_MONEY">Mobile Money</option>
        </select>
      </div>
      <div>
        <div className="text-xs text-black/50">Till (cash from this drawer)</div>
        <select className="input" name="tillId" required={openTills.length > 0} defaultValue={openTills.length === 1 ? openTills[0].tillId : ''}>
          {openTills.length === 0 ? (
            <option value="">No open till — open a till for cash</option>
          ) : (
            <>
              {openTills.length > 1 ? <option value="">Select till…</option> : null}
              {openTills.map((till) => (
                <option key={till.tillId} value={till.tillId}>
                  {till.tillName}
                </option>
              ))}
            </>
          )}
        </select>
      </div>
      <div>
        <div className="text-xs text-black/50">Amount</div>
        <input
          className="input"
          name="amount"
          type="number"
          min={0}
          step="0.01"
          inputMode="decimal"
          placeholder="0.00"
        />
      </div>
      <div className="sm:col-span-2">
        <div className="text-xs text-black/50">Reference (optional)</div>
        <input className="input" name="reference" placeholder="Receipt / transaction ref" />
      </div>
      <div className="sm:col-span-2">
        <SubmitButton className="btn-primary w-full text-xs" loadingText="Recording…">
          Record payment
        </SubmitButton>
      </div>
    </form>
  );
}

export default async function ExpensePaymentsPage({ searchParams }: { searchParams?: { error?: string } }) {
  const { business, store } = await requireBusinessStore(['MANAGER', 'OWNER']);
  if (!business || !store) return <div className="card p-6">Seed data missing.</div>;

  const [expenses, openShifts] = await Promise.all([
    prisma.expense.findMany({
      where: { businessId: business.id, paymentStatus: { in: ['UNPAID', 'PART_PAID'] } },
      select: {
        id: true,
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
        till: { storeId: store.id, active: true, store: { businessId: business.id } },
      },
      select: { id: true, tillId: true, till: { select: { name: true } } },
      orderBy: { openedAt: 'desc' },
    }),
  ]);

  const openTills = openShifts.map((shift) => ({
    tillId: shift.tillId,
    tillName: shift.till.name,
    shiftId: shift.id,
  }));

  return (
    <div className="space-y-6">
      <PageHeader title="Expense Payments" subtitle="Settle unpaid operating expenses." />
      <FormError error={searchParams?.error} />
      <ResponsiveDataTable
        mode="cards"
        desktop={
          <div className="card p-6">
            <div className="responsive-table-shell">
              <table className="table w-full min-w-[56rem] border-separate border-spacing-y-2">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Category</th>
                    <th>Outstanding</th>
                    <th>Payment</th>
                  </tr>
                </thead>
                <tbody>
                  {expenses.map((expense) => {
                    const paid = expense.payments.reduce((sum, payment) => sum + payment.amountPence, 0);
                    const outstanding = Math.max(expense.amountPence - paid, 0);
                    return (
                      <tr key={expense.id} className="rounded-xl bg-white align-top">
                        <td className="px-3 py-3 text-sm">{formatDateTime(expense.createdAt)}</td>
                        <td className="px-3 py-3 text-sm">{expense.account.name}</td>
                        <td className="px-3 py-3 text-sm font-semibold">
                          {formatMoney(outstanding, business.currency)}
                        </td>
                        <td className="px-3 py-3">
                          <ExpensePaymentForm expenseId={expense.id} openTills={openTills} />
                        </td>
                      </tr>
                    );
                  })}
                  {expenses.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-3 py-8 text-center text-sm text-black/50">
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
                const outstanding = Math.max(expense.amountPence - paid, 0);
                const statusLabel =
                  expense.paymentStatus === 'PART_PAID'
                    ? 'Part paid'
                    : expense.paymentStatus === 'UNPAID'
                      ? 'Unpaid'
                      : expense.paymentStatus;

                return (
                  <DataCard key={expense.id}>
                    <DataCardHeader
                      title={expense.account.name}
                      subtitle={formatDateTime(expense.createdAt)}
                      aside={
                        <span className="font-semibold tabular-nums text-amber-700">
                          {formatMoney(outstanding, business.currency)}
                        </span>
                      }
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
                      <ExpensePaymentForm expenseId={expense.id} openTills={openTills} />
                    </DataCardActions>
                  </DataCard>
                );
              })}
            </div>
          )
        }
      />
    </div>
  );
}
