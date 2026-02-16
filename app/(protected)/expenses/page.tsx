import PageHeader from '@/components/PageHeader';
import FormError from '@/components/FormError';
import { prisma } from '@/lib/prisma';
import { requireBusinessStore } from '@/lib/auth';
import { formatMoney, formatDateTime } from '@/lib/format';
import { getFeatures } from '@/lib/features';
import { createExpenseAction } from '@/app/actions/expenses';
import { ACCOUNT_CODES } from '@/lib/accounting';

export default async function ExpensesPage({ searchParams }: { searchParams?: { error?: string } }) {
  const { user, business, store } = await requireBusinessStore(['MANAGER', 'OWNER']);
  if (!business || !store) return <div className="card p-6">Seed data missing.</div>;

  const features = getFeatures(business.mode as any);
  const expenseAccounts = await prisma.account.findMany({
    where: {
      businessId: business.id,
      type: 'EXPENSE',
      code: { not: ACCOUNT_CODES.cogs }
    },
    orderBy: { code: 'asc' }
  });

  const expenses = await prisma.expense.findMany({
    where: { businessId: business.id },
    include: { account: true, user: true },
    orderBy: { createdAt: 'desc' },
    take: 50
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Expenses" subtitle="Track operating costs and cash outflows." />

      <div className="card p-6">
        <h2 className="text-lg font-display font-semibold">Record expense</h2>
        <FormError error={searchParams?.error} />
        <form action={createExpenseAction} className="mt-4 grid gap-4 md:grid-cols-4" encType="multipart/form-data">
          <input type="hidden" name="useSimple" value={features.advancedOps ? 'false' : 'true'} />
          {features.advancedOps ? (
            <div>
              <label className="label">Category</label>
              <select className="input" name="accountId" required>
                {expenseAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.code} — {account.name}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="md:col-span-2">
              <label className="label">Category</label>
              <div className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm font-semibold">
                Operating Expenses
              </div>
              <div className="mt-1 text-xs text-black/50">
                Simple mode uses one expense bucket. Switch to Advanced for full categories.
              </div>
            </div>
          )}
          <div>
            <label className="label">Amount</label>
            <input className="input" name="amount" placeholder="0.00" required />
          </div>
          <div>
            <label className="label">Payment Status</label>
            <select className="input" name="paymentStatus" defaultValue="PAID">
              <option value="PAID">Paid</option>
              <option value="PART_PAID">Part Paid</option>
              <option value="UNPAID">Unpaid</option>
            </select>
          </div>
          <div>
            <label className="label">Paid Amount</label>
            <input className="input" name="amountPaid" placeholder="0.00" />
            <div className="mt-1 text-xs text-black/50">Leave empty for unpaid.</div>
          </div>
          <div>
            <label className="label">Payment Method</label>
            <select className="input" name="method" defaultValue="CASH">
              <option value="CASH">Cash</option>
              <option value="CARD">Card</option>
              <option value="TRANSFER">Transfer</option>
            </select>
          </div>
          <div>
            <label className="label">Vendor / Payee</label>
            <input className="input" name="vendorName" placeholder="Supplier or payee" />
          </div>
          <div>
            <label className="label">Due Date</label>
            <input className="input" name="dueDate" type="date" />
          </div>
          <div>
            <label className="label">Reference</label>
            <input className="input" name="reference" placeholder="Invoice / receipt ref" />
          </div>
          <div>
            <label className="label">Attachment</label>
            <input className="input" name="attachment" type="file" accept="image/*,.pdf" />
          </div>
          <div className="md:col-span-4">
            <label className="label">Notes</label>
            <input className="input" name="notes" placeholder="Optional notes" />
          </div>
          <div className="md:col-span-4">
            <button className="btn-primary">Record expense</button>
          </div>
        </form>
      </div>

      <div className="card p-6 overflow-x-auto">
        <h2 className="text-lg font-display font-semibold">Recent expenses</h2>
        <table className="table mt-4 w-full border-separate border-spacing-y-2">
          <thead>
            <tr>
              <th>Date</th>
              <th>Category</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Method</th>
              <th>Vendor</th>
              <th>Recorded By</th>
              <th>Notes</th>
              <th>Attachment</th>
            </tr>
          </thead>
          <tbody>
            {expenses.map((expense) => (
              <tr key={expense.id} className="rounded-xl bg-white">
                <td className="px-3 py-3 text-sm">{formatDateTime(expense.createdAt)}</td>
                <td className="px-3 py-3 text-sm font-semibold">{expense.account.name}</td>
                <td className="px-3 py-3 text-sm font-semibold">
                  {formatMoney(expense.amountPence, business.currency)}
                </td>
                <td className="px-3 py-3 text-sm">
                  <span className="pill bg-black/5 text-black/60">{expense.paymentStatus}</span>
                </td>
                <td className="px-3 py-3 text-sm">{expense.method ?? '-'}</td>
                <td className="px-3 py-3 text-sm">{expense.vendorName ?? '-'}</td>
                <td className="px-3 py-3 text-sm">{expense.user.name}</td>
                <td className="px-3 py-3 text-sm text-black/60">{expense.notes ?? '-'}</td>
                <td className="px-3 py-3 text-sm">
                  {expense.attachmentPath ? (
                    <a className="btn-ghost text-xs" href={expense.attachmentPath} target="_blank">
                      View
                    </a>
                  ) : (
                    '-'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {expenses.length === 0 ? <div className="text-sm text-black/50">No expenses yet.</div> : null}
      </div>
    </div>
  );
}
