import PageHeader from '@/components/PageHeader';
import FormError from '@/components/FormError';
import SubmitButton from '@/components/SubmitButton';
import { prisma } from '@/lib/prisma';
import { requireBusiness } from '@/lib/auth';
import { formatMoney, formatDateTime } from '@/lib/format';
import { recordExpensePaymentAction } from '@/app/actions/expense-payments';

export default async function ExpensePaymentsPage({ searchParams }: { searchParams?: { error?: string } }) {
  const { user, business } = await requireBusiness(['MANAGER', 'OWNER']);
  if (!business) return <div className="card p-6">Seed data missing.</div>;

  const expenses = await prisma.expense.findMany({
    where: { businessId: business.id, paymentStatus: { in: ['UNPAID', 'PART_PAID'] } },
    include: { account: true, payments: true },
    orderBy: { createdAt: 'desc' }
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Expense Payments" subtitle="Settle unpaid operating expenses." />
      <FormError error={searchParams?.error} />
      <div className="card p-6">
        <table className="table w-full border-separate border-spacing-y-2">
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
                    <form action={recordExpensePaymentAction} className="grid gap-2 md:grid-cols-2">
                      <input type="hidden" name="expenseId" value={expense.id} />
                      <div>
                        <div className="text-xs text-black/50">Payment method</div>
                        <select className="input" name="method" defaultValue="CASH">
                          <option value="CASH">Cash</option>
                          <option value="CARD">Card</option>
                          <option value="TRANSFER">Transfer</option>
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
                      <div className="md:col-span-2">
                        <div className="text-xs text-black/50">Reference (optional)</div>
                        <input className="input" name="reference" placeholder="Receipt / transaction ref" />
                      </div>
                      <div className="md:col-span-2">
                        <SubmitButton className="btn-primary w-full text-xs" loadingText="Recording…">Record payment</SubmitButton>
                      </div>
                    </form>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {expenses.length === 0 ? <div className="text-sm text-black/50">No unpaid expenses.</div> : null}
      </div>
    </div>
  );
}
