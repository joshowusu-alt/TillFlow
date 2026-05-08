import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import { managedBusinesses, planRates, type BusinessHealth, type ManagedBusiness, type ManagedPlan, type ManagedState } from '@/lib/control-data';
import { deriveManagedState } from '@/lib/billing-state';
import { prisma } from '@/lib/prisma';

export type ManagedBusinessPayment = {
  id: string;
  amountPence: number;
  paidAt: string;
  method: string;
  reference: string | null;
  note: string | null;
  receivedBy: string;
};

export type ManagedBusinessNote = {
  id: string;
  category: string;
  note: string;
  createdAt: string;
  createdBy: string;
};

export type ManagedBusinessReminder = {
  id: string;
  eventType: string;
  status: string;
  recipient: string;
  attempts: number;
  lastError: string | null;
  nextAttemptAt: string | null;
  sentAt: string | null;
  createdAt: string;
};

export type ManagedBusinessDetail = ManagedBusiness & {
  commercialSource: 'CONTROL_PLANE' | 'TILLFLOW_DERIVED';
  subscriptionStatus: string;
  trialEndsAt: string | null;
  supportStatus: string;
  assignedManagerId: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
  recentPayments: ManagedBusinessPayment[];
  recentNotes: ManagedBusinessNote[];
  recentReminders: ManagedBusinessReminder[];
  addonOnlineStorefront: boolean;
};

export type ManagedBusinessRosterFilter = 'all' | 'unreviewed';

export type ManagedBusinessRosterOptions = {
  filter?: ManagedBusinessRosterFilter;
  search?: string;
  page?: number;
  pageSize?: number;
};

export type ManagedBusinessRoster = {
  items: ManagedBusiness[];
  filter: ManagedBusinessRosterFilter;
  search: string;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  startIndex: number;
  endIndex: number;
  totalBusinesses: number;
  unreviewedCount: number;
};

function isMissingTableError(error: unknown) {
  return error instanceof Error && (error.message.includes('no such table') || error.message.includes('does not exist in the current database'));
}

function isMissingControlPlaneError(error: unknown) {
  return isMissingTableError(error)
    || (error instanceof Error
      && (error.message.includes('Unknown field')
        || error.message.includes('controlBusinessProfile')
        || error.message.includes('ControlBusinessProfile')));
}

function inferHealth(state: ManagedBusiness['state']): BusinessHealth {
  if (state === 'INACTIVE' || state === 'CANCELLED') return 'HEALTHY';
  if (state === 'READ_ONLY' || state === 'STARTER_FALLBACK' || state === 'SUSPENDED' || state === 'OVERDUE') return 'AT_RISK';
  if (state === 'GRACE' || state === 'GRACE_PERIOD' || state === 'DUE_SOON' || state === 'DUE_TODAY' || state === 'TRIAL_EXPIRING_SOON' || state === 'PAYMENT_PENDING' || state === 'TRIAL_ENDED') return 'WATCH';
  return 'HEALTHY';
}

function normalizePlan(plan?: string | null): ManagedPlan {
  return plan === 'PRO' || plan === 'GROWTH' ? plan : 'STARTER';
}

function formatDate(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function formatDateTime(value: Date | string | null | undefined) {
  if (!value) return 'No recent activity';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return 'No recent activity';
  return date.toISOString().slice(0, 16).replace('T', ' ');
}

function formatIsoDateTime(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 16).replace('T', ' ');
}

function normalizeCadence(value?: string | null): ManagedBusiness['billingCadence'] {
  return String(value ?? '').toUpperCase() === 'ANNUAL' ? 'ANNUAL' : 'MONTHLY';
}

function normalizeManualManagedState(value?: string | null): ManagedState | null {
  switch (String(value ?? '').toUpperCase()) {
    case 'INACTIVE':
    case 'DEACTIVATED':
    case 'CANCELLED':
      return 'CANCELLED';
    case 'SUSPENDED':
    case 'READ_ONLY':
    case 'STARTER_FALLBACK':
      return String(value).toUpperCase() as ManagedState;
    default:
      return null;
  }
}

function requiresCollection(state: ManagedState) {
  return [
    'DUE_SOON',
    'DUE_TODAY',
    'OVERDUE',
    'GRACE',
    'GRACE_PERIOD',
    'PAYMENT_PENDING',
    'TRIAL_ENDED',
    'STARTER_FALLBACK',
    'READ_ONLY',
    'SUSPENDED',
  ].includes(state);
}

function resolveEffectivePlan(state: ManagedState, plan: ManagedPlan, override?: string | null): ManagedPlan {
  if (override === 'PRO' || override === 'GROWTH' || override === 'STARTER') {
    return override;
  }
  if (state === 'INACTIVE' || state === 'CANCELLED') {
    return plan;
  }
  if (state === 'STARTER_FALLBACK' || state === 'READ_ONLY' || state === 'SUSPENDED') {
    return 'STARTER';
  }
  return plan;
}

async function getControlProfilesByBusinessId() {
  try {
    const profiles = await prisma.controlBusinessProfile.findMany({
      include: {
        assignedManager: {
          select: { name: true },
        },
        subscription: true,
        payments: {
          orderBy: { paidAt: 'desc' },
          take: 1,
          select: { paidAt: true },
        },
        notesEntries: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { note: true },
        },
        reviewedByStaff: {
          select: { name: true },
        },
      },
    });

    return new Map(profiles.map((profile) => [profile.businessId, profile]));
  } catch (error) {
    if (!isMissingControlPlaneError(error)) {
      console.error('[tishgroup-control] Failed to load control-plane tables, using tenant-derived data', error);
    }
    return new Map();
  }
}

// Per-request memo (React cache) layered on top of a 60s cross-request
// data cache (unstable_cache). Mutations invalidate the data cache via
// revalidateTag('control-portfolio') from revalidateControlViews().
const _loadLiveBusinesses = unstable_cache(
  async (): Promise<ManagedBusiness[]> => {
    return computeLiveBusinesses();
  },
  ['control-live-businesses'],
  { revalidate: 60, tags: ['control-portfolio'] }
);

const getLiveBusinesses = cache(async (): Promise<ManagedBusiness[]> => _loadLiveBusinesses());

async function computeLiveBusinesses(): Promise<ManagedBusiness[]> {
  try {
    const [businesses, controlProfiles] = await Promise.all([
      prisma.business.findMany({
      where: { isDemo: false },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        phone: true,
        plan: true,
        planStatus: true,
        selectedPlan: true,
        trialStartedAt: true,
        trialEndsAt: true,
        subscriptionStatus: true,
        firstPaymentAt: true,
        currentPeriodEndsAt: true,
        nextBillingDate: true,
        paymentGraceEndsAt: true,
        suspendedAt: true,
        cancelledAt: true,
        planSetAt: true,
        lastPaymentAt: true,
        nextPaymentDueAt: true,
        billingNotes: true,
        createdAt: true,
        users: {
          where: { role: 'OWNER' },
          take: 1,
          select: { name: true, email: true },
        },
        stores: {
          select: { id: true },
        },
        salesInvoices: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { createdAt: true },
        },
        messageOutbox: {
          where: { eventType: { startsWith: 'SUBSCRIPTION_' } },
          orderBy: { createdAt: 'desc' },
          take: 6,
          select: {
            status: true,
            sentAt: true,
            nextAttemptAt: true,
            createdAt: true,
          },
        },
      },
      }),
      getControlProfilesByBusinessId(),
    ]);

    if (businesses.length === 0) {
      return managedBusinesses;
    }

    return businesses.map((business) => {
      const profile = controlProfiles.get(business.id);
      const subscription = profile?.subscription;
      const plan = normalizePlan(subscription?.purchasedPlan ?? business.selectedPlan ?? business.plan);
      const manualState = normalizeManualManagedState(subscription?.status);
      const derived = deriveManagedState({
        plan,
        planStatus: subscription?.status ?? business.planStatus,
        subscriptionStatus: business.subscriptionStatus,
        trialStartedAt: business.trialStartedAt,
        trialEndsAt: business.trialEndsAt,
        firstPaymentAt: business.firstPaymentAt
          ?? subscription?.lastPaymentDate
          ?? business.lastPaymentAt
          ?? (String(subscription?.status ?? '').toUpperCase() === 'ACTIVE' ? subscription?.startDate : null),
        currentPeriodEndsAt: business.currentPeriodEndsAt,
        nextBillingDate: subscription?.nextDueDate ?? business.nextBillingDate,
        nextPaymentDueAt: business.nextPaymentDueAt,
        paymentGraceEndsAt: business.paymentGraceEndsAt,
        suspendedAt: business.suspendedAt,
        cancelledAt: business.cancelledAt,
      });
      const state = manualState ?? derived.state;
      const effectivePlan = resolveEffectivePlan(state, plan, subscription?.effectivePlanOverride);
      const owner = business.users[0];
      const monthlyValue = subscription?.monthlyValuePence ?? planRates[plan];
      const storedOutstandingAmount = subscription?.outstandingAmountPence ?? null;
      const outstandingAmount = state === 'INACTIVE' || state === 'CANCELLED'
        ? 0
        : storedOutstandingAmount && storedOutstandingAmount > 0
          ? storedOutstandingAmount
          : requiresCollection(state)
            ? monthlyValue
            : 0;
      const lastPaymentAt = profile?.payments[0]?.paidAt ?? subscription?.lastPaymentDate ?? business.lastPaymentAt;
      const latestNote = profile?.notesEntries[0]?.note;
      const latestReminder = business.messageOutbox[0];
      const nextReminder = business.messageOutbox.find((row) => row.status === 'PENDING');
      const failedReminderCount = business.messageOutbox.filter((row) => row.status === 'FAILED').length;
      const needsReview = !profile || String(profile.supportStatus ?? '').toUpperCase() === 'UNREVIEWED';

      return {
        id: business.id,
        name: business.name,
        ownerName: profile?.ownerName ?? owner?.name ?? 'Owner not assigned',
        ownerPhone: profile?.ownerPhone ?? business.phone ?? 'Phone not recorded',
        ownerEmail: profile?.ownerEmail ?? owner?.email ?? 'Email not recorded',
        assignedManager: profile?.assignedManager?.name ?? 'Unassigned',
        plan,
        effectivePlan,
        state,
        billingCadence: normalizeCadence(subscription?.billingCadence),
        subscriptionStartAt: formatDate(subscription?.startDate ?? business.planSetAt ?? business.createdAt),
        signedUpAt: formatDate(business.createdAt) ?? 'Not recorded',
        planSetAt: formatDate(business.planSetAt) ?? formatDate(business.createdAt) ?? 'Not recorded',
        trialStartAt: formatDate(business.trialStartedAt),
        trialEndAt: formatDate(business.trialEndsAt),
        daysLeft: derived.daysLeft ?? null,
        nextDueAt: formatDate(subscription?.nextDueDate ?? business.nextBillingDate ?? business.nextPaymentDueAt ?? business.currentPeriodEndsAt) ?? 'Not scheduled',
        lastPaymentAt: formatDate(lastPaymentAt),
        monthlyValue,
        outstandingAmount,
        health: inferHealth(state),
        needsReview,
        reviewedAt: formatIsoDateTime(profile?.reviewedAt),
        reviewedBy: profile?.reviewedByStaff?.name ?? null,
        lastActivityAt: formatDateTime(profile?.lastActivityAt ?? business.salesInvoices[0]?.createdAt ?? business.createdAt),
        branches: business.stores.length,
        notes: latestNote ?? profile?.notes ?? business.billingNotes ?? 'No internal control-plane note recorded yet.',
        lastReminderAt: formatIsoDateTime(latestReminder?.sentAt ?? latestReminder?.createdAt),
        lastReminderStatus: latestReminder?.status ?? null,
        nextReminderAt: formatIsoDateTime(nextReminder?.nextAttemptAt ?? null),
        failedReminderCount,
      } satisfies ManagedBusiness;
    });
  } catch (error) {
    if (!isMissingTableError(error)) {
      console.error('[tishgroup-control] Falling back to mock portfolio data', error);
    }
    return managedBusinesses;
  }
}

export async function listManagedBusinesses() {
  return getLiveBusinesses();
}

function normalizeRosterPage(value?: number) {
  if (!value || !Number.isFinite(value) || value < 1) {
    return 1;
  }
  return Math.floor(value);
}

function normalizeRosterPageSize(value?: number) {
  if (!value || !Number.isFinite(value)) {
    return 50;
  }

  if (value <= 25) return 25;
  if (value <= 50) return 50;
  return 100;
}

function matchesBusinessSearch(business: ManagedBusiness, search: string) {
  if (!search) {
    return true;
  }

  const query = search.trim().toLowerCase();
  if (!query) {
    return true;
  }

  return [
    business.name,
    business.ownerName,
    business.ownerPhone,
    business.ownerEmail,
    business.assignedManager,
    business.reviewedBy ?? '',
  ].some((value) => value.toLowerCase().includes(query));
}

export async function listManagedBusinessesPage(options: ManagedBusinessRosterOptions = {}): Promise<ManagedBusinessRoster> {
  const businesses = await getLiveBusinesses();
  const filter = options.filter === 'unreviewed' ? 'unreviewed' : 'all';
  const search = options.search?.trim() ?? '';
  const pageSize = normalizeRosterPageSize(options.pageSize);
  const page = normalizeRosterPage(options.page);
  const unreviewedCount = businesses.filter((business) => business.needsReview).length;

  const filteredBusinesses = businesses.filter((business) => {
    if (filter === 'unreviewed' && !business.needsReview) {
      return false;
    }

    return matchesBusinessSearch(business, search);
  });

  const total = filteredBusinesses.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;
  const items = filteredBusinesses.slice(start, start + pageSize);

  return {
    items,
    filter,
    search,
    page: safePage,
    pageSize,
    total,
    totalPages,
    startIndex: total === 0 ? 0 : start + 1,
    endIndex: total === 0 ? 0 : start + items.length,
    totalBusinesses: businesses.length,
    unreviewedCount,
  };
}

export async function getManagedBusiness(businessId: string) {
  const businesses = await getLiveBusinesses();
  return businesses.find((business) => business.id === businessId) ?? null;
}

export async function getManagedBusinessDetail(businessId: string): Promise<ManagedBusinessDetail | null> {
  const [summary, rawBusiness] = await Promise.all([
    getManagedBusiness(businessId),
    prisma.business.findUnique({
      where: { id: businessId },
      select: {
        id: true,
        planStatus: true,
        trialEndsAt: true,
        addonOnlineStorefront: true,
        messageOutbox: {
          where: { eventType: { startsWith: 'SUBSCRIPTION_' } },
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: {
            id: true,
            eventType: true,
            status: true,
            recipient: true,
            attempts: true,
            lastError: true,
            nextAttemptAt: true,
            sentAt: true,
            createdAt: true,
          },
        },
      },
    }),
  ]);

  if (!summary || !rawBusiness) {
    return null;
  }

  try {
    const profile = await prisma.controlBusinessProfile.findUnique({
      where: { businessId },
      include: {
        subscription: true,
        reviewedByStaff: {
          select: { name: true },
        },
        payments: {
          orderBy: { paidAt: 'desc' },
          take: 6,
          include: {
            receivedByStaff: {
              select: { name: true },
            },
          },
        },
        notesEntries: {
          orderBy: { createdAt: 'desc' },
          take: 6,
          include: {
            createdByStaff: {
              select: { name: true },
            },
          },
        },
      },
    });

    if (!profile) {
      return {
        ...summary,
        commercialSource: 'TILLFLOW_DERIVED',
        subscriptionStatus: rawBusiness.planStatus,
        trialEndsAt: formatDate(rawBusiness.trialEndsAt),
        supportStatus: 'UNREVIEWED',
        assignedManagerId: null,
        reviewedAt: null,
        reviewedBy: null,
        recentPayments: [],
        recentNotes: [],
        recentReminders: rawBusiness.messageOutbox.map((row) => ({
          id: row.id,
          eventType: row.eventType,
          status: row.status,
          recipient: row.recipient,
          attempts: row.attempts,
          lastError: row.lastError,
          nextAttemptAt: formatIsoDateTime(row.nextAttemptAt),
          sentAt: formatIsoDateTime(row.sentAt),
          createdAt: formatIsoDateTime(row.createdAt) ?? 'Not recorded',
        })),
        addonOnlineStorefront: rawBusiness.addonOnlineStorefront,
      };
    }

    return {
      ...summary,
      commercialSource: profile.subscription ? 'CONTROL_PLANE' : 'TILLFLOW_DERIVED',
      subscriptionStatus: profile.subscription?.status ?? rawBusiness.planStatus,
      trialEndsAt: formatDate(rawBusiness.trialEndsAt),
      supportStatus: profile.supportStatus,
      assignedManagerId: profile.assignedManagerId,
      reviewedAt: formatIsoDateTime(profile.reviewedAt),
      reviewedBy: profile.reviewedByStaff?.name ?? null,
      recentPayments: profile.payments.map((payment) => ({
        id: payment.id,
        amountPence: payment.amountPence,
        paidAt: formatIsoDateTime(payment.paidAt) ?? 'Not recorded',
        method: payment.method,
        reference: payment.reference,
        note: payment.note,
        receivedBy: payment.receivedByStaff?.name ?? 'Unknown staff',
      })),
      recentNotes: profile.notesEntries.map((note) => ({
        id: note.id,
        category: note.category,
        note: note.note,
        createdAt: formatIsoDateTime(note.createdAt) ?? 'Not recorded',
        createdBy: note.createdByStaff?.name ?? 'Unknown staff',
      })),
      recentReminders: rawBusiness.messageOutbox.map((row) => ({
        id: row.id,
        eventType: row.eventType,
        status: row.status,
        recipient: row.recipient,
        attempts: row.attempts,
        lastError: row.lastError,
        nextAttemptAt: formatIsoDateTime(row.nextAttemptAt),
        sentAt: formatIsoDateTime(row.sentAt),
        createdAt: formatIsoDateTime(row.createdAt) ?? 'Not recorded',
      })),
      addonOnlineStorefront: rawBusiness.addonOnlineStorefront,
    };
  } catch (error) {
    if (!isMissingControlPlaneError(error)) {
      console.error('[tishgroup-control] Failed to load business detail from control-plane tables', error);
    }

    return {
      ...summary,
      commercialSource: 'TILLFLOW_DERIVED',
      subscriptionStatus: rawBusiness.planStatus,
      trialEndsAt: formatDate(rawBusiness.trialEndsAt),
      supportStatus: 'UNREVIEWED',
      assignedManagerId: null,
      reviewedAt: null,
      reviewedBy: null,
      recentPayments: [],
      recentNotes: [],
      recentReminders: rawBusiness.messageOutbox.map((row) => ({
        id: row.id,
        eventType: row.eventType,
        status: row.status,
        recipient: row.recipient,
        attempts: row.attempts,
        lastError: row.lastError,
        nextAttemptAt: formatIsoDateTime(row.nextAttemptAt),
        sentAt: formatIsoDateTime(row.sentAt),
        createdAt: formatIsoDateTime(row.createdAt) ?? 'Not recorded',
      })),
      addonOnlineStorefront: rawBusiness.addonOnlineStorefront,
    };
  }
}
