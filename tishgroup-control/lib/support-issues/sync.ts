import { prisma } from '@/lib/prisma';
import { OPEN_SUPPORT_STATUSES, type SupportPriority } from './types';

type SupportSyncClient = {
  controlSupportIssue: {
    findMany: (args: {
      where: { businessId: string; status: { in: typeof OPEN_SUPPORT_STATUSES } };
      select: { priority: true; lastUpdatedAt: true; createdAt: true };
    }) => Promise<Array<{ priority: string; lastUpdatedAt: Date; createdAt: Date }>>;
  };
  controlBusinessProfile: {
    findUnique: (args: { where: { businessId: string }; select: { supportStatus: true } }) => Promise<{ supportStatus: string } | null>;
    upsert: (args: {
      where: { businessId: string };
      create: { businessId: string; openSupportIssueCount: number; supportStatus: string };
      update: { openSupportIssueCount: number; supportStatus?: string };
    }) => Promise<unknown>;
  };
};

const PRIORITY_RANK: Record<string, number> = {
  CRITICAL: 0,
  HIGH: 1,
  NORMAL: 2,
  LOW: 3,
};

export function rankPriority(priority: string): number {
  return PRIORITY_RANK[priority] ?? 9;
}

export function highestPriority(priorities: string[]): SupportPriority | null {
  if (priorities.length === 0) return null;
  return priorities.sort((a, b) => rankPriority(a) - rankPriority(b))[0] as SupportPriority;
}

/** Keep ControlBusinessProfile.openSupportIssueCount in sync with open issues. Never overwrite UNREVIEWED. */
export async function syncBusinessSupportProfileCounts(businessId: string, db: SupportSyncClient = prisma) {
  const openIssues = await db.controlSupportIssue.findMany({
    where: { businessId, status: { in: OPEN_SUPPORT_STATUSES } },
    select: { priority: true, lastUpdatedAt: true, createdAt: true },
  });

  const hasCritical = openIssues.some((i) => i.priority === 'CRITICAL');
  const createStatus = openIssues.length === 0 ? 'UNREVIEWED' : hasCritical ? 'AT_RISK' : 'WATCH';
  const derivedStatus = openIssues.length === 0 ? 'HEALTHY' : hasCritical ? 'AT_RISK' : 'WATCH';

  const existing = await db.controlBusinessProfile.findUnique({
    where: { businessId },
    select: { supportStatus: true },
  });

  await db.controlBusinessProfile.upsert({
    where: { businessId },
    create: {
      businessId,
      openSupportIssueCount: openIssues.length,
      supportStatus: createStatus,
    },
    update:
      String(existing?.supportStatus ?? '').toUpperCase() === 'UNREVIEWED'
        ? { openSupportIssueCount: openIssues.length }
        : { openSupportIssueCount: openIssues.length, supportStatus: derivedStatus },
  });
}

export async function loadSupportStatsByBusinessIds(businessIds: string[], now = new Date()) {
  if (businessIds.length === 0) return new Map();

  const staleMs = 24 * 60 * 60 * 1000;
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [openIssues, recentCounts] = await Promise.all([
    prisma.controlSupportIssue.findMany({
      where: { businessId: { in: businessIds }, status: { in: OPEN_SUPPORT_STATUSES } },
      orderBy: [{ priority: 'asc' }, { lastUpdatedAt: 'desc' }],
      select: {
        id: true,
        businessId: true,
        priority: true,
        status: true,
        title: true,
        issueType: true,
        lastUpdatedAt: true,
        createdAt: true,
        nextAction: true,
      },
    }),
    prisma.controlSupportIssue.groupBy({
      by: ['businessId'],
      where: { businessId: { in: businessIds }, createdAt: { gte: monthAgo } },
      _count: { id: true },
    }),
  ]);

  const recentMap = new Map(recentCounts.map((r) => [r.businessId, r._count.id]));

  const byBusiness = new Map<
    string,
    {
      openCount: number;
      highestPriority: SupportPriority | null;
      hasCritical: boolean;
      hasStale: boolean;
      issueCountLast30Days: number;
      topIssue: (typeof openIssues)[0] | null;
    }
  >();

  for (const id of businessIds) {
    byBusiness.set(id, {
      openCount: 0,
      highestPriority: null,
      hasCritical: false,
      hasStale: false,
      issueCountLast30Days: recentMap.get(id) ?? 0,
      topIssue: null,
    });
  }

  for (const issue of openIssues) {
    const entry = byBusiness.get(issue.businessId)!;
    entry.openCount++;
    const updated = issue.lastUpdatedAt.getTime();
    if (now.getTime() - updated >= staleMs) entry.hasStale = true;
    if (issue.priority === 'CRITICAL') entry.hasCritical = true;
    if (!entry.topIssue || rankPriority(issue.priority) < rankPriority(entry.topIssue.priority)) {
      entry.topIssue = issue;
    }
  }

  for (const [, entry] of byBusiness) {
    if (entry.topIssue) {
      entry.highestPriority = entry.topIssue.priority as SupportPriority;
    }
  }

  return byBusiness;
}
