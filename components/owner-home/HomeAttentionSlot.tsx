import Link from 'next/link';
import type { BusinessPlan } from '@/lib/features';
import { hasPlanAccess } from '@/lib/features';
import type { OwnerHomeAttentionData } from '@/lib/owner-home/attention';
import {
  countHomeAttentionActions,
  formatCloseShiftDescription,
  formatCommandCenterActionLabel,
  formatHomeAttentionActionSummary,
} from '@/lib/home-attention-presentation';
import { HomeActionCard, HomeIcon, type HomeAction } from '@/components/owner-home/home-chrome';
import { HomeAttentionUnavailable } from '@/components/owner-home/section-errors';

export default async function HomeAttentionSlot({
  attentionPromise,
  plan,
}: {
  attentionPromise: Promise<OwnerHomeAttentionData>;
  plan: BusinessPlan;
}) {
  let data: OwnerHomeAttentionData;
  try {
    data = await attentionPromise;
  } catch (error) {
    console.error('[home.attention] failed to load today\'s attention items', error);
    return <HomeAttentionUnavailable />;
  }
  const canAccessReorder = hasPlanAccess(plan, 'GROWTH');
  const actionCount = countHomeAttentionActions({
    openShiftCount: data.openShiftCount,
    openIssueCount: data.openIssueCount,
    reorderNeededCount: data.reorderNeededCount,
    overdueSupplierInvoiceCount: data.overdueSupplierInvoiceCount,
    canAccessReorder,
  });

  const attentionActions = (
    [
      data.openShiftCount > 0
        ? {
            label: 'Close Shift',
            desc: formatCloseShiftDescription({
              salesCount: data.openShiftSalesCount,
              openedAt: data.openShiftOpenedAt,
            }),
            href: '/shifts',
            urgent: true,
            icon: <HomeIcon name="shift" />,
          }
        : null,
      data.openIssueCount > 0
        ? {
            label: formatCommandCenterActionLabel(data.openIssueCount),
            desc: 'Review operational issues',
            href: '/reports/command-center',
            urgent: true,
            icon: <HomeIcon name="alert" />,
          }
        : null,
      data.reorderNeededCount > 0 && canAccessReorder
        ? {
            label: 'Reorder needed',
            desc: `${data.reorderNeededCount} product${data.reorderNeededCount === 1 ? '' : 's'}`,
            href: '/reports/reorder-suggestions',
            urgent: true,
            icon: <HomeIcon name="reorder" />,
          }
        : null,
      data.overdueSupplierInvoiceCount > 0
        ? {
            label: 'Supplier payments due',
            desc: `${data.overdueSupplierInvoiceCount} overdue invoice${
              data.overdueSupplierInvoiceCount === 1 ? '' : 's'
            }`,
            href: '/payments/supplier-payments',
            urgent: true,
            icon: <HomeIcon name="payables" />,
          }
        : null,
    ] as Array<HomeAction | null>
  ).filter((action): action is HomeAction => action !== null);

  const hasItems = attentionActions.length > 0;
  const hasCommandCenterAction = attentionActions.some(
    (action) => action.href === '/reports/command-center'
  );

  return (
    <section aria-labelledby="todays-attention-heading">
      <div className="mb-3">
        <h2 id="todays-attention-heading" className="text-[10px] font-bold uppercase tracking-[0.2em] text-black/35">
          Today&apos;s attention
        </h2>
        <p className="mt-1 text-xs leading-5 text-muted">
          {formatHomeAttentionActionSummary(actionCount)}
        </p>
      </div>
      {hasItems ? (
        <div className="space-y-2">
          {attentionActions.map((action) => (
            <HomeActionCard key={`${action.href}-${action.label}`} action={action} compact />
          ))}
          {!hasCommandCenterAction ? (
            <Link
              href="/reports/command-center"
              className="flex min-h-11 items-center justify-between rounded-xl border border-black/[0.06] bg-white px-3 py-2 text-xs font-semibold text-accent shadow-sm transition hover:bg-accentSoft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              View all tasks
              <span aria-hidden>&rarr;</span>
            </Link>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
