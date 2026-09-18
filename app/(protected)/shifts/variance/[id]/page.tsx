import { notFound } from 'next/navigation';
import PageHeader from '@/components/PageHeader';
import { formatDateTime, formatMoney } from '@/lib/format';
import { displayDocumentNumber } from '@/lib/reliability/walkthrough-contracts';
import { requireBusinessStore } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { VARIANCE_REVIEWER_ROLES } from '@/lib/services/cash-variance';
import VarianceWorkflowClient from '../VarianceWorkflowClient';

export default async function CashVarianceDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const { user, business, store } = await requireBusinessStore();

  const investigation = await prisma.cashVarianceInvestigation.findFirst({
    where: {
      id: params.id,
      businessId: business.id,
      shift: { till: { storeId: store.id } },
    },
    include: {
      assignedReviewer: { select: { id: true, name: true, role: true } },
      approvedBy: { select: { name: true } },
      shift: {
        select: {
          id: true,
          userId: true,
          closureNumber: true,
          actualCashPence: true,
          expectedCashPence: true,
          variance: true,
          openedAt: true,
          closedAt: true,
          user: { select: { name: true } },
          till: { select: { name: true } },
        },
      },
    },
  });
  if (!investigation) notFound();

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
        title={displayDocumentNumber('cash_variance', investigation.transactionNumber, investigation.id)}
        subtitle="Review the variance. Counted and expected cash on the shift are not rewritten."
        secondaryCta={{ label: 'All investigations', href: '/shifts/variance' }}
      />

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
            <div className="text-xs text-black/40">Closure</div>
            <div className="font-semibold">{investigation.shift.closureNumber ?? '—'}</div>
          </div>
          <div>
            <div className="text-xs text-black/40">Counted cash</div>
            <div className="font-semibold">
              {formatMoney(investigation.shift.actualCashPence ?? 0, business.currency)}
            </div>
          </div>
          <div>
            <div className="text-xs text-black/40">Expected cash</div>
            <div className="font-semibold">
              {formatMoney(investigation.shift.expectedCashPence, business.currency)}
            </div>
          </div>
          <div>
            <div className="text-xs text-black/40">Variance snapshot</div>
            <div className="font-semibold">
              {formatMoney(investigation.variancePence, business.currency)}
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

      <VarianceWorkflowClient
        investigationId={investigation.id}
        status={investigation.status}
        cashierExplanation={investigation.cashierExplanation}
        evidenceNote={investigation.evidencePath}
        managerResolution={investigation.managerResolution}
        assignedReviewerName={investigation.assignedReviewer?.name ?? null}
        approvedByName={investigation.approvedBy?.name ?? null}
        approvedAt={investigation.approvedAt?.toISOString() ?? null}
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
