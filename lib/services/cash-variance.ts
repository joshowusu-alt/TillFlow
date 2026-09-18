import { prisma } from '@/lib/prisma';
import { isPrismaUniqueConstraintOn } from '@/lib/services/money-idempotency';
import { reserveNextDocumentNumber } from '@/lib/services/document-numbers';
import {
  CASH_VARIANCE_STATUSES,
  type CashVarianceStatus,
} from '@/lib/reliability/walkthrough-contracts';

export const CASH_VARIANCE_STATUS = {
  OPEN: 'OPEN',
  ASSIGNED: 'ASSIGNED',
  EXPLAINED: 'EXPLAINED',
  RESOLVED: 'RESOLVED',
  APPROVED: 'APPROVED',
} as const satisfies Record<CashVarianceStatus, CashVarianceStatus>;

export const VARIANCE_REVIEWER_ROLES = ['MANAGER', 'OWNER'] as const;

export type VarianceActor = {
  userId: string;
  userName: string | null;
  userRole: string;
};

type VarianceTx = {
  cashVarianceInvestigation: {
    create: (args: unknown) => Promise<{ id: string; variancePence: number; status: string; transactionNumber: string | null }>;
    findUnique: (args: unknown) => Promise<{
      id: string;
      businessId: string;
      shiftId: string;
      status: string;
      variancePence: number;
      cashierExplanation: string | null;
      evidencePath: string | null;
      managerResolution: string | null;
      assignedReviewerUserId: string | null;
      approvedByUserId: string | null;
      approvedAt: Date | null;
      transactionNumber: string | null;
    } | null>;
    findFirst: (args: unknown) => Promise<{
      id: string;
      businessId: string;
      shiftId: string;
      status: string;
      variancePence: number;
      cashierExplanation: string | null;
      evidencePath: string | null;
      managerResolution: string | null;
      assignedReviewerUserId: string | null;
      approvedByUserId: string | null;
      approvedAt: Date | null;
      transactionNumber: string | null;
    } | null>;
    update: (args: unknown) => Promise<{ id: string; status: string; variancePence: number }>;
  };
  auditLog: { create: (args: unknown) => Promise<unknown> };
  user: {
    findFirst: (args: unknown) => Promise<{ id: string; role: string; name: string; businessId: string } | null>;
  };
  shift: {
    findFirst: (args: unknown) => Promise<{ id: string; userId: string } | null>;
  };
  businessSequence: {
    update: (args: unknown) => Promise<{ nextVal: number }>;
    create: (args: unknown) => Promise<{ nextVal: number }>;
  };
};

function toJson(value: unknown): string | null {
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

function assertVarianceStatus(status: string): CashVarianceStatus {
  if ((CASH_VARIANCE_STATUSES as readonly string[]).includes(status)) {
    return status as CashVarianceStatus;
  }
  throw new Error(`Unknown cash variance status ${status}.`);
}

function isReviewerRole(role: string): boolean {
  return (VARIANCE_REVIEWER_ROLES as readonly string[]).includes(role);
}

async function writeVarianceAudit(
  tx: VarianceTx,
  input: {
    businessId: string;
    actor: VarianceActor;
    entityId: string;
    action: string;
    before: Record<string, unknown>;
    after: Record<string, unknown>;
    reason?: string | null;
  },
) {
  await tx.auditLog.create({
    data: {
      businessId: input.businessId,
      userId: input.actor.userId,
      userName: input.actor.userName ?? 'Unknown',
      userRole: input.actor.userRole,
      action: input.action,
      entity: 'CashVarianceInvestigation',
      entityId: input.entityId,
      beforeState: toJson(input.before),
      afterState: toJson(input.after),
      reason: input.reason ?? null,
      details: toJson({
        investigationId: input.entityId,
        action: input.action,
      }),
      actionType: 'CASH_VARIANCE',
      entityType: 'CASH_VARIANCE_INVESTIGATION',
    },
  });
}

/**
 * Create an OPEN investigation when a shift closes with a non-zero variance.
 * Snapshots variancePence only. Never mutates the shift counted or expected cash columns.
 */
export async function createCashVarianceInvestigationTx(
  tx: VarianceTx,
  input: {
    businessId: string;
    shiftId: string;
    variancePence: number;
    cashierExplanation?: string | null;
    actor: VarianceActor;
  },
): Promise<{ id: string; variancePence: number; status: string; transactionNumber: string | null } | null> {
  if (input.variancePence === 0) return null;

  const transactionNumber = await reserveNextDocumentNumber(tx, input.businessId, 'cash_variance');

  try {
    const created = await tx.cashVarianceInvestigation.create({
      data: {
        businessId: input.businessId,
        shiftId: input.shiftId,
        status: CASH_VARIANCE_STATUS.OPEN,
        variancePence: input.variancePence,
        cashierExplanation: input.cashierExplanation?.trim() || null,
        transactionNumber,
      },
      select: {
        id: true,
        variancePence: true,
        status: true,
        transactionNumber: true,
      },
    });

    await writeVarianceAudit(tx, {
      businessId: input.businessId,
      actor: input.actor,
      entityId: created.id,
      action: 'CASH_VARIANCE_OPEN',
      before: {},
      after: {
        status: created.status,
        variancePence: created.variancePence,
        transactionNumber: created.transactionNumber,
        shiftId: input.shiftId,
      },
    });

    return created;
  } catch (error) {
    if (!isPrismaUniqueConstraintOn(error, ['shiftId'])) {
      throw error;
    }
    const existing = await tx.cashVarianceInvestigation.findUnique({
      where: { shiftId: input.shiftId },
      select: {
        id: true,
        variancePence: true,
        status: true,
        transactionNumber: true,
      },
    });
    if (!existing) throw error;
    return existing;
  }
}

async function loadScopedInvestigation(
  tx: VarianceTx,
  businessId: string,
  investigationId: string,
) {
  const investigation = await tx.cashVarianceInvestigation.findFirst({
    where: { id: investigationId, businessId },
  });
  if (!investigation) {
    throw new Error('Cash variance investigation was not found for this business.');
  }
  return investigation;
}

export async function assignCashVarianceReviewer(
  input: {
    businessId: string;
    investigationId: string;
    reviewerUserId: string;
    actor: VarianceActor;
  },
) {
  if (!isReviewerRole(input.actor.userRole)) {
    throw new Error('Only a manager or owner can assign a cash variance reviewer.');
  }

  return prisma.$transaction(async (tx) => {
    const client = tx as unknown as VarianceTx;
    const investigation = await loadScopedInvestigation(client, input.businessId, input.investigationId);
    const status = assertVarianceStatus(investigation.status);
    if (status !== 'OPEN' && status !== 'ASSIGNED') {
      throw new Error('This investigation can no longer be assigned.');
    }

    const reviewer = await client.user.findFirst({
      where: {
        id: input.reviewerUserId,
        businessId: input.businessId,
        active: true,
        role: { in: [...VARIANCE_REVIEWER_ROLES] },
      },
      select: { id: true, role: true, name: true, businessId: true },
    });
    if (!reviewer) {
      throw new Error('Assigned reviewer must be an active manager or owner in this business.');
    }

    const updated = await client.cashVarianceInvestigation.update({
      where: { id: investigation.id },
      data: {
        assignedReviewerUserId: reviewer.id,
        status: CASH_VARIANCE_STATUS.ASSIGNED,
      },
      select: { id: true, status: true, variancePence: true },
    });

    await writeVarianceAudit(client, {
      businessId: input.businessId,
      actor: input.actor,
      entityId: investigation.id,
      action: 'CASH_VARIANCE_ASSIGN',
      before: { status: investigation.status, assignedReviewerUserId: investigation.assignedReviewerUserId },
      after: { status: updated.status, assignedReviewerUserId: reviewer.id },
    });

    return updated;
  });
}

export async function explainCashVariance(
  input: {
    businessId: string;
    investigationId: string;
    explanation: string;
    evidenceNote?: string | null;
    actor: VarianceActor;
  },
) {
  const explanation = input.explanation.trim();
  if (!explanation) {
    throw new Error('A cashier explanation is required.');
  }

  return prisma.$transaction(async (tx) => {
    const client = tx as unknown as VarianceTx;
    const investigation = await loadScopedInvestigation(client, input.businessId, input.investigationId);
    const status = assertVarianceStatus(investigation.status);
    if (status === 'RESOLVED' || status === 'APPROVED') {
      throw new Error('This investigation is already closed.');
    }

    const shift = await client.shift.findFirst({
      where: { id: investigation.shiftId, till: { store: { businessId: input.businessId } } },
      select: { id: true, userId: true },
    });
    if (!shift) {
      throw new Error('The related shift was not found for this business.');
    }

    const canExplain =
      input.actor.userRole === 'OWNER' ||
      input.actor.userRole === 'MANAGER' ||
      shift.userId === input.actor.userId ||
      investigation.assignedReviewerUserId === input.actor.userId;
    if (!canExplain) {
      throw new Error('You cannot add an explanation to this investigation.');
    }

    const updated = await client.cashVarianceInvestigation.update({
      where: { id: investigation.id },
      data: {
        cashierExplanation: explanation,
        // No file-upload path exists for variance evidence; store the note here.
        evidencePath: input.evidenceNote?.trim() || investigation.evidencePath,
        status: CASH_VARIANCE_STATUS.EXPLAINED,
      },
      select: { id: true, status: true, variancePence: true },
    });

    await writeVarianceAudit(client, {
      businessId: input.businessId,
      actor: input.actor,
      entityId: investigation.id,
      action: 'CASH_VARIANCE_EXPLAIN',
      before: { status: investigation.status },
      after: { status: updated.status },
      reason: explanation,
    });

    return updated;
  });
}

export async function resolveCashVariance(
  input: {
    businessId: string;
    investigationId: string;
    resolution: string;
    actor: VarianceActor;
  },
) {
  if (!isReviewerRole(input.actor.userRole)) {
    throw new Error('Only a manager or owner can resolve a cash variance.');
  }
  const resolution = input.resolution.trim();
  if (!resolution) {
    throw new Error('A manager resolution is required.');
  }

  return prisma.$transaction(async (tx) => {
    const client = tx as unknown as VarianceTx;
    const investigation = await loadScopedInvestigation(client, input.businessId, input.investigationId);
    const status = assertVarianceStatus(investigation.status);
    if (status !== 'EXPLAINED' && status !== 'ASSIGNED' && status !== 'OPEN') {
      throw new Error('This investigation cannot be resolved in its current status.');
    }

    const updated = await client.cashVarianceInvestigation.update({
      where: { id: investigation.id },
      data: {
        managerResolution: resolution,
        status: CASH_VARIANCE_STATUS.RESOLVED,
      },
      select: { id: true, status: true, variancePence: true },
    });

    await writeVarianceAudit(client, {
      businessId: input.businessId,
      actor: input.actor,
      entityId: investigation.id,
      action: 'CASH_VARIANCE_RESOLVE',
      before: { status: investigation.status },
      after: { status: updated.status },
      reason: resolution,
    });

    return updated;
  });
}

export async function approveCashVariance(
  input: {
    businessId: string;
    investigationId: string;
    actor: VarianceActor;
  },
) {
  if (input.actor.userRole !== 'OWNER') {
    throw new Error('Only the owner can approve a cash variance.');
  }

  return prisma.$transaction(async (tx) => {
    const client = tx as unknown as VarianceTx;
    const investigation = await loadScopedInvestigation(client, input.businessId, input.investigationId);
    const status = assertVarianceStatus(investigation.status);
    if (status !== 'RESOLVED') {
      throw new Error('Approve only after a manager has recorded a resolution.');
    }

    const updated = await client.cashVarianceInvestigation.update({
      where: { id: investigation.id },
      data: {
        approvedByUserId: input.actor.userId,
        approvedAt: new Date(),
        status: CASH_VARIANCE_STATUS.APPROVED,
      },
      select: { id: true, status: true, variancePence: true },
    });

    await writeVarianceAudit(client, {
      businessId: input.businessId,
      actor: input.actor,
      entityId: investigation.id,
      action: 'CASH_VARIANCE_APPROVE',
      before: { status: investigation.status },
      after: { status: updated.status, approvedByUserId: input.actor.userId },
    });

    return updated;
  });
}
