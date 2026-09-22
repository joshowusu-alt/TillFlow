import Link from 'next/link';
import PageHeader from '@/components/PageHeader';
import Pagination from '@/components/Pagination';
import { DataCard, DataCardActions, DataCardField, DataCardHeader } from '@/components/DataCard';
import RemainingBalance from '@/components/RemainingBalance';
import { prisma } from '@/lib/prisma';
import { requireBusinessAndOptionalStore } from '@/lib/auth';
import { resolveSoleOrSelectedStoreId } from '@/lib/reliability/selected-store';
import SelectOperationalStoreNotice from '@/components/SelectOperationalStoreNotice';
import EffectiveStoreBanner from '@/components/EffectiveStoreBanner';
import { formatMoney, formatDateTime, DEFAULT_PAGE_SIZE } from '@/lib/format';
import { getFeatures } from '@/lib/features';
import { ACCOUNT_CODES } from '@/lib/accounting';
import { displayDocumentNumber, remainingBalancePence } from '@/lib/reliability/walkthrough-contracts';
import ExpenseForm from './ExpenseForm';

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams?: { error?: string; page?: string; recorded?: string; sourceAdjustmentId?: string; storeId?: string };
}) {
  const { user, business, store: operationalStore, stores } = await requireBusinessAndOptionalStore(['MANAGER', 'OWNER']);
  if (!business) return <div className="card p-6">Seed data missing.</div>;
  const selectedStoreId = operationalStore?.id ?? resolveSoleOrSelectedStoreId(stores, searchParams?.storeId);
  const store = stores.find((item) => item.id === selectedStoreId) ?? operationalStore ?? null;

  const features = getFeatures((business as any).plan ?? (business.mode as any), (business as any).storeMode as any);
  const page = Math.max(1, parseInt(searchParams?.page ?? '1', 10) || 1);

  const [expenseAccounts, expenseCount, expenses, openShifts] = await Promise.all([
    prisma.account.findMany({
      where: {
        businessId: business.id,
        type: 'EXPENSE',
        code: { not: ACCOUNT_CODES.cogs },
      },
      orderBy: { code: 'asc' },
      select: { id: true, code: true, name: true },
    }),
    prisma.expense.count({ where: { businessId: business.id } }),
    prisma.expense.findMany({
      where: { businessId: business.id },
      select: {
        id: true,
        storeId: true,
        transactionNumber: true,
        createdAt: true,
        amountPence: true,
        paymentStatus: true,
        method: true,
        vendorName: true,
        notes: true,
        attachmentPath: true,
        account: { select: { name: true } },
        user: { select: { name: true } },
        payments: { select: { amountPence: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * DEFAULT_PAGE_SIZE,
      take: DEFAULT_PAGE_SIZE,
    }),
    store
      ? prisma.shift.findMany({
          where: {
            status: 'OPEN',
            till: { storeId: store.id, active: true, store: { businessId: business.id } },
          },
          select: { id: true, tillId: true, till: { select: { name: true } } },
          orderBy: { openedAt: 'desc' },
        })
      : Promise.resolve([]),
  ]);

  const totalPages = Math.max(1, Math.ceil(expenseCount / DEFAULT_PAGE_SIZE));
  // Paying an existing expense happens on Expense payments; the list must say so
  // on every unpaid or part-paid row, or the owner lands on "Record expense" instead.
  // Expense payments is scoped to the operational store, so the action is only offered
  // for expenses in the selected branch; other branches' expenses say which branch to switch to.
  const recordPaymentHref = (expenseId: string) =>
    `/payments/expense-payments?expenseId=${encodeURIComponent(expenseId)}`;
  const storeNameById = new Map(stores.map((item) => [item.id, item.name]));
  const renderPaymentAction = (expense: { id: string; storeId: string; amountPence: number }, paidPence: number) => {
    if (remainingBalancePence(expense.amountPence, paidPence) <= 0) {
      return <span className="text-xs text-black/40">Paid</span>;
    }
    if (store && expense.storeId === store.id) {
      return (
        <Link className="btn-primary text-xs" href={recordPaymentHref(expense.id)}>
          Record payment
        </Link>
      );
    }
    return (
      <span className="text-xs text-black/50" data-testid="expense-other-branch">
        Switch to {storeNameById.get(expense.storeId) ?? 'its branch'} to pay
      </span>
    );
  };

  return (
    <div className="space-y-4 sm:space-y-5">
      <PageHeader
        title="Expenses"
        subtitle="Track operating costs and cash outflows."
        primaryCta={{ label: 'Record expense', href: '#record-expense' }}
      />

      <details className="details-mobile" id="record-expense" open>
        <summary className="flex cursor-pointer list-none items-center justify-between rounded-2xl border border-slate-200/80 bg-white/90 px-4 py-3 shadow-sm">
          <span className="flex items-center gap-2 text-sm font-semibold text-ink">
            <svg className="h-4 w-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Record expense
          </span>
          <svg className="h-4 w-4 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        </summary>
        <div className="card mt-2 p-4 sm:p-5">
          {store ? (
          <>
          <EffectiveStoreBanner
            storeName={store.name}
            actionLabel="This expense will be recorded in this branch."
          />
          <ExpenseForm
            businessId={business.id}
            currency={business.currency}
            accounts={expenseAccounts}
            openShifts={openShifts.map((shift) => ({ tillId: shift.tillId, tillName: shift.till.name }))}
            detailedCategories={features.detailedExpenseCategories}
            error={searchParams?.error}
            recorded={searchParams?.recorded === '1'}
            sourceAdjustmentId={searchParams?.sourceAdjustmentId?.trim() || undefined}
            storeId={store.id}
            actorRole={user.role}
          />
          </>
          ) : (
            <SelectOperationalStoreNotice
              stores={stores}
              canSwitch={user.role === 'OWNER' || user.role === 'MANAGER'}
              title="Select a branch before recording an expense"
            />
          )}
        </div>
      </details>

      <div className="card p-4 sm:p-5">
        <h2 className="text-lg font-display font-semibold">Recent expenses</h2>
        <div className="mt-4 space-y-4 lg:hidden">
          {expenses.map((expense) => {
            const paidPence = expense.payments.reduce((sum, payment) => sum + payment.amountPence, 0);
            return (
              <DataCard key={expense.id}>
                <DataCardHeader
                  title={expense.account.name}
                  subtitle={`${displayDocumentNumber('expense', expense.transactionNumber, expense.id)} · ${formatDateTime(expense.createdAt)}`}
                  aside={<span className="pill bg-black/5 text-black/60 text-[11px]">{expense.paymentStatus}</span>}
                />
                <RemainingBalance
                  amountPence={expense.amountPence}
                  paidPence={paidPence}
                  currency={business.currency}
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  <DataCardField label="Amount" value={formatMoney(expense.amountPence, business.currency)} />
                  <DataCardField label="Method" value={expense.method ?? '-'} />
                  <DataCardField label="Vendor" value={expense.vendorName ?? '-'} />
                  <DataCardField label="Recorded by" value={expense.user.name} />
                </div>
                {expense.notes ? <p className="text-sm text-black/60">{expense.notes}</p> : null}
                {remainingBalancePence(expense.amountPence, paidPence) > 0 || expense.attachmentPath ? (
                  <DataCardActions>
                    {remainingBalancePence(expense.amountPence, paidPence) > 0
                      ? renderPaymentAction(expense, paidPence)
                      : null}
                    {expense.attachmentPath ? (
                      <a className="btn-ghost text-xs" href={expense.attachmentPath} target="_blank" rel="noreferrer">
                        View attachment
                      </a>
                    ) : null}
                  </DataCardActions>
                ) : null}
              </DataCard>
            );
          })}
        </div>
        <div className="responsive-table-shell mt-4 hidden lg:block">
          <table className="table w-full border-separate border-spacing-y-2">
            <thead>
              <tr>
                <th>Number</th>
                <th>Date</th>
                <th>Category</th>
                <th>Amount</th>
                <th>Paid</th>
                <th>Remaining</th>
                <th>Status</th>
                <th className="hidden sm:table-cell">Method</th>
                <th className="hidden sm:table-cell">Vendor</th>
                <th className="hidden lg:table-cell">Recorded By</th>
                <th className="hidden lg:table-cell">Notes</th>
                <th className="hidden sm:table-cell">Attachment</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((expense) => {
                const paidPence = expense.payments.reduce((sum, payment) => sum + payment.amountPence, 0);
                return (
                  <tr key={expense.id} className="rounded-xl bg-white">
                    <td className="px-3 py-3 font-mono text-xs">
                      {displayDocumentNumber('expense', expense.transactionNumber, expense.id)}
                    </td>
                    <td className="px-3 py-3 text-sm">{formatDateTime(expense.createdAt)}</td>
                    <td className="px-3 py-3 text-sm font-semibold">{expense.account.name}</td>
                    <td className="px-3 py-3 text-sm font-semibold">
                      {formatMoney(expense.amountPence, business.currency)}
                    </td>
                    <td className="px-3 py-3 text-sm tabular-nums">
                      {formatMoney(paidPence, business.currency)}
                    </td>
                    <td className="px-3 py-3 text-sm font-semibold tabular-nums">
                      {formatMoney(remainingBalancePence(expense.amountPence, paidPence), business.currency)}
                    </td>
                    <td className="px-3 py-3 text-sm">
                      <span className="pill bg-black/5 text-black/60">{expense.paymentStatus}</span>
                    </td>
                    <td className="hidden sm:table-cell px-3 py-3 text-sm">{expense.method ?? '-'}</td>
                    <td className="hidden sm:table-cell px-3 py-3 text-sm">{expense.vendorName ?? '-'}</td>
                    <td className="hidden lg:table-cell px-3 py-3 text-sm">{expense.user.name}</td>
                    <td className="hidden lg:table-cell px-3 py-3 text-sm text-black/60">{expense.notes ?? '-'}</td>
                    <td className="hidden sm:table-cell px-3 py-3 text-sm">
                      {expense.attachmentPath ? (
                        <a className="btn-ghost text-xs" href={expense.attachmentPath} target="_blank" rel="noreferrer">
                          View
                        </a>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="px-3 py-3 text-sm">{renderPaymentAction(expense, paidPence)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pagination currentPage={page} totalPages={totalPages} basePath="/expenses" />
        {expenses.length === 0 ? <div className="text-sm text-black/50">No expenses yet.</div> : null}
      </div>
    </div>
  );
}
