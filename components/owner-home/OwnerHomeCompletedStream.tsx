import { Suspense } from 'react';
import { prisma } from '@/lib/prisma';
import type { OwnerHomeCriticalShell } from '@/lib/owner-home/critical-shell';
import { getOwnerHomeExtrasData } from '@/lib/owner-home/extras';
import { getOwnerHomeImproveRecords } from '@/lib/owner-home/improve-records';
import HomeImproveRecordsSlot from './HomeImproveRecordsSlot';
import HomeExtrasSlot from './HomeExtrasSlot';
import OwnerHomeRefresh from './OwnerHomeRefresh';
import HomeSectionErrorBoundary from './HomeSectionErrorBoundary';
import { HomeExtrasUnavailable, HomeImproveRecordsUnavailable, RetryButton } from './section-errors';
import { HomeFigures, HomeAttentionList, HomeTills, HomeOverviewLayout } from './HomeOverviewView';
import { loadHomeScope, loadHomeFigures, loadHomeAttention, loadHomeTills } from './HomeOverviewData';

const loading = (message: string) => <p role="status" className="rounded-xl bg-white p-4 text-sm text-muted">{message}</p>;

function HomePerformanceUnavailable() {
  return <div role="alert" className="rounded-xl border border-white/20 bg-black/[0.15] p-4 text-white">Couldn&apos;t load today&apos;s figures. Choose a branch if needed, then retry. <RetryButton tone="onDark" label="Retry" /></div>;
}
function HomeAttentionUnavailable() {
  return <HomeAttentionList rows={null} reportsHref="/reports" />;
}

async function HomePerformanceSlot({ promise }: { promise: Promise<{ figures: Awaited<ReturnType<typeof loadHomeFigures>>; scope: string }> }) {
  try {
    const data = await promise;
    return <HomeFigures figures={data.figures} scope={data.scope} />;
  } catch {
    return <HomePerformanceUnavailable />;
  }
}

async function AttentionSlot({ promise }: { promise: Promise<{ rows: Awaited<ReturnType<typeof loadHomeAttention>>; href: string }> }) {
  try {
    const data = await promise;
    return <HomeAttentionList rows={data.rows} reportsHref={data.href} />;
  } catch {
    return <HomeAttentionUnavailable />;
  }
}

async function TillsSlot({ promise }: { promise: ReturnType<typeof loadHomeTills> }) {
  try {
    return <HomeTills {...await promise} />;
  } catch {
    return <div role="alert" className="rounded-xl bg-white p-3 text-sm">Couldn&apos;t check tills right now. <RetryButton label="Retry" /></div>;
  }
}

export default function OwnerHomeCompletedStream({ shell }: { shell: OwnerHomeCriticalShell }) {
  const context = loadHomeScope(shell, new Date());
  const figures = context.then(async ctx => ({ figures: await loadHomeFigures(shell, ctx), scope: ctx.scopeLabel }));
  const attention = context.then(async ctx => ({
    rows: await loadHomeAttention(shell, ctx),
    href: '/reports?' + new URLSearchParams({ storeId: ctx.branch.selected }),
  }));
  const tills = context.then(ctx => loadHomeTills(shell, ctx));
  const improvePromise = getOwnerHomeImproveRecords(shell.businessId, shell.saleCount);
  const extrasPromise = prisma.business.findUniqueOrThrow({
    where: { id: shell.businessId }, select: { hasDemoData: true },
  }).then(business => getOwnerHomeExtrasData(shell.businessId, business.hasDemoData));
  return <>
    <OwnerHomeRefresh />
    <HomeOverviewLayout businessName={shell.businessName}
      figures={<HomeSectionErrorBoundary section="performance" fallback={<HomePerformanceUnavailable />}>
        <Suspense fallback={<p role="status" className="rounded-xl border border-white/20 bg-black/[0.15] p-4 text-sm text-blue-100">Loading today&apos;s figures…</p>}>
          <HomePerformanceSlot promise={figures} />
        </Suspense>
      </HomeSectionErrorBoundary>}
      tills={<Suspense fallback={loading('Checking tills…')}><TillsSlot promise={tills} /></Suspense>}
      attention={<HomeSectionErrorBoundary section="attention" fallback={<HomeAttentionUnavailable />}>
            <Suspense fallback={loading('Checking what needs your attention…')}><AttentionSlot promise={attention} /></Suspense>
          </HomeSectionErrorBoundary>}
      records={<HomeSectionErrorBoundary section="iyr" fallback={<HomeImproveRecordsUnavailable />}>
              <Suspense fallback={loading('Checking records…')}><HomeImproveRecordsSlot improvePromise={improvePromise} /></Suspense>
            </HomeSectionErrorBoundary>}
      extras={<HomeSectionErrorBoundary section="extras" fallback={<HomeExtrasUnavailable />}>
            <Suspense fallback={null}><HomeExtrasSlot extrasPromise={extrasPromise} saleCount={shell.saleCount} /></Suspense>
          </HomeSectionErrorBoundary>} />
  </>;
}
