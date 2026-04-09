'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { canManageStaff, canManageSubscriptions, canRecordPayments, canWriteNotes, requireControlStaff } from '@/lib/control-auth';
import { planRates, type ManagedPlan } from '@/lib/control-data';

type BillingCadence = 'MONTHLY' | 'ANNUAL';
type SubscriptionStatus = 'ACTIVE' | 'TRIAL' | 'SUSPENDED' | 'READ_ONLY' | 'INACTIVE';

function readRequired(formData: FormData, name: string) {
  return String(formData.get(name) ?? '').trim();
}

function readOptional(formData: FormData, name: string) {
  const value = String(formData.get(name) ?? '').trim();
  return value || null;
}

function parseOptionalDate(value: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseOptionalInteger(value: string | null, fallback = 0) {
  if (!value) return fallback;
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : fallback;
}

function normalizePlan(value: string): ManagedPlan {
  return value === 'PRO' || value === 'GROWTH' ? value : 'STARTER';
}

function normalizeCadence(value: string): BillingCadence {
  return value === 'ANNUAL' ? 'ANNUAL' : 'MONTHLY';
}

function normalizeSubscriptionStatus(value: string): SubscriptionStatus {
  switch (value) {
    case 'TRIAL':
      return 'TRIAL';
    case 'INACTIVE':
    case 'DEACTIVATED':
    case 'CANCELLED':
      return 'INACTIVE';
    case 'SUSPENDED':
      return 'SUSPENDED';
    case 'READ_ONLY':
      return 'READ_ONLY';
    case 'ACTIVE':
    default:
      return 'ACTIVE';
  }
}

function readReturnPath(formData: FormData, fallback: string) {
  const value = String(formData.get('returnPath') ?? '').trim();
  return value.startsWith('/') ? value : fallback;
}

function withRedirectParam(path: string, key: string, value: string) {
  const [pathname, query = ''] = path.split('?');
  const params = new URLSearchParams(query);
  params.set(key, value);
  const serialized = params.toString();
  return serialized ? `${pathname}?${serialized}` : pathname;
}

function addBillingInterval(startDate: Date, cadence: BillingCadence) {
  const nextDueDate = new Date(startDate);
  if (cadence === 'ANNUAL') {
    nextDueDate.setFullYear(nextDueDate.getFullYear() + 1);
  } else {
    nextDueDate.setMonth(nextDueDate.getMonth() + 1);
  }
  return nextDueDate;
}

function resolveSubscriptionDates(args: {
  billingCadence: BillingCadence;
  startDate?: Date | null;
  nextDueDate?: Date | null;
  fallbackStartDate?: Date | null;
  fallbackNextDueDate?: Date | null;
}) {
  const startDate = args.startDate ?? args.fallbackStartDate ?? new Date();
  const nextDueDate = args.nextDueDate ?? args.fallbackNextDueDate ?? addBillingInterval(startDate, args.billingCadence);
  return { startDate, nextDueDate };
}

function appendBillingEntry(existing: string | null | undefined, heading: string, lines: Array<string | null>) {
  const timestamp = new Date().toISOString();
  const entry = [`[${timestamp}] ${heading}`, ...lines.filter(Boolean)].join('\n');
  return [existing?.trim(), entry].filter(Boolean).join('\n\n');
}

function businessStatusFromSubscription(status: SubscriptionStatus) {
  switch (status) {
    case 'TRIAL':
      return 'TRIAL';
    case 'INACTIVE':
      return 'INACTIVE';
    case 'SUSPENDED':
      return 'SUSPENDED';
    case 'READ_ONLY':
      return 'READ_ONLY';
    case 'ACTIVE':
    default:
      return 'ACTIVE';
  }
}

async function applySoldPlanUpdate(tx: Omit<typeof prisma, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>, args: {
  profileId: string;
  businessId: string;
  currentBusinessPlan: string;
  currentBusinessPlanStatus?: string | null;
  purchasedPlan: ManagedPlan;
  billingCadence?: BillingCadence | null;
  startDate?: Date | null;
  nextDueDate?: Date | null;
}) {
  const existingSubscription = await tx.controlSubscription.findUnique({
    where: { controlBusinessId: args.profileId },
    select: {
      status: true,
      billingCadence: true,
      nextDueDate: true,
      lastPaymentDate: true,
      outstandingAmountPence: true,
      startDate: true,
    },
  });

  const billingCadence = args.billingCadence ?? normalizeCadence(existingSubscription?.billingCadence ?? 'MONTHLY');
  const { startDate, nextDueDate } = resolveSubscriptionDates({
    billingCadence,
    startDate: args.startDate,
    nextDueDate: args.nextDueDate,
    fallbackStartDate: existingSubscription?.startDate ?? null,
    fallbackNextDueDate: existingSubscription?.nextDueDate ?? null,
  });
  const status = normalizeSubscriptionStatus(existingSubscription?.status ?? args.currentBusinessPlanStatus ?? 'ACTIVE');

  await tx.controlSubscription.upsert({
    where: { controlBusinessId: args.profileId },
    update: {
      purchasedPlan: args.purchasedPlan,
      status,
      billingCadence,
      startDate,
      nextDueDate,
      monthlyValuePence: planRates[args.purchasedPlan],
    },
    create: {
      controlBusinessId: args.profileId,
      purchasedPlan: args.purchasedPlan,
      status,
      billingCadence,
      startDate,
      nextDueDate,
      lastPaymentDate: existingSubscription?.lastPaymentDate ?? null,
      outstandingAmountPence: existingSubscription?.outstandingAmountPence ?? 0,
      monthlyValuePence: planRates[args.purchasedPlan],
      gracePolicyVersion: '2026-04-08',
    },
  });

  await tx.business.update({
    where: { id: args.businessId },
    data: {
      plan: args.purchasedPlan,
      planSetAt: startDate,
      nextPaymentDueAt: nextDueDate,
    },
  });
}

async function ensureControlBusinessProfile(tx: Omit<typeof prisma, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>, businessId: string) {
  const business = await tx.business.findUnique({
    where: { id: businessId },
    select: {
      id: true,
      name: true,
      plan: true,
      planSetAt: true,
      nextPaymentDueAt: true,
      phone: true,
      billingNotes: true,
      users: {
        where: { role: 'OWNER' },
        take: 1,
        select: {
          name: true,
          email: true,
        },
      },
    },
  });

  if (!business) {
    throw new Error('The selected Tillflow business does not exist.');
  }

  const owner = business.users[0];

  const profile = await tx.controlBusinessProfile.upsert({
    where: { businessId },
    update: {},
    create: {
      businessId,
      ownerName: owner?.name ?? business.name,
      ownerPhone: business.phone,
      ownerEmail: owner?.email,
    },
  });

  return { business, profile };
}

function revalidateControlViews(businessId: string) {
  revalidatePath('/');
  revalidatePath('/businesses');
  revalidatePath(`/businesses/${businessId}`);
  revalidatePath('/staff');
  revalidatePath('/collections');
  revalidatePath('/revenue');
}

async function resolveAssignedManagerId(rawValue: string | null, fallbackStaffId: string) {
  if (!rawValue || rawValue === 'UNASSIGNED') {
    return null;
  }

  const managerId = rawValue === 'SELF' ? fallbackStaffId : rawValue;
  const manager = await prisma.controlStaff.findUnique({
    where: { id: managerId },
    select: { id: true, active: true },
  });

  if (!manager?.active) {
    throw new Error('The selected manager is not active in Tishgroup Control.');
  }

  return manager.id;
}

function ensureRole(condition: boolean, fallbackMessage: string, businessId: string) {
  if (!condition) {
    redirect(`/businesses/${businessId}?error=${encodeURIComponent(fallbackMessage)}`);
  }
}

export async function updateControlSubscriptionAction(formData: FormData): Promise<void> {
  const staff = await requireControlStaff();
  const businessId = readRequired(formData, 'businessId');
  const returnPath = readReturnPath(formData, `/businesses/${businessId}`);
  ensureRole(canManageSubscriptions(staff.role), 'Your Control role cannot change subscriptions.', businessId);

  const purchasedPlan = normalizePlan(readRequired(formData, 'purchasedPlan').toUpperCase());
  const billingCadence = normalizeCadence(readRequired(formData, 'billingCadence').toUpperCase());
  const status = normalizeSubscriptionStatus(readRequired(formData, 'status').toUpperCase());
  const requestedStartDate = parseOptionalDate(readOptional(formData, 'startDate'));
  const nextDueDate = parseOptionalDate(readOptional(formData, 'nextDueDate'));
  const trialEndsAt = parseOptionalDate(readOptional(formData, 'trialEndsAt'));
  const monthlyValuePence = parseOptionalInteger(readOptional(formData, 'monthlyValuePence'), planRates[purchasedPlan]);
  const outstandingAmountPence = parseOptionalInteger(readOptional(formData, 'outstandingAmountPence'), 0);
  const now = new Date();

  try {
    await prisma.$transaction(async (tx) => {
      const { business, profile } = await ensureControlBusinessProfile(tx, businessId);
      const existingSubscription = await tx.controlSubscription.findUnique({
        where: { controlBusinessId: profile.id },
        select: { startDate: true, nextDueDate: true },
      });
      const { startDate, nextDueDate: resolvedNextDueDate } = resolveSubscriptionDates({
        billingCadence,
        startDate: requestedStartDate,
        nextDueDate,
        fallbackStartDate: existingSubscription?.startDate ?? business.planSetAt,
        fallbackNextDueDate: existingSubscription?.nextDueDate ?? business.nextPaymentDueAt,
      });

      await tx.controlSubscription.upsert({
        where: { controlBusinessId: profile.id },
        update: {
          purchasedPlan,
          status,
          billingCadence,
          startDate,
          nextDueDate: resolvedNextDueDate,
          readOnlyAt: status === 'READ_ONLY' ? now : null,
          effectivePlanOverride: null,
          gracePolicyVersion: '2026-04-08',
          monthlyValuePence,
          outstandingAmountPence: status === 'INACTIVE' ? 0 : outstandingAmountPence,
        },
        create: {
          controlBusinessId: profile.id,
          purchasedPlan,
          status,
          billingCadence,
          startDate,
          nextDueDate: resolvedNextDueDate,
          readOnlyAt: status === 'READ_ONLY' ? now : null,
          gracePolicyVersion: '2026-04-08',
          monthlyValuePence,
          outstandingAmountPence: status === 'INACTIVE' ? 0 : outstandingAmountPence,
        },
      });

      if (profile.supportStatus === 'UNREVIEWED') {
        await tx.controlBusinessProfile.update({
          where: { id: profile.id },
          data: { supportStatus: 'HEALTHY' },
        });
      }

      await tx.business.update({
        where: { id: businessId },
        data: {
          plan: purchasedPlan,
          planStatus: businessStatusFromSubscription(status),
          trialEndsAt: status === 'TRIAL' ? trialEndsAt : null,
          planSetAt: startDate,
          nextPaymentDueAt: status === 'INACTIVE' ? null : resolvedNextDueDate,
          billingNotes: appendBillingEntry(business.billingNotes, 'Control subscription updated', [
            `Updated by: ${staff.name} (${staff.role})`,
            `Plan: ${purchasedPlan}`,
            `Status: ${status}`,
            `Cadence: ${billingCadence}`,
            `Start date: ${startDate.toISOString().slice(0, 10)}`,
            `Next due: ${resolvedNextDueDate ? resolvedNextDueDate.toISOString().slice(0, 10) : 'Not set'}`,
          ]),
        },
      });
    });
  } catch (error) {
    redirect(withRedirectParam(returnPath, 'error', error instanceof Error ? error.message : 'Unable to update the subscription.'));
  }

  revalidateControlViews(businessId);
  redirect(withRedirectParam(returnPath, 'updated', 'subscription'));
}

export async function recordControlPaymentAction(formData: FormData): Promise<void> {
  const staff = await requireControlStaff();
  const businessId = readRequired(formData, 'businessId');
  ensureRole(canRecordPayments(staff.role), 'Your Control role cannot record payments.', businessId);

  const amountPence = parseOptionalInteger(readOptional(formData, 'amountPence'), 0);
  const method = readRequired(formData, 'method');
  const reference = readOptional(formData, 'reference');
  const note = readOptional(formData, 'note');
  const paidAt = parseOptionalDate(readOptional(formData, 'paidAt')) ?? new Date();
  const billingCadence = normalizeCadence(readRequired(formData, 'billingCadence').toUpperCase());
  const explicitNextDueDate = parseOptionalDate(readOptional(formData, 'nextDueDate'));
  const nextDueDate = explicitNextDueDate ?? new Date(paidAt.getTime() + (billingCadence === 'ANNUAL' ? 365 : 30) * 24 * 60 * 60 * 1000);

  try {
    await prisma.$transaction(async (tx) => {
      const { business, profile } = await ensureControlBusinessProfile(tx, businessId);
      const existingSubscription = await tx.controlSubscription.findUnique({
        where: { controlBusinessId: profile.id },
        select: { purchasedPlan: true, startDate: true },
      });

      await tx.controlPayment.create({
        data: {
          controlBusinessId: profile.id,
          amountPence,
          paidAt,
          method,
          reference,
          note,
          receivedByStaffId: staff.id,
        },
      });

      await tx.controlSubscription.upsert({
        where: { controlBusinessId: profile.id },
        update: {
          purchasedPlan: normalizePlan(existingSubscription?.purchasedPlan ?? business.plan),
          status: 'ACTIVE',
          billingCadence,
          nextDueDate,
          lastPaymentDate: paidAt,
          readOnlyAt: null,
          monthlyValuePence: planRates[normalizePlan(existingSubscription?.purchasedPlan ?? business.plan)],
          outstandingAmountPence: 0,
          gracePolicyVersion: '2026-04-08',
        },
        create: {
          controlBusinessId: profile.id,
          purchasedPlan: normalizePlan(business.plan),
          status: 'ACTIVE',
          billingCadence,
          startDate: existingSubscription?.startDate ?? paidAt,
          nextDueDate,
          lastPaymentDate: paidAt,
          monthlyValuePence: planRates[normalizePlan(business.plan)],
          outstandingAmountPence: 0,
          gracePolicyVersion: '2026-04-08',
        },
      });

      if (profile.supportStatus === 'UNREVIEWED') {
        await tx.controlBusinessProfile.update({
          where: { id: profile.id },
          data: { supportStatus: 'HEALTHY' },
        });
      }

      await tx.business.update({
        where: { id: businessId },
        data: {
          planStatus: 'ACTIVE',
          trialEndsAt: null,
          lastPaymentAt: paidAt,
          nextPaymentDueAt: nextDueDate,
          billingNotes: appendBillingEntry(business.billingNotes, 'Control payment recorded', [
            `Recorded by: ${staff.name} (${staff.role})`,
            `Amount: GHc ${amountPence.toLocaleString('en-GH')}`,
            `Method: ${method}`,
            reference ? `Reference: ${reference}` : null,
            `Paid at: ${paidAt.toISOString().slice(0, 10)}`,
            `Next due: ${nextDueDate.toISOString().slice(0, 10)}`,
            note ? `Note: ${note}` : null,
          ]),
        },
      });
    });
  } catch (error) {
    redirect(`/businesses/${businessId}?error=${encodeURIComponent(error instanceof Error ? error.message : 'Unable to record the payment.')}`);
  }

  revalidateControlViews(businessId);
  redirect(`/businesses/${businessId}?updated=payment`);
}

export async function addControlNoteAction(formData: FormData): Promise<void> {
  const staff = await requireControlStaff();
  const businessId = readRequired(formData, 'businessId');
  ensureRole(canWriteNotes(staff.role), 'Your Control role cannot add internal notes.', businessId);

  const category = readRequired(formData, 'category').toUpperCase() || 'GENERAL';
  const note = readRequired(formData, 'note');

  try {
    await prisma.$transaction(async (tx) => {
      const { business, profile } = await ensureControlBusinessProfile(tx, businessId);

      await tx.controlNote.create({
        data: {
          controlBusinessId: profile.id,
          category,
          note,
          createdByStaffId: staff.id,
        },
      });

      await tx.controlBusinessProfile.update({
        where: { id: profile.id },
        data: {
          notes: note,
          supportStatus: profile.supportStatus === 'UNREVIEWED' ? 'HEALTHY' : profile.supportStatus,
          lastActivityAt: new Date(),
        },
      });

      await tx.business.update({
        where: { id: businessId },
        data: {
          billingNotes: appendBillingEntry(business.billingNotes, 'Control note added', [
            `Added by: ${staff.name} (${staff.role})`,
            `Category: ${category}`,
            note,
          ]),
        },
      });
    });
  } catch (error) {
    redirect(`/businesses/${businessId}?error=${encodeURIComponent(error instanceof Error ? error.message : 'Unable to save the note.')}`);
  }

  revalidateControlViews(businessId);
  redirect(`/businesses/${businessId}?updated=note`);
}

export async function reviewControlBusinessAction(formData: FormData): Promise<void> {
  const staff = await requireControlStaff();
  const businessId = readRequired(formData, 'businessId');
  ensureRole(canWriteNotes(staff.role), 'Your Control role cannot review businesses.', businessId);

  const requestedManager = readOptional(formData, 'assignedManagerId');
  const reviewNote = readOptional(formData, 'reviewNote');
  const soldPlanRaw = readOptional(formData, 'purchasedPlan');
  const soldPlan = soldPlanRaw && soldPlanRaw !== 'KEEP_CURRENT' ? normalizePlan(soldPlanRaw.toUpperCase()) : null;
  const billingCadence = soldPlan ? normalizeCadence(readRequired(formData, 'billingCadence').toUpperCase()) : null;
  const startDate = soldPlan ? parseOptionalDate(readOptional(formData, 'startDate')) : undefined;
  const nextDueDate = soldPlan ? parseOptionalDate(readOptional(formData, 'nextDueDate')) : undefined;

  try {
    const assignedManagerId = await resolveAssignedManagerId(requestedManager, staff.id);

    await prisma.$transaction(async (tx) => {
      const { business, profile } = await ensureControlBusinessProfile(tx, businessId);

      await tx.controlBusinessProfile.update({
        where: { id: profile.id },
        data: {
          assignedManagerId,
          reviewedByStaffId: staff.id,
          reviewedAt: new Date(),
          supportStatus: 'HEALTHY',
          notes: reviewNote ?? profile.notes,
          lastActivityAt: new Date(),
        },
      });

      if (soldPlan) {
        await applySoldPlanUpdate(tx, {
          profileId: profile.id,
          businessId,
          currentBusinessPlan: business.plan,
          purchasedPlan: soldPlan,
          billingCadence,
          startDate,
          nextDueDate,
        });
      }

      if (reviewNote) {
        await tx.controlNote.create({
          data: {
            controlBusinessId: profile.id,
            category: 'REVIEW',
            note: reviewNote,
            createdByStaffId: staff.id,
          },
        });
      }

      await tx.business.update({
        where: { id: businessId },
        data: {
          billingNotes: appendBillingEntry(business.billingNotes, 'Control review completed', [
            `Reviewed by: ${staff.name} (${staff.role})`,
            assignedManagerId ? `Assigned manager id: ${assignedManagerId}` : 'Assigned manager: Unassigned',
            soldPlan ? `Sold plan set: ${soldPlan}` : null,
            soldPlan && billingCadence ? `Cadence: ${billingCadence}` : null,
            soldPlan && startDate ? `Start date: ${startDate.toISOString().slice(0, 10)}` : null,
            reviewNote ? `Review note: ${reviewNote}` : null,
          ]),
        },
      });
    });
  } catch (error) {
    redirect(`/businesses/${businessId}?error=${encodeURIComponent(error instanceof Error ? error.message : 'Unable to review the business.')}`);
  }

  revalidateControlViews(businessId);
  redirect(`/businesses/${businessId}?updated=review`);
}

export async function reopenControlBusinessReviewAction(formData: FormData): Promise<void> {
  const staff = await requireControlStaff();
  const businessId = readRequired(formData, 'businessId');
  ensureRole(canWriteNotes(staff.role), 'Your Control role cannot reopen business reviews.', businessId);

  const reviewNote = readOptional(formData, 'reviewNote');

  try {
    await prisma.$transaction(async (tx) => {
      const { business, profile } = await ensureControlBusinessProfile(tx, businessId);

      await tx.controlBusinessProfile.update({
        where: { id: profile.id },
        data: {
          supportStatus: 'UNREVIEWED',
          reviewedByStaffId: null,
          reviewedAt: null,
          lastActivityAt: new Date(),
        },
      });

      const resolvedNote = reviewNote ?? 'Returned to the TG review queue for follow-up.';

      await tx.controlNote.create({
        data: {
          controlBusinessId: profile.id,
          category: 'REVIEW',
          note: resolvedNote,
          createdByStaffId: staff.id,
        },
      });

      await tx.business.update({
        where: { id: businessId },
        data: {
          billingNotes: appendBillingEntry(business.billingNotes, 'Business returned to review queue', [
            `Reopened by: ${staff.name} (${staff.role})`,
            reviewNote ? `Reason: ${reviewNote}` : 'Reason: Returned for another commercial review.',
          ]),
        },
      });
    });
  } catch (error) {
    redirect(`/businesses/${businessId}?error=${encodeURIComponent(error instanceof Error ? error.message : 'Unable to return the business to the review queue.')}`);
  }

  revalidateControlViews(businessId);
  redirect(`/businesses/${businessId}?updated=reopened`);
}

export async function createControlStaffAction(formData: FormData): Promise<void> {
  const staff = await requireControlStaff();
  if (!canManageStaff(staff.role)) {
    redirect('/staff?error=Only TG control admins can manage staff accounts.');
  }

  const name = readRequired(formData, 'name');
  const email = readRequired(formData, 'email').toLowerCase();
  const role = readRequired(formData, 'role').toUpperCase();

  try {
    await prisma.controlStaff.upsert({
      where: { email },
      update: {
        name,
        role,
        active: true,
      },
      create: {
        name,
        email,
        role,
        active: true,
      },
    });
  } catch (error) {
    redirect(`/staff?error=${encodeURIComponent(error instanceof Error ? error.message : 'Unable to save the staff account.')}`);
  }

  revalidatePath('/staff');
  redirect('/staff?updated=staff-created');
}

export async function toggleControlStaffAction(formData: FormData): Promise<void> {
  const staff = await requireControlStaff();
  if (!canManageStaff(staff.role)) {
    redirect('/staff?error=Only TG control admins can manage staff accounts.');
  }

  const staffId = readRequired(formData, 'staffId');
  const makeActive = readRequired(formData, 'makeActive') === 'true';

  try {
    await prisma.controlStaff.update({
      where: { id: staffId },
      data: { active: makeActive },
    });
  } catch (error) {
    redirect(`/staff?error=${encodeURIComponent(error instanceof Error ? error.message : 'Unable to update the staff account.')}`);
  }

  revalidatePath('/staff');
  redirect(`/staff?updated=${makeActive ? 'staff-activated' : 'staff-deactivated'}`);
}

export async function bulkReviewControlBusinessesAction(formData: FormData): Promise<void> {
  const staff = await requireControlStaff();
  if (!canWriteNotes(staff.role)) {
    redirect('/businesses?filter=unreviewed&error=Your TG role cannot bulk review businesses.');
  }

  const requestedManager = readOptional(formData, 'assignedManagerId');
  const reviewNote = readOptional(formData, 'reviewNote');
  const soldPlanRaw = readOptional(formData, 'purchasedPlan');
  const soldPlan = soldPlanRaw && soldPlanRaw !== 'KEEP_CURRENT' ? normalizePlan(soldPlanRaw.toUpperCase()) : null;
  const billingCadence = soldPlan ? normalizeCadence(readRequired(formData, 'billingCadence').toUpperCase()) : null;
  const startDate = soldPlan ? parseOptionalDate(readOptional(formData, 'startDate')) : undefined;
  const nextDueDate = soldPlan ? parseOptionalDate(readOptional(formData, 'nextDueDate')) : undefined;
  const businessIds = readRequired(formData, 'businessIds')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  if (businessIds.length === 0) {
    redirect('/businesses?filter=unreviewed&error=No businesses were selected for bulk review.');
  }

  try {
    const assignedManagerId = await resolveAssignedManagerId(requestedManager, staff.id);

    await prisma.$transaction(async (tx) => {
      for (const businessId of businessIds) {
        const { business, profile } = await ensureControlBusinessProfile(tx, businessId);

        await tx.controlBusinessProfile.update({
          where: { id: profile.id },
          data: {
            assignedManagerId,
            reviewedByStaffId: staff.id,
            reviewedAt: new Date(),
            supportStatus: 'HEALTHY',
            notes: reviewNote ?? profile.notes,
            lastActivityAt: new Date(),
          },
        });

        if (soldPlan) {
          await applySoldPlanUpdate(tx, {
            profileId: profile.id,
            businessId,
            currentBusinessPlan: business.plan,
            purchasedPlan: soldPlan,
            billingCadence,
            startDate,
            nextDueDate,
          });
        }

        if (reviewNote) {
          await tx.controlNote.create({
            data: {
              controlBusinessId: profile.id,
              category: 'REVIEW',
              note: reviewNote,
              createdByStaffId: staff.id,
            },
          });
        }

        await tx.business.update({
          where: { id: businessId },
          data: {
            billingNotes: appendBillingEntry(business.billingNotes, 'Bulk TG review completed', [
              `Reviewed by: ${staff.name} (${staff.role})`,
              assignedManagerId ? `Assigned manager id: ${assignedManagerId}` : 'Assigned manager: Unassigned',
              soldPlan ? `Sold plan set: ${soldPlan}` : null,
              soldPlan && billingCadence ? `Cadence: ${billingCadence}` : null,
              soldPlan && startDate ? `Start date: ${startDate.toISOString().slice(0, 10)}` : null,
              reviewNote ? `Review note: ${reviewNote}` : null,
            ]),
          },
        });
      }
    });
  } catch (error) {
    redirect(`/businesses?filter=unreviewed&error=${encodeURIComponent(error instanceof Error ? error.message : 'Unable to bulk review the selected businesses.')}`);
  }

  revalidatePath('/');
  revalidatePath('/businesses');
  redirect('/businesses?filter=unreviewed&updated=bulk-review');
}