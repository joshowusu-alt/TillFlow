'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { recordAudit } from '@/lib/audit';
import { canWriteNotes, requireControlStaff } from '@/lib/control-auth';
import { syncBusinessSupportProfileCounts } from '@/lib/support-issues/sync';
import {
  SUPPORT_ISSUE_TYPES,
  SUPPORT_PRIORITIES,
  SUPPORT_SOURCES,
  SUPPORT_STATUSES,
} from '@/lib/support-issues/types';

function readReturnPath(formData: FormData) {
  const value = String(formData.get('returnPath') ?? '').trim();
  return value.startsWith('/') ? value : '/command/support';
}

function revalidateSupportViews(businessId?: string) {
  revalidateTag('control-support');
  revalidateTag('control-portfolio');
  revalidateTag('scale-cockpit');
  revalidatePath('/command/support');
  revalidatePath('/command/scale');
  if (businessId) {
    revalidatePath(`/command/scale?businessId=${businessId}`);
  }
}

async function ensureBusinessContext(businessId: string) {
  const business = await prisma.business.findUnique({
    where: { id: businessId, isDemo: false },
    select: {
      name: true,
      phone: true,
      users: { where: { role: 'OWNER' }, take: 1, select: { name: true, email: true } },
    },
  });
  if (!business) throw new Error('Business not found');
  const owner = business.users[0];
  return {
    businessName: business.name,
    ownerName: owner?.name ?? null,
    ownerPhone: business.phone,
    ownerEmail: owner?.email ?? null,
  };
}

function pickString(formData: FormData, key: string) {
  return String(formData.get(key) ?? '').trim();
}

export async function createSupportIssueAction(formData: FormData) {
  const staff = await requireControlStaff();
  if (!canWriteNotes(staff.role)) {
    redirect(`${readReturnPath(formData)}&error=Permission denied`);
  }

  const businessId = pickString(formData, 'businessId');
  const title = pickString(formData, 'title');
  const issueType = pickString(formData, 'issueType') || 'OTHER';
  const priority = pickString(formData, 'priority') || 'NORMAL';
  const description = pickString(formData, 'description') || null;
  const source = pickString(formData, 'source') || 'CONTROL';
  const relatedRoute = pickString(formData, 'relatedRoute') || null;
  const nextAction = pickString(formData, 'nextAction') || null;
  const assignedStaffId = pickString(formData, 'assignedStaffId') || null;
  const assignedAgentName = pickString(formData, 'assignedAgentName') || null;
  const ownerName = pickString(formData, 'ownerName') || null;
  const ownerPhone = pickString(formData, 'ownerPhone') || null;

  if (!businessId || !title) {
    redirect(`${readReturnPath(formData)}&error=Business and title are required`);
  }
  if (!SUPPORT_ISSUE_TYPES.includes(issueType as (typeof SUPPORT_ISSUE_TYPES)[number])) {
    redirect(`${readReturnPath(formData)}&error=Invalid issue type`);
  }
  if (!SUPPORT_PRIORITIES.includes(priority as (typeof SUPPORT_PRIORITIES)[number])) {
    redirect(`${readReturnPath(formData)}&error=Invalid priority`);
  }

  const ctx = await ensureBusinessContext(businessId);

  const issue = await prisma.controlSupportIssue.create({
    data: {
      businessId,
      createdByStaffId: staff.id,
      assignedStaffId: assignedStaffId || null,
      assignedAgentName: assignedAgentName || null,
      issueType,
      priority,
      status: 'OPEN',
      title,
      description,
      source: SUPPORT_SOURCES.includes(source as (typeof SUPPORT_SOURCES)[number]) ? source : 'CONTROL',
      relatedRoute,
      nextAction,
      ownerName: ownerName || ctx.ownerName,
      ownerPhone: ownerPhone || ctx.ownerPhone,
    },
  });

  await syncBusinessSupportProfileCounts(businessId);

  await recordAudit({
    staff: { id: staff.id, email: staff.email, role: staff.role },
    action: 'SUPPORT_ISSUE_CREATED',
    businessId,
    summary: `Support issue created: ${title}`,
    metadata: { issueId: issue.id, issueType, priority },
  });

  revalidateSupportViews(businessId);
  redirect(`${readReturnPath(formData)}&updated=issue`);
}

export async function updateSupportIssueAction(formData: FormData) {
  const staff = await requireControlStaff();
  if (!canWriteNotes(staff.role)) {
    redirect(`${readReturnPath(formData)}&error=Permission denied`);
  }

  const issueId = pickString(formData, 'issueId');
  const status = pickString(formData, 'status');
  const priority = pickString(formData, 'priority');
  const assignedStaffId = formData.has('assignedStaffId') ? pickString(formData, 'assignedStaffId') || null : undefined;
  const assignedAgentName = formData.has('assignedAgentName') ? pickString(formData, 'assignedAgentName') || null : undefined;
  const nextAction = formData.has('nextAction') ? pickString(formData, 'nextAction') || null : undefined;
  const resolutionNotes = formData.has('resolutionNotes') ? pickString(formData, 'resolutionNotes') || null : undefined;

  if (!issueId) redirect(`${readReturnPath(formData)}&error=Missing issue`);

  const existing = await prisma.controlSupportIssue.findUnique({ where: { id: issueId } });
  if (!existing) redirect(`${readReturnPath(formData)}&error=Issue not found`);

  const data: Record<string, unknown> = {};
  const changes: Record<string, { from: unknown; to: unknown }> = {};

  if (status && SUPPORT_STATUSES.includes(status as (typeof SUPPORT_STATUSES)[number])) {
    data.status = status;
    changes.status = { from: existing.status, to: status };
    if (status === 'RESOLVED') data.resolvedAt = new Date();
    if (status === 'CLOSED') data.closedAt = new Date();
  }
  if (priority && SUPPORT_PRIORITIES.includes(priority as (typeof SUPPORT_PRIORITIES)[number])) {
    data.priority = priority;
    changes.priority = { from: existing.priority, to: priority };
  }
  if (assignedStaffId !== undefined) {
    data.assignedStaffId = assignedStaffId;
    changes.assignedStaffId = { from: existing.assignedStaffId, to: assignedStaffId };
  }
  if (assignedAgentName !== undefined) {
    data.assignedAgentName = assignedAgentName;
    changes.assignedAgentName = { from: existing.assignedAgentName, to: assignedAgentName };
  }
  if (nextAction !== undefined) {
    data.nextAction = nextAction;
    changes.nextAction = { from: existing.nextAction, to: nextAction };
  }
  if (resolutionNotes !== undefined) {
    data.resolutionNotes = resolutionNotes;
    changes.resolutionNotes = { from: existing.resolutionNotes, to: resolutionNotes };
  }

  await prisma.controlSupportIssue.update({ where: { id: issueId }, data });
  await syncBusinessSupportProfileCounts(existing.businessId);

  await recordAudit({
    staff: { id: staff.id, email: staff.email, role: staff.role },
    action: 'SUPPORT_ISSUE_UPDATED',
    businessId: existing.businessId,
    summary: `Support issue updated: ${existing.title}`,
    metadata: { issueId, changes },
  });

  revalidateSupportViews(existing.businessId);
  redirect(readReturnPath(formData));
}

export async function addSupportIssueNoteAction(formData: FormData) {
  const staff = await requireControlStaff();
  if (!canWriteNotes(staff.role)) {
    redirect(`${readReturnPath(formData)}&error=Permission denied`);
  }

  const issueId = pickString(formData, 'issueId');
  const note = pickString(formData, 'note');
  if (!issueId || !note) redirect(`${readReturnPath(formData)}&error=Missing note`);

  const issue = await prisma.controlSupportIssue.findUnique({
    where: { id: issueId },
    select: { businessId: true, title: true },
  });
  if (!issue) redirect(`${readReturnPath(formData)}&error=Issue not found`);

  await prisma.controlSupportIssueNote.create({
    data: { issueId, note, createdByStaffId: staff.id },
  });
  await prisma.controlSupportIssue.update({
    where: { id: issueId },
    data: { lastUpdatedAt: new Date() },
  });

  await recordAudit({
    staff: { id: staff.id, email: staff.email, role: staff.role },
    action: 'SUPPORT_NOTE_ADDED',
    businessId: issue.businessId,
    summary: `Note on support issue: ${note.slice(0, 80)}`,
    metadata: { issueId },
  });

  revalidateSupportViews(issue.businessId);
  redirect(readReturnPath(formData));
}

export async function resolveSupportIssueAction(formData: FormData) {
  formData.set('status', 'RESOLVED');
  return updateSupportIssueAction(formData);
}

export async function closeSupportIssueAction(formData: FormData) {
  formData.set('status', 'CLOSED');
  return updateSupportIssueAction(formData);
}
