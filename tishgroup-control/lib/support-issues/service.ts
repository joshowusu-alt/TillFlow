import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import { prisma } from '@/lib/prisma';
import {
  OPEN_SUPPORT_STATUSES,
  type SupportCockpitData,
  type SupportIssueRow,
} from './types';

const STALE_MS = 24 * 60 * 60 * 1000;

function mapIssueRow(
  row: {
    id: string;
    businessId: string;
    issueType: string;
    priority: string;
    status: string;
    title: string;
    description: string | null;
    source: string;
    relatedRoute: string | null;
    nextAction: string | null;
    assignedAgentName: string | null;
    assignedStaffId: string | null;
    ownerName: string | null;
    ownerPhone: string | null;
    createdAt: Date;
    lastUpdatedAt: Date;
    business: { name: string };
    assignedStaff: { name: string } | null;
  },
  now: Date
): SupportIssueRow {
  const age = now.getTime() - row.lastUpdatedAt.getTime();
  return {
    id: row.id,
    businessId: row.businessId,
    businessName: row.business.name,
    ownerName: row.ownerName ?? '—',
    ownerPhone: row.ownerPhone ?? '',
    issueType: row.issueType,
    priority: row.priority,
    status: row.status,
    title: row.title,
    description: row.description,
    source: row.source,
    relatedRoute: row.relatedRoute,
    nextAction: row.nextAction,
    assignedAgentName: row.assignedAgentName ?? row.assignedStaff?.name ?? null,
    assignedStaffId: row.assignedStaffId,
    createdAt: row.createdAt.toISOString(),
    lastUpdatedAt: row.lastUpdatedAt.toISOString(),
    isStale: OPEN_SUPPORT_STATUSES.includes(row.status as (typeof OPEN_SUPPORT_STATUSES)[number]) && age >= STALE_MS,
  };
}

async function computeSupportCockpit(now = new Date()): Promise<SupportCockpitData> {
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const issues = await prisma.controlSupportIssue.findMany({
    where: { business: { isDemo: false } },
    orderBy: [{ priority: 'asc' }, { lastUpdatedAt: 'desc' }],
    take: 500,
    select: {
      id: true,
      businessId: true,
      issueType: true,
      priority: true,
      status: true,
      title: true,
      description: true,
      source: true,
      relatedRoute: true,
      nextAction: true,
      assignedAgentName: true,
      assignedStaffId: true,
      ownerName: true,
      ownerPhone: true,
      createdAt: true,
      lastUpdatedAt: true,
      resolvedAt: true,
      closedAt: true,
      business: { select: { name: true } },
      assignedStaff: { select: { name: true } },
    },
  });

  const mapped = issues.map((i) => mapIssueRow(i, now));
  const open = mapped.filter((i) => OPEN_SUPPORT_STATUSES.includes(i.status as (typeof OPEN_SUPPORT_STATUSES)[number]));

  const openAges = open.map((i) => now.getTime() - new Date(i.lastUpdatedAt).getTime());
  const averageOpenAgeHours =
    openAges.length === 0 ? 0 : Math.round(openAges.reduce((s, a) => s + a, 0) / openAges.length / (60 * 60 * 1000));

  return {
    overview: {
      openIssues: open.length,
      criticalIssues: open.filter((i) => i.priority === 'CRITICAL').length,
      highPriorityIssues: open.filter((i) => i.priority === 'HIGH').length,
      waitingOnCustomer: open.filter((i) => i.status === 'WAITING_ON_CUSTOMER').length,
      resolvedThisWeek: issues.filter(
        (i) =>
          (i.status === 'RESOLVED' || i.status === 'CLOSED') &&
          (i.resolvedAt ?? i.closedAt ?? i.lastUpdatedAt) >= weekAgo
      ).length,
      averageOpenAgeHours,
      businessesWithOpenIssues: new Set(open.map((i) => i.businessId)).size,
    },
    issues: mapped,
  };
}

const _cached = unstable_cache(
  async () => computeSupportCockpit(),
  ['support-cockpit-data'],
  { revalidate: 60, tags: ['control-support', 'control-portfolio', 'scale-cockpit'] }
);

export const getSupportCockpitData = cache(async () => _cached());

export async function listBusinessSupportIssues(businessId: string, now = new Date()) {
  const rows = await prisma.controlSupportIssue.findMany({
    where: { businessId },
    orderBy: { lastUpdatedAt: 'desc' },
    take: 30,
    include: {
      business: { select: { name: true } },
      assignedStaff: { select: { name: true } },
    },
  });
  return rows.map((r) => mapIssueRow(r, now));
}

export { filterSupportIssues } from './filters';
