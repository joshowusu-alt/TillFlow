'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { canMutateSupport, requireControlStaffForMutation } from '@/lib/control-auth';
import {
  SupportNotFoundError,
  SupportPermissionError,
  SupportValidationError,
  addSupportIssueNoteMutation,
  createSupportIssueMutation,
  updateSupportIssueMutation,
  type SupportDb,
} from '@/lib/support-mutations';
import { safeReturnPath, withRedirectParam } from '@/lib/safe-return-path';

function returnPathFromForm(formData: FormData) {
  return safeReturnPath(String(formData.get('returnPath') ?? ''), '/command/support');
}

function redirectError(formData: FormData, message: string): never {
  redirect(withRedirectParam(returnPathFromForm(formData), 'error', message));
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

function pickString(formData: FormData, key: string) {
  return String(formData.get(key) ?? '').trim();
}

function supportDb(): SupportDb {
  return prisma as unknown as SupportDb;
}

function mapSupportError(formData: FormData, error: unknown): never {
  if (error instanceof SupportPermissionError) {
    redirectError(formData, 'Permission denied');
  }
  if (error instanceof SupportValidationError || error instanceof SupportNotFoundError) {
    redirectError(formData, error.message);
  }
  redirectError(formData, error instanceof Error ? error.message : 'Unable to save support change.');
}

export async function createSupportIssueAction(formData: FormData) {
  const staff = await requireControlStaffForMutation();
  if (!canMutateSupport(staff.role)) {
    redirectError(formData, 'Permission denied');
  }

  try {
    const result = await createSupportIssueMutation(supportDb(), {
      staff: { id: staff.id, email: staff.email, role: staff.role },
      staffRole: staff.role,
      businessId: pickString(formData, 'businessId'),
      title: pickString(formData, 'title'),
      issueType: pickString(formData, 'issueType') || 'OTHER',
      priority: pickString(formData, 'priority') || 'NORMAL',
      description: pickString(formData, 'description') || null,
      source: pickString(formData, 'source') || 'CONTROL',
      relatedRoute: pickString(formData, 'relatedRoute') || null,
      nextAction: pickString(formData, 'nextAction') || null,
      assignedStaffId: pickString(formData, 'assignedStaffId') || null,
      assignedAgentName: pickString(formData, 'assignedAgentName') || null,
      ownerName: pickString(formData, 'ownerName') || null,
      ownerPhone: pickString(formData, 'ownerPhone') || null,
      idempotencyKey: pickString(formData, 'idempotencyKey') || null,
    });
    revalidateSupportViews(result.businessId);
  } catch (error) {
    mapSupportError(formData, error);
  }

  redirect(withRedirectParam(returnPathFromForm(formData), 'updated', 'issue'));
}

export async function updateSupportIssueAction(formData: FormData) {
  const staff = await requireControlStaffForMutation();
  if (!canMutateSupport(staff.role)) {
    redirectError(formData, 'Permission denied');
  }

  try {
    const result = await updateSupportIssueMutation(supportDb(), {
      staff: { id: staff.id, email: staff.email, role: staff.role },
      staffRole: staff.role,
      issueId: pickString(formData, 'issueId'),
      status: pickString(formData, 'status') || undefined,
      priority: pickString(formData, 'priority') || undefined,
      assignedStaffId: formData.has('assignedStaffId') ? pickString(formData, 'assignedStaffId') || null : undefined,
      assignedAgentName: formData.has('assignedAgentName') ? pickString(formData, 'assignedAgentName') || null : undefined,
      nextAction: formData.has('nextAction') ? pickString(formData, 'nextAction') || null : undefined,
      resolutionNotes: formData.has('resolutionNotes') ? pickString(formData, 'resolutionNotes') || null : undefined,
      idempotencyKey: pickString(formData, 'idempotencyKey') || null,
    });
    revalidateSupportViews(result.businessId);
  } catch (error) {
    mapSupportError(formData, error);
  }

  redirect(returnPathFromForm(formData));
}

export async function addSupportIssueNoteAction(formData: FormData) {
  const staff = await requireControlStaffForMutation();
  if (!canMutateSupport(staff.role)) {
    redirectError(formData, 'Permission denied');
  }

  try {
    const result = await addSupportIssueNoteMutation(supportDb(), {
      staff: { id: staff.id, email: staff.email, role: staff.role },
      staffRole: staff.role,
      issueId: pickString(formData, 'issueId'),
      note: pickString(formData, 'note'),
      idempotencyKey: pickString(formData, 'idempotencyKey') || null,
    });
    revalidateSupportViews(result.businessId);
  } catch (error) {
    mapSupportError(formData, error);
  }

  redirect(returnPathFromForm(formData));
}

export async function resolveSupportIssueAction(formData: FormData) {
  formData.set('status', 'RESOLVED');
  return updateSupportIssueAction(formData);
}

export async function closeSupportIssueAction(formData: FormData) {
  formData.set('status', 'CLOSED');
  return updateSupportIssueAction(formData);
}
