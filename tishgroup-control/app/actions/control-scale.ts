'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { recordAudit } from '@/lib/audit';
import { canManageSubscriptions, canWriteNotes, requireControlStaff } from '@/lib/control-auth';

function readReturnPath(formData: FormData) {
  const value = String(formData.get('returnPath') ?? '').trim();
  return value.startsWith('/') ? value : '/command/scale';
}

function revalidateScaleViews(businessId?: string) {
  revalidateTag('control-portfolio');
  revalidateTag('scale-cockpit');
  revalidatePath('/command/scale');
  if (businessId) {
    revalidatePath(`/command/scale?businessId=${businessId}`);
    revalidatePath(`/businesses/${businessId}`);
  }
}

async function ensureProfile(businessId: string) {
  const existing = await prisma.controlBusinessProfile.findUnique({ where: { businessId } });
  if (existing) return existing;

  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: {
      name: true,
      phone: true,
      users: { where: { role: 'OWNER' }, take: 1, select: { name: true, email: true } },
    },
  });
  if (!business) throw new Error('Business not found');

  const owner = business.users[0];
  return prisma.controlBusinessProfile.create({
    data: {
      businessId,
      ownerName: owner?.name ?? null,
      ownerPhone: business.phone,
      ownerEmail: owner?.email ?? null,
      supportStatus: 'UNREVIEWED',
    },
  });
}

export async function assignScaleAgentAction(formData: FormData) {
  const staff = await requireControlStaff();
  if (!canWriteNotes(staff.role)) {
    redirect(`${readReturnPath(formData)}&error=Permission denied`);
  }

  const businessId = String(formData.get('businessId') ?? '').trim();
  const agentName = String(formData.get('assignedAgentName') ?? '').trim();
  const managerId = String(formData.get('assignedManagerId') ?? '').trim() || null;

  if (!businessId || !agentName) {
    redirect(`${readReturnPath(formData)}&error=Missing business or agent`);
  }

  const profile = await ensureProfile(businessId);
  const previous = profile.assignedAgentName ?? profile.assignedManagerId ?? 'Unassigned';

  await prisma.controlBusinessProfile.update({
    where: { id: profile.id },
    data: {
      assignedAgentName: agentName,
      ...(managerId ? { assignedManagerId: managerId } : {}),
    },
  });

  await recordAudit({
    staff: { id: staff.id, email: staff.email, role: staff.role },
    action: 'AGENT_ASSIGNED',
    businessId,
    summary: `Assigned agent: ${agentName}`,
    metadata: { previous, next: agentName, managerId },
  });

  revalidateScaleViews(businessId);
  redirect(readReturnPath(formData));
}

function readReferralSnapshot(profile: {
  referralSource: string | null;
  referredBy: string | null;
  referredByName: string | null;
  referredByPhone: string | null;
  sourceChannel: string | null;
  referralStatus: string | null;
  referralNextFollowUpAt: Date | null;
  referralNotes: string | null;
  assignedAgentName: string | null;
}) {
  return {
    referralSource: profile.referralSource,
    referredBy: profile.referredBy,
    referredByName: profile.referredByName,
    referredByPhone: profile.referredByPhone,
    sourceChannel: profile.sourceChannel,
    referralStatus: profile.referralStatus,
    referralNextFollowUpAt: profile.referralNextFollowUpAt?.toISOString() ?? null,
    referralNotes: profile.referralNotes,
    assignedAgentName: profile.assignedAgentName,
  };
}

function parseFollowUpDate(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function updateScaleReferralAction(formData: FormData) {
  const staff = await requireControlStaff();
  if (!canWriteNotes(staff.role)) {
    redirect(`${readReturnPath(formData)}&error=Permission denied`);
  }

  const businessId = String(formData.get('businessId') ?? '').trim();
  if (!businessId) redirect(`${readReturnPath(formData)}&error=Missing business`);

  const referralSource = String(formData.get('referralSource') ?? '').trim() || null;
  const referredByName = String(formData.get('referredByName') ?? '').trim() || null;
  const referredByPhone = String(formData.get('referredByPhone') ?? '').trim() || null;
  const sourceChannel = String(formData.get('sourceChannel') ?? '').trim() || null;
  const referralStatus = String(formData.get('referralStatus') ?? '').trim() || null;
  const referralNotes = String(formData.get('referralNotes') ?? '').trim() || null;
  const referralNextFollowUpAt = parseFollowUpDate(String(formData.get('referralNextFollowUpAt') ?? ''));
  const referredBy =
    [referredByName, referredByPhone].filter(Boolean).join(' · ') ||
    String(formData.get('referredBy') ?? '').trim() ||
    null;

  const profile = await ensureProfile(businessId);
  const previous = readReferralSnapshot(profile);

  await prisma.controlBusinessProfile.update({
    where: { id: profile.id },
    data: {
      referralSource,
      referredBy,
      referredByName,
      referredByPhone,
      sourceChannel,
      referralStatus,
      referralNotes,
      referralNextFollowUpAt,
    },
  });

  await recordAudit({
    staff: { id: staff.id, email: staff.email, role: staff.role },
    action: 'REFERRAL_UPDATED',
    businessId,
    summary: 'Referral / source updated',
    metadata: {
      previous,
      next: {
        referralSource,
        referredByName,
        referredByPhone,
        sourceChannel,
        referralStatus,
        referralNotes,
        referralNextFollowUpAt: referralNextFollowUpAt?.toISOString() ?? null,
      },
    },
  });

  revalidateScaleViews(businessId);
  revalidatePath('/command/referrals');
  redirect(readReturnPath(formData));
}

export async function markReferralStatusAction(formData: FormData) {
  const staff = await requireControlStaff();
  if (!canWriteNotes(staff.role)) {
    redirect(`${readReturnPath(formData)}&error=Permission denied`);
  }

  const businessId = String(formData.get('businessId') ?? '').trim();
  const referralStatus = String(formData.get('referralStatus') ?? '').trim();
  if (!businessId || !referralStatus) redirect(`${readReturnPath(formData)}&error=Missing status`);

  const profile = await ensureProfile(businessId);
  const previous = profile.referralStatus;

  await prisma.controlBusinessProfile.update({
    where: { id: profile.id },
    data: { referralStatus },
  });

  await recordAudit({
    staff: { id: staff.id, email: staff.email, role: staff.role },
    action: 'REFERRAL_UPDATED',
    businessId,
    summary: `Referral status → ${referralStatus.replace(/_/g, ' ')}`,
    metadata: { previous, next: referralStatus },
  });

  revalidateScaleViews(businessId);
  revalidatePath('/command/referrals');
  redirect(readReturnPath(formData));
}

export async function addScaleSupportNoteAction(formData: FormData) {
  const staff = await requireControlStaff();
  if (!canWriteNotes(staff.role)) {
    redirect(`${readReturnPath(formData)}&error=Permission denied`);
  }

  const businessId = String(formData.get('businessId') ?? '').trim();
  const note = String(formData.get('note') ?? '').trim();
  const category = String(formData.get('category') ?? 'SUPPORT').trim() || 'SUPPORT';

  if (!businessId || !note) redirect(`${readReturnPath(formData)}&error=Missing note`);

  const profile = await ensureProfile(businessId);
  await prisma.controlNote.create({
    data: {
      controlBusinessId: profile.id,
      category,
      note,
      createdByStaffId: staff.id,
    },
  });

  await recordAudit({
    staff: { id: staff.id, email: staff.email, role: staff.role },
    action: 'NOTE_ADDED',
    businessId,
    summary: `Support note: ${note.slice(0, 80)}`,
    metadata: { category },
  });

  revalidateScaleViews(businessId);
  redirect(readReturnPath(formData));
}

export async function markScaleSetupCallAction(formData: FormData) {
  const staff = await requireControlStaff();
  if (!canWriteNotes(staff.role)) redirect(`${readReturnPath(formData)}&error=Permission denied`);

  const businessId = String(formData.get('businessId') ?? '').trim();
  if (!businessId) redirect(`${readReturnPath(formData)}&error=Missing business`);

  const profile = await ensureProfile(businessId);
  await prisma.controlBusinessProfile.update({
    where: { id: profile.id },
    data: { setupCallCompletedAt: new Date(), supportStatus: 'HEALTHY' },
  });

  await recordAudit({
    staff: { id: staff.id, email: staff.email, role: staff.role },
    action: 'SETUP_CALL_COMPLETED',
    businessId,
    summary: 'Setup call marked completed',
  });

  revalidateScaleViews(businessId);
  redirect(readReturnPath(formData));
}

export async function markScaleFirstSaleAction(formData: FormData) {
  const staff = await requireControlStaff();
  if (!canWriteNotes(staff.role)) redirect(`${readReturnPath(formData)}&error=Permission denied`);

  const businessId = String(formData.get('businessId') ?? '').trim();
  if (!businessId) redirect(`${readReturnPath(formData)}&error=Missing business`);

  const profile = await ensureProfile(businessId);
  await prisma.controlBusinessProfile.update({
    where: { id: profile.id },
    data: { firstSaleMarkedAt: new Date() },
  });

  await recordAudit({
    staff: { id: staff.id, email: staff.email, role: staff.role },
    action: 'FIRST_SALE_VERIFIED',
    businessId,
    summary: 'First sale verified by Tish Group',
  });

  revalidateScaleViews(businessId);
  redirect(readReturnPath(formData));
}

export async function markScalePaymentFollowUpAction(formData: FormData) {
  const staff = await requireControlStaff();
  if (!canWriteNotes(staff.role)) redirect(`${readReturnPath(formData)}&error=Permission denied`);

  const businessId = String(formData.get('businessId') ?? '').trim();
  const needed = formData.get('needed') !== 'false';

  if (!businessId) redirect(`${readReturnPath(formData)}&error=Missing business`);

  const profile = await ensureProfile(businessId);
  await prisma.controlBusinessProfile.update({
    where: { id: profile.id },
    data: { paymentFollowUpNeeded: needed },
  });

  await recordAudit({
    staff: { id: staff.id, email: staff.email, role: staff.role },
    action: 'PAYMENT_FOLLOWUP_FLAGGED',
    businessId,
    summary: needed ? 'Payment follow-up flagged' : 'Payment follow-up cleared',
    metadata: { needed },
  });

  revalidateScaleViews(businessId);
  redirect(readReturnPath(formData));
}

export async function extendScaleTrialGraceAction(formData: FormData) {
  const staff = await requireControlStaff();
  if (!canManageSubscriptions(staff.role)) {
    redirect(`${readReturnPath(formData)}&error=Permission denied`);
  }

  const businessId = String(formData.get('businessId') ?? '').trim();
  const hours = Math.min(168, Math.max(24, parseInt(String(formData.get('hours') ?? '48'), 10) || 48));

  if (!businessId) redirect(`${readReturnPath(formData)}&error=Missing business`);

  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { paymentGraceEndsAt: true, trialEndsAt: true },
  });
  if (!business) redirect(`${readReturnPath(formData)}&error=Business not found`);

  const base = business.paymentGraceEndsAt ?? business.trialEndsAt ?? new Date();
  const graceEndsAt = new Date(base.getTime() + hours * 60 * 60 * 1000);

  const previous = business.paymentGraceEndsAt?.toISOString() ?? null;
  await prisma.business.update({
    where: { id: businessId },
    data: { paymentGraceEndsAt: graceEndsAt },
  });

  await recordAudit({
    staff: { id: staff.id, email: staff.email, role: staff.role },
    action: 'TRIAL_GRACE_EXTENDED',
    businessId,
    summary: `Trial/payment grace extended by ${hours}h`,
    metadata: { previous, next: graceEndsAt.toISOString(), hours },
  });

  revalidateScaleViews(businessId);
  redirect(readReturnPath(formData));
}
