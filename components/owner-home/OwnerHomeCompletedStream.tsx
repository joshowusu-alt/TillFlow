import { Suspense } from 'react';
import { prisma } from '@/lib/prisma';
import type { OwnerHomeCriticalShell } from '@/lib/owner-home/critical-shell';
import { getOwnerHomeAttentionData } from '@/lib/owner-home/attention';
import { getOwnerHomeExtrasData } from '@/lib/owner-home/extras';
import { getOwnerHomeImproveRecords } from '@/lib/owner-home/improve-records';
import { getHomePerformanceSummary } from '@/lib/reports/home-performance-kpis';
import { HomeActionCard, HomeIcon } from '@/components/owner-home/home-chrome';
import HomePerformanceSlot from '@/components/owner-home/HomePerformanceSlot';
import HomeStatusPillSlot from '@/components/owner-home/HomeStatusPillSlot';
import HomeAttentionSlot from '@/components/owner-home/HomeAttentionSlot';
import HomeImproveRecordsSlot from '@/components/owner-home/HomeImproveRecordsSlot';
import HomeExtrasSlot, { HomeLastCloseSlot } from '@/components/owner-home/HomeExtrasSlot';
import OwnerHomeRefresh from '@/components/owner-home/OwnerHomeRefresh';
import HomeSectionErrorBoundary from '@/components/owner-home/HomeSectionErrorBoundary';
import {
  HomeAttentionUnavailable,
  HomeExtrasUnavailable,
  HomeImproveRecordsUnavailable,
  HomeLastCloseUnavailable,
  HomePerformanceUnavailable,
  HomeStatusUnavailable,
} from '@/components/owner-home/section-errors';
import {
  HomeAttentionSkeleton,
  HomeImproveRecordsSkeleton,
  HomeKpiSkeleton,
  HomeLastCloseSkeleton,
  HomeStatusPillSkeleton,
} from '@/components/owner-home/skeletons';

/**
 * Completed Owner Home — progressive streaming shell.
 * Critical paint: business identity + Open POS. Deferred: KPIs, status, attention, IYR, extras.
 * Each deferred section is isolated with Suspense + error boundary.
 */
export default function OwnerHomeCompletedStream({ shell }: { shell: OwnerHomeCriticalShell }) {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const firstName = shell.userName ? shell.userName.split(' ')[0] : null;

  const performancePromise = getHomePerformanceSummary(shell.businessId);
  const attentionPromise = getOwnerHomeAttentionData(shell.businessId);
  const improvePromise = getOwnerHomeImproveRecords(shell.businessId, shell.saleCount);
  const extrasPromise = prisma.business
    .findUniqueOrThrow({
      where: { id: shell.businessId },
      select: { hasDemoData: true },
    })
    .then((business) => getOwnerHomeExtrasData(shell.businessId, business.hasDemoData));

  const openPosAction = {
    label: 'Open POS',
    desc: 'Serve customers and record sales',
    href: '/pos',
    primary: true as const,
    icon: <HomeIcon name="pos" />,
  };

  return (
    <div className="bg-[#f0f2f5] px-0 pb-4 lg:px-6 lg:pb-8">
      <OwnerHomeRefresh />
      <div className="lg:mx-auto lg:max-w-[90rem]">
        <div
          className="relative overflow-hidden lg:mt-4 lg:rounded-[1.25rem] lg:shadow-[0_18px_50px_rgba(15,23,42,0.12)]"
          style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e3a8a 55%, #2563eb 100%)' }}
        >
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage:
                'radial-gradient(circle at 20% 50%, rgba(99,102,241,0.15) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(59,130,246,0.2) 0%, transparent 40%)',
            }}
          />
          <div
            className="pointer-events-none absolute bottom-0 left-0 right-0 h-16 lg:h-12"
            style={{ background: 'linear-gradient(to bottom, transparent, rgba(15,23,42,0.25))' }}
          />

          <div className="relative mx-auto max-w-5xl px-4 pb-5 pt-6 sm:px-6 sm:pb-8 sm:pt-8 lg:max-w-none lg:px-8 lg:py-7 xl:px-10">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(18rem,1fr)] lg:items-end xl:grid-cols-[minmax(0,1fr)_minmax(22rem,1.02fr)] xl:gap-6">
              <div className="min-w-0">
                {hour < 12 && firstName ? (
                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-blue-300/60">
                    {greeting}, {firstName}
                  </p>
                ) : null}
                <h1 className="max-w-4xl text-[1.6rem] font-black leading-tight tracking-tight text-white sm:text-4xl lg:text-[2.35rem] xl:text-[2.65rem]">
                  {shell.businessName}
                </h1>
                <p className="mt-1.5 text-[11px] text-blue-100/75">Today · All branches</p>
                <HomeSectionErrorBoundary section="last-close" fallback={<HomeLastCloseUnavailable />}>
                  <Suspense fallback={<HomeLastCloseSkeleton />}>
                    <HomeLastCloseSlot extrasPromise={extrasPromise} />
                  </Suspense>
                </HomeSectionErrorBoundary>

                <HomeSectionErrorBoundary section="status-pill" fallback={<HomeStatusUnavailable />}>
                  <Suspense fallback={<HomeStatusPillSkeleton />}>
                    <HomeStatusPillSlot
                      attentionPromise={attentionPromise}
                      improvePromise={improvePromise}
                      plan={shell.plan}
                    />
                  </Suspense>
                </HomeSectionErrorBoundary>
              </div>

              <HomeSectionErrorBoundary section="performance" fallback={<HomePerformanceUnavailable />}>
                <Suspense fallback={<HomeKpiSkeleton />}>
                  <HomePerformanceSlot
                    performancePromise={performancePromise}
                    currency={shell.currency}
                    saleCount={shell.saleCount}
                  />
                </Suspense>
              </HomeSectionErrorBoundary>
            </div>
          </div>
        </div>

        <div className="mx-auto max-w-5xl px-4 py-5 sm:px-6 lg:max-w-none lg:px-8 lg:py-6">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,24rem)] lg:items-start xl:grid-cols-[minmax(0,1fr)_minmax(22rem,26rem)] xl:gap-6">
            <div className="order-1 lg:col-start-1 lg:row-start-1">
              <HomeActionCard
                action={openPosAction}
                className="w-full min-h-14 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent lg:min-h-[5.5rem] lg:p-5"
              />
            </div>

            <div className="order-2 lg:col-start-2 lg:row-span-3 lg:row-start-1">
              <HomeSectionErrorBoundary section="attention" fallback={<HomeAttentionUnavailable />}>
                <Suspense fallback={<HomeAttentionSkeleton />}>
                  <HomeAttentionSlot attentionPromise={attentionPromise} plan={shell.plan} />
                </Suspense>
              </HomeSectionErrorBoundary>
            </div>

            <div className="order-3 lg:col-start-1 lg:row-start-2">
              <HomeSectionErrorBoundary section="iyr" fallback={<HomeImproveRecordsUnavailable />}>
                <Suspense fallback={<HomeImproveRecordsSkeleton />}>
                  <HomeImproveRecordsSlot improvePromise={improvePromise} />
                </Suspense>
              </HomeSectionErrorBoundary>
            </div>

            <div className="order-4 space-y-3 lg:col-start-1 lg:row-start-3">
              <HomeSectionErrorBoundary section="extras" fallback={<HomeExtrasUnavailable />}>
                <Suspense fallback={null}>
                  <HomeExtrasSlot extrasPromise={extrasPromise} saleCount={shell.saleCount} />
                </Suspense>
              </HomeSectionErrorBoundary>
            </div>
          </div>

          <p className="mt-8 text-center text-xs leading-5 text-muted">
            Secure. Reliable. Built for Ghanaian businesses.
          </p>
        </div>
      </div>
    </div>
  );
}
