import { prisma } from '@/lib/prisma';

const OPEN_STATUSES = ['OPEN', 'IN_PROGRESS', 'WAITING_ON_CUSTOMER'];
const STALE_MS = 24 * 60 * 60 * 1000;

export type BusinessSupportStats = {
  openSupportIssueCount: number;
  hasCriticalSupportIssue: boolean;
  hasStaleSupportIssue: boolean;
  highestSupportPriority: string | null;
};

export async function loadBusinessSupportStats(
  businessId: string,
  now = new Date()
): Promise<BusinessSupportStats> {
  try {
    const openIssues = await prisma.controlSupportIssue.findMany({
      where: { businessId, status: { in: OPEN_STATUSES } },
      select: { priority: true, lastUpdatedAt: true },
    });

    const priorities = openIssues.map((issue: { priority: string }) => issue.priority);
    const hasCritical = priorities.includes('CRITICAL');
    const hasStale = openIssues.some(
      (issue: { lastUpdatedAt: Date }) => now.getTime() - issue.lastUpdatedAt.getTime() >= STALE_MS
    );

    const rank: Record<string, number> = { CRITICAL: 0, HIGH: 1, NORMAL: 2, LOW: 3 };
    const highest =
      priorities.length === 0
        ? null
        : priorities.sort((a: string, b: string) => (rank[a] ?? 9) - (rank[b] ?? 9))[0];

    return {
      openSupportIssueCount: openIssues.length,
      hasCriticalSupportIssue: hasCritical,
      hasStaleSupportIssue: hasStale,
      highestSupportPriority: highest,
    };
  } catch {
    const profile = await prisma.controlBusinessProfile.findUnique({
      where: { businessId },
      select: { openSupportIssueCount: true },
    });
    return {
      openSupportIssueCount: profile?.openSupportIssueCount ?? 0,
      hasCriticalSupportIssue: false,
      hasStaleSupportIssue: false,
      highestSupportPriority: null,
    };
  }
}
