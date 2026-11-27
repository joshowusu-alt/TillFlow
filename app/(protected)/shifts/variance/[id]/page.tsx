import { notFound } from 'next/navigation';
import PageHeader from '@/components/PageHeader';
import { formatDateTime, formatMoney } from '@/lib/format';
import { displayDocumentNumber, displayShiftPresentationNumber } from '@/lib/reliability/walkthrough-contracts';
import { requireBusinessAndOptionalStore } from '@/lib/auth';
import { withStoreQuery } from '@/lib/reliability/selected-store';
import SelectOperationalStoreNotice from '@/components/SelectOperationalStoreNotice';
import { prisma } from '@/lib/prisma';
import { VARIANCE_REVIEWER_ROLES } from '@/lib/services/cash-variance';
import { invalidLegacyCloseNote } from '@/lib/reliability/invalid-preview-shift-closures';
import { cashDifferenceReason } from '@/lib/cash-difference-presentation';
import Link from 'next/link';
import { EXPECTED_CASH_ENTRY_TYPES, expectedCashPenceFromEntries } from '@/lib/reports/expected-cash';
import VarianceWorkflowClient from '../VarianceWorkflowClient';

export default async function CashVarianceDetailPage(
  props: {
    params: Promise<{ id: string }>;
    searchParams?: Promise<{ storeId?: string }>;
  }
) {
  const params = await props.params;
  const { user, business, store, stores } = await requireBusinessAndOptionalStore();
  if (!store) {
    return (
      <SelectOperationalStoreNotice
        stores={stores}
        canSwitch={user.role === 'OWNER' || user.role === 'MANAGER'}
        title="Select a branch to open this variance"
      />
    );
  }

  const investigation = await prisma.cashVarianceInvestigation.findFirst({
    where: {
      id: params.id,
      businessId: business.id,
      shift: { till: { storeId: store.id } },
    },
    include: {
      assignedReviewer: { select: { id: true, name: true, role: true } },
      approvedBy: { select: { name: true } },
      reviewedBy: { select: { name: true } },
      shift: {
        select: {
          id: true,
          userId: true,
          shiftNumber: true,
          closureNumber: true,
          actualCashPence: true,
          expectedCashPence: true,
          variance: true,
          varianceReason: true,
          varianceReasonCode: true,
          openedAt: true,
          closedAt: true,
          user: { select: { name: true } },
          till: { select: { name: true } },
        },
      },
    },
  });
  if (!investigation) notFound();

  const drawerTotals = await prisma.cashDrawerEntry.groupBy({
    by: ['entryType'],
    where: { businessId: business.id, storeId: store.id, shiftId: investigation.shift.id, entryType: { in: [...EXPECTED_CASH_ENTRY_TYPES] } },
    _sum: { amountPence: true },
  });
  const entries = drawerTotals.map(row => ({ entryType: row.entryType, amountPence: row._sum.amountPence ?? 0 }));
  const recordedTotal = expectedCashPenceFromEntries(entries);
  const labels = {
    OPEN_FLOAT: 'Opening cash', CASH_SALE: 'Cash sales', CASH_DEBTOR_PAYMENT: 'Credit payments in cash',
    CASH_ADJUSTMENT: 'Cash added or removed', PAID_OUT_SUPPLIER: 'Supplier payments',
    PAID_OUT_EXPENSE: 'Cash expenses', CASH_REFUND: 'Customer refunds', SUPPLIER_REFUND_RECEIVED: 'Supplier refunds',
  };

  const reviewers = await prisma.user.findMany({
    where: {
      businessId: business.id,
      active: true,
      role: { in: [...VARIANCE_REVIEWER_ROLES] },
    },
    select: { id: true, name: true, role: true },
    orderBy: { name: 'asc' },
  });

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader
        title={`Cash ${investigation.variancePence < 0 ? 'shortage' : 'surplus'} — ${formatMoney(Math.abs(investigation.variancePence), business.currency)}`}
        subtitle={`${displayDocumentNumber('cash_variance', investigation.transactionNumber, investigation.id)} · Original cash figures stay unchanged.`}
        secondaryCta={{ label: 'All cash differences', href: withStoreQuery('/shifts/variance', store.id) }}
      />

      {invalidLegacyCloseNote(investigation.shift.actualCashPence) ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          {invalidLegacyCloseNote(investigation.shift.actualCashPence)}
        </div>
      ) : null}

      <div className="card space-y-3 p-5">
        <div className="text-xs uppercase tracking-wide text-black/40">Shift snapshot</div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <div className="text-xs text-black/40">Till / cashier</div>
            <div className="font-semibold">
              {investigation.shift.till.name} · {investigation.shift.user.name}
            </div>
          </div>
          <div>
            <div className="text-xs text-black/40">Shift</div>
            <div className="font-semibold">{displayShiftPresentationNumber(investigation.shift)}</div>
            {investigation.shift.closureNumber ? <p className="text-xs text-black/50">Closure reference: {investigation.shift.closureNumber}</p> : null}
          </div>
          <div>
            <div className="text-xs text-black/40">Counted cash</div>
            <div className="font-semibold">
              {investigation.shift.actualCashPence == null ? 'Not recorded' : formatMoney(investigation.shift.actualCashPence, business.currency)}
            </div>
          </div>
          <div>
            <div className="text-xs text-black/40">Expected cash</div>
            <div className="font-semibold">
              {formatMoney(investigation.shift.expectedCashPence, business.currency)}
            </div>
          </div>
          <div>
            <div className="text-xs text-black/40">Cash doesn't match</div>
            <div className="font-semibold">
              {investigation.variancePence > 0 ? 'Over by ' : 'Short by '}{formatMoney(Math.abs(investigation.variancePence), business.currency)}
            </div>
          </div>
          <div>
            <div className="text-xs text-black/40">Opened / closed</div>
            <div className="text-sm">
              {formatDateTime(investigation.shift.openedAt)}
              {' → '}
              {investigation.shift.closedAt ? formatDateTime(investigation.shift.closedAt) : 'Open'}
            </div>
          </div>
        </div>
      </div>

      <details className="card p-4">
        <summary className="min-h-11 cursor-pointer py-3 font-semibold">Check how expected cash is made up</summary>
        <p className="text-sm text-black/70">These are the drawer entries currently recorded for this shift. MoMo and card sales are not physical cash.</p>
        <dl className="mt-3 space-y-2 text-sm">
          {EXPECTED_CASH_ENTRY_TYPES.map(type => (
            <div key={type} className="flex justify-between gap-3">
              <dt><Link className="inline-flex min-h-11 items-center text-accent underline" href={withStoreQuery(`/shifts/drawer?type=${type}&shiftId=${encodeURIComponent(investigation.shift.id)}`, store.id)}>{labels[type]}</Link></dt>
              <dd className="shrink-0 font-semibold">{formatMoney(entries.find(entry => entry.entryType === type)?.amountPence ?? 0, business.currency)}</dd>
            </div>
          ))}
          <div className="flex justify-between gap-3 border-t border-black/10 pt-2 font-semibold"><dt>Recorded drawer total</dt><dd>{formatMoney(recordedTotal, business.currency)}</dd></div>
        </dl>
        {recordedTotal !== investigation.shift.expectedCashPence && <p className="mt-3 text-sm text-amber-900">Current drawer records differ from expected cash at closing. Check the transactions before closing this review. The original closing figure has not changed.</p>}
        <p className="mt-2 text-sm text-black/60">Tap a category to see its transactions.</p>
      </details>

      <VarianceWorkflowClient
        investigationId={investigation.id}
        status={investigation.status}
        cashierExplanation={investigation.cashierExplanation}
        originalReason={cashDifferenceReason(investigation.shift.varianceReasonCode, null, investigation.shift.varianceReason)}
        evidenceNote={investigation.evidencePath}
        managerResolution={investigation.managerResolution}
        assignedReviewerName={investigation.assignedReviewer?.name ?? null}
        approvedByName={investigation.approvedBy?.name ?? null}
        approvedAt={investigation.approvedAt?.toISOString() ?? null}
        reviewedByName={investigation.reviewedBy?.name ?? null}
        reviewedAt={investigation.reviewedAt?.toISOString() ?? null}
        reviewNote={investigation.reviewNote}
        reviewers={reviewers}
        userRole={user.role}
        canExplain={
          user.role === 'OWNER' ||
          user.role === 'MANAGER' ||
          user.id === investigation.shift.userId ||
          user.id === investigation.assignedReviewerUserId
        }
      />
    </div>
  );
}
