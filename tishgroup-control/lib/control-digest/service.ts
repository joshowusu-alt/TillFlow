import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { formatIsoDate } from '@/lib/scale-cockpit/labels';
import { getScaleCockpitData } from '@/lib/scale-cockpit/service';
import { buildReferralReport, type ReferralBusinessRow } from '@/lib/vendor/referrals/reporting';
import { buildDigestBuckets, computeDigestCounts } from './buckets';
import { buildDigestPriorities } from './priorities';
import type { ControlDigestData, WeeklyRolloutSummary } from './types';
import { formatWhatsAppDigest } from './whatsapp';

async function computeWeeklySummary(now: Date, expectedCollections: number): Promise<WeeklyRolloutSummary> {
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const weekAgoIso = formatIsoDate(weekAgo)!;

  const [
    paidPayments,
    supportOpened,
    supportResolved,
    firstSalesWeek,
    setupCompletedWeek,
    scaleData,
  ] = await Promise.all([
    prisma.controlPayment.findMany({
      where: { paidAt: { gte: weekAgo } },
      select: { controlBusiness: { select: { businessId: true } } },
    }),
    prisma.controlSupportIssue.count({ where: { createdAt: { gte: weekAgo }, business: { isDemo: false } } }),
    prisma.controlSupportIssue.count({
      where: {
        resolvedAt: { gte: weekAgo },
        business: { isDemo: false },
      },
    }),
    prisma.controlBusinessProfile.count({
      where: { firstSaleMarkedAt: { gte: weekAgo }, business: { isDemo: false } },
    }),
    prisma.business.count({
      where: { isDemo: false, onboardingCompletedAt: { gte: weekAgo } },
    }),
    getScaleCockpitData(),
  ]);

  const records = scaleData.businesses;
  const referralRows: ReferralBusinessRow[] = records.map((b) => ({
    businessId: b.businessId,
    businessName: b.businessName,
    referralSource: b.referralSource,
    referralStatus: b.referralStatus,
    assignedAgent: b.assignedAgent,
    isPaid: b.referralStatus === 'PAID' || b.billingAccessState === 'PAID_ACTIVE',
    inTrial: ['TRIAL_ACTIVE', 'TRIAL_DUE_SOON', 'TRIAL_DUE_TODAY'].includes(b.billingAccessState),
  }));
  const referralReport = buildReferralReport(referralRows);

  const paidBusinessIds = new Set(paidPayments.map((p) => p.controlBusiness.businessId));

  const collectionsNextWeek = records
    .filter((r) =>
      ['TRIAL_DUE_SOON', 'TRIAL_DUE_TODAY', 'RENEWAL_DUE_SOON', 'PAYMENT_DUE_TODAY'].includes(r.billingAccessState)
    )
    .reduce((sum, r) => sum + (r.outstandingAmount > 0 ? r.outstandingAmount : r.intervalCharge), 0);

  return {
    onboardedThisWeek: records.filter((r) => r.signedUpAt >= weekAgoIso).length,
    trialsStarted: records.filter((r) => r.trialStartAt && r.trialStartAt >= weekAgoIso).length,
    demosBooked: records.filter((r) => r.referralStatus === 'DEMO_BOOKED').length,
    demosCompleted: records.filter((r) => r.referralStatus === 'DEMO_COMPLETED').length,
    paidConversions: paidBusinessIds.size,
    activeWeekly: records.filter((r) => r.salesLast7Days >= 5).length,
    firstSaleThisWeek: firstSalesWeek,
    setupCompletedThisWeek: setupCompletedWeek,
    supportOpened,
    supportResolved,
    topSources: referralReport.bySource.slice(0, 5).map((s) => ({ label: s.label, count: s.leads })),
    topAgents: referralReport.byAgent.slice(0, 5).map((a) => ({ agent: a.agent, count: a.total })),
    expectedMrr: Math.round(scaleData.overview.expectedMrr),
    collectionsExpectedNextWeek: Math.round(collectionsNextWeek),
  };
}

export async function computeControlDigest(now = new Date()): Promise<ControlDigestData> {
  const scale = await getScaleCockpitData();
  const records = scale.businesses;
  const priorities = buildDigestPriorities(records, now);
  const counts = computeDigestCounts(records, now);
  counts.expectedCollectionsThisWeek = Math.round(scale.overview.expectedCollectionsThisWeek);
  counts.paidThisWeek = await prisma.controlPayment.count({ where: { paidAt: { gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) } } });

  const weekly = await computeWeeklySummary(now, counts.expectedCollectionsThisWeek);
  const buckets = buildDigestBuckets(records, priorities, now);
  const dateLabel = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });

  const snapshotMeta = {
    date: formatIsoDate(now)!,
    totalBusinesses: scale.overview.totalBusinesses,
    activeBusinesses: scale.overview.activeBusinesses,
    newSignups: counts.newSignupsToday,
    paidBusinesses: scale.overview.paidBusinesses,
    trialsEnding: counts.trialsEndingToday + counts.trialsEndingIn3Days,
    overdue: counts.overdue,
    stuckSetup: counts.stuckSetup,
    openSupportIssues: scale.overview.openSupportIssues,
    expectedCollections: counts.expectedCollectionsThisWeek,
    actionCount: priorities.length,
  };

  const partial = { dateLabel, counts, priorities, weekly };
  const whatsappText = formatWhatsAppDigest(partial);

  return {
    generatedAt: now.toISOString(),
    dateLabel,
    counts,
    priorities,
    buckets,
    weekly,
    snapshotMeta,
    healthyBusinesses: records.filter((r) => r.isHealthy).slice(0, 20),
    whatsappText,
  };
}

const _cachedDigest = unstable_cache(async () => computeControlDigest(), ['control-digest'], {
  revalidate: 90,
  tags: ['control-portfolio', 'control-digest', 'scale-cockpit'],
});

export const getControlDigestData = cache(async () => _cachedDigest());
