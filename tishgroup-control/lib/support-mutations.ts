import { recordAuditInTransaction, type AuditStaff } from '@/lib/audit';
import { canMutateSupport, parseControlStaffRole, type ControlStaffRole } from '@/lib/control-auth';
import { syncBusinessSupportProfileCounts } from '@/lib/support-issues/sync';
import {
  SUPPORT_ISSUE_TYPES,
  SUPPORT_PRIORITIES,
  SUPPORT_SOURCES,
  SUPPORT_STATUSES,
} from '@/lib/support-issues/types';

export class SupportPermissionError extends Error {
  constructor() {
    super('Permission denied');
    this.name = 'SupportPermissionError';
  }
}

export class SupportValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SupportValidationError';
  }
}

export class SupportNotFoundError extends Error {
  constructor(message = 'Issue not found') {
    super(message);
    this.name = 'SupportNotFoundError';
  }
}

export type SupportMutationResult = {
  outcome: 'applied' | 'idempotent';
  issueId: string;
  businessId: string;
};

export type SupportTx = {
  controlSupportIssue: {
    create: (args: { data: Record<string, unknown> }) => Promise<{ id: string; businessId: string; title: string }>;
    update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<{ id: string; businessId: string; title: string }>;
    findUnique: (args: { where: { id: string }; select?: Record<string, boolean> }) => Promise<Record<string, unknown> | null>;
    findMany: (args: {
      where: { businessId: string; status: { in: string[] } };
      select: { priority: true; lastUpdatedAt: true; createdAt: true };
    }) => Promise<Array<{ priority: string; lastUpdatedAt: Date; createdAt: Date }>>;
  };
  controlSupportIssueNote: {
    create: (args: { data: { issueId: string; note: string; createdByStaffId: string } }) => Promise<{ id: string }>;
  };
  controlAuditLog: {
    create: (args: { data: Record<string, unknown> }) => Promise<{ id: string }>;
    findUnique: (args: { where: { idempotencyKey: string }; select?: Record<string, boolean> }) => Promise<{ id: string; metadata: string | null } | null>;
  };
  controlBusinessProfile: {
    findUnique: (args: { where: { businessId: string }; select: { supportStatus: true } }) => Promise<{ supportStatus: string } | null>;
    upsert: (args: {
      where: { businessId: string };
      create: { businessId: string; openSupportIssueCount: number; supportStatus: string };
      update: { openSupportIssueCount: number; supportStatus?: string };
    }) => Promise<unknown>;
  };
  business: {
    findUnique: (args: {
      where: { id: string; isDemo: boolean };
      select: {
        name: true;
        phone: true;
        users: { where: { role: 'OWNER' }; take: 1; select: { name: true; email: true } };
      };
    }) => Promise<{
      name: string;
      phone: string | null;
      users: Array<{ name: string | null; email: string | null }>;
    } | null>;
  };
};

export type SupportDb = {
  $transaction: <T>(fn: (tx: SupportTx) => Promise<T>) => Promise<T>;
};

export function assertCanMutateSupport(role: string | ControlStaffRole) {
  const parsed = parseControlStaffRole(role);
  if (!parsed || !canMutateSupport(role as ControlStaffRole)) {
    throw new SupportPermissionError();
  }
}

function isUniqueViolation(error: unknown) {
  return Boolean(error && typeof error === 'object' && 'code' in error && (error as { code: string }).code === 'P2002');
}

function parseIssueIdFromMetadata(metadata: string | null): string | null {
  if (!metadata) return null;
  try {
    const parsed = JSON.parse(metadata) as { issueId?: unknown };
    return typeof parsed.issueId === 'string' && parsed.issueId ? parsed.issueId : null;
  } catch {
    return null;
  }
}

async function findIdempotentResult(tx: SupportTx, idempotencyKey: string | null | undefined, fallbackBusinessId: string): Promise<SupportMutationResult | null> {
  if (!idempotencyKey) return null;
  const existing = await tx.controlAuditLog.findUnique({
    where: { idempotencyKey },
    select: { id: true, metadata: true },
  });
  if (!existing) return null;
  const issueId = parseIssueIdFromMetadata(existing.metadata);
  if (!issueId) {
    throw new SupportValidationError('Duplicate support request could not be reconciled.');
  }
  return { outcome: 'idempotent', issueId, businessId: fallbackBusinessId };
}

async function writeSupportAudit(
  tx: SupportTx,
  args: {
    staff: AuditStaff;
    action: 'SUPPORT_ISSUE_CREATED' | 'SUPPORT_ISSUE_UPDATED' | 'SUPPORT_NOTE_ADDED';
    businessId: string;
    summary: string;
    metadata: Record<string, unknown>;
    idempotencyKey?: string | null;
  },
) {
  await recordAuditInTransaction(tx, args);
}

export async function createSupportIssueMutation(
  db: SupportDb,
  args: {
    staff: AuditStaff;
    staffRole: ControlStaffRole;
    businessId: string;
    title: string;
    issueType: string;
    priority: string;
    description: string | null;
    source: string;
    relatedRoute: string | null;
    nextAction: string | null;
    assignedStaffId: string | null;
    assignedAgentName: string | null;
    ownerName: string | null;
    ownerPhone: string | null;
    idempotencyKey: string | null;
  },
): Promise<SupportMutationResult> {
  assertCanMutateSupport(args.staffRole);
  if (!args.businessId || !args.title) {
    throw new SupportValidationError('Business and title are required');
  }
  if (!SUPPORT_ISSUE_TYPES.includes(args.issueType as (typeof SUPPORT_ISSUE_TYPES)[number])) {
    throw new SupportValidationError('Invalid issue type');
  }
  if (!SUPPORT_PRIORITIES.includes(args.priority as (typeof SUPPORT_PRIORITIES)[number])) {
    throw new SupportValidationError('Invalid priority');
  }

  try {
    return await db.$transaction(async (tx) => {
      const replay = await findIdempotentResult(tx, args.idempotencyKey, args.businessId);
      if (replay) return replay;

      const business = await tx.business.findUnique({
        where: { id: args.businessId, isDemo: false },
        select: {
          name: true,
          phone: true,
          users: { where: { role: 'OWNER' }, take: 1, select: { name: true, email: true } },
        },
      });
      if (!business) {
        throw new SupportNotFoundError('Business not found');
      }

      const owner = business.users[0];
      const issue = await tx.controlSupportIssue.create({
        data: {
          businessId: args.businessId,
          createdByStaffId: args.staff.id,
          assignedStaffId: args.assignedStaffId,
          assignedAgentName: args.assignedAgentName,
          issueType: args.issueType,
          priority: args.priority,
          status: 'OPEN',
          title: args.title,
          description: args.description,
          source: SUPPORT_SOURCES.includes(args.source as (typeof SUPPORT_SOURCES)[number]) ? args.source : 'CONTROL',
          relatedRoute: args.relatedRoute,
          nextAction: args.nextAction,
          ownerName: args.ownerName || owner?.name || null,
          ownerPhone: args.ownerPhone || business.phone,
        },
      });

      await syncBusinessSupportProfileCounts(args.businessId, tx);
      await writeSupportAudit(tx, {
        staff: args.staff,
        action: 'SUPPORT_ISSUE_CREATED',
        businessId: args.businessId,
        summary: 'Support issue created',
        metadata: { issueId: issue.id, issueType: args.issueType, priority: args.priority },
        idempotencyKey: args.idempotencyKey,
      });

      return { outcome: 'applied' as const, issueId: issue.id, businessId: args.businessId };
    });
  } catch (error) {
    if (isUniqueViolation(error) && args.idempotencyKey) {
      const replay = await db.$transaction((tx) => findIdempotentResult(tx, args.idempotencyKey, args.businessId));
      if (replay) return replay;
    }
    throw error;
  }
}

export async function updateSupportIssueMutation(
  db: SupportDb,
  args: {
    staff: AuditStaff;
    staffRole: ControlStaffRole;
    issueId: string;
    status?: string;
    priority?: string;
    assignedStaffId?: string | null;
    assignedAgentName?: string | null;
    nextAction?: string | null;
    resolutionNotes?: string | null;
    idempotencyKey: string | null;
  },
): Promise<SupportMutationResult> {
  assertCanMutateSupport(args.staffRole);
  if (!args.issueId) {
    throw new SupportValidationError('Missing issue');
  }

  try {
    return await db.$transaction(async (tx) => {
      const existing = await tx.controlSupportIssue.findUnique({ where: { id: args.issueId } });
      if (!existing) {
        throw new SupportNotFoundError();
      }
      const businessId = String(existing.businessId);
      const replay = await findIdempotentResult(tx, args.idempotencyKey, businessId);
      if (replay) return replay;

      const data: Record<string, unknown> = {};
      const changes: Record<string, { from: unknown; to: unknown }> = {};

      if (args.status && SUPPORT_STATUSES.includes(args.status as (typeof SUPPORT_STATUSES)[number])) {
        data.status = args.status;
        changes.status = { from: existing.status, to: args.status };
        if (args.status === 'RESOLVED') data.resolvedAt = new Date();
        if (args.status === 'CLOSED') data.closedAt = new Date();
      }
      if (args.priority && SUPPORT_PRIORITIES.includes(args.priority as (typeof SUPPORT_PRIORITIES)[number])) {
        data.priority = args.priority;
        changes.priority = { from: existing.priority, to: args.priority };
      }
      if (args.assignedStaffId !== undefined) {
        data.assignedStaffId = args.assignedStaffId;
        changes.assignedStaffId = { from: existing.assignedStaffId, to: args.assignedStaffId };
      }
      if (args.assignedAgentName !== undefined) {
        data.assignedAgentName = args.assignedAgentName;
        changes.assignedAgentName = { from: existing.assignedAgentName, to: args.assignedAgentName };
      }
      if (args.nextAction !== undefined) {
        data.nextAction = args.nextAction;
      }
      if (args.resolutionNotes !== undefined) {
        data.resolutionNotes = args.resolutionNotes;
      }

      const issue = await tx.controlSupportIssue.update({ where: { id: args.issueId }, data });
      await syncBusinessSupportProfileCounts(businessId, tx);
      await writeSupportAudit(tx, {
        staff: args.staff,
        action: 'SUPPORT_ISSUE_UPDATED',
        businessId,
        summary: 'Support issue updated',
        metadata: { issueId: args.issueId, changes: { status: changes.status, priority: changes.priority, assignedStaffId: changes.assignedStaffId } },
        idempotencyKey: args.idempotencyKey,
      });

      return { outcome: 'applied' as const, issueId: issue.id, businessId };
    });
  } catch (error) {
    if (isUniqueViolation(error) && args.idempotencyKey) {
      const replay = await db.$transaction(async (tx) => {
        const existing = await tx.controlSupportIssue.findUnique({ where: { id: args.issueId } });
        return findIdempotentResult(tx, args.idempotencyKey, String(existing?.businessId ?? ''));
      });
      if (replay) return replay;
    }
    throw error;
  }
}

export async function addSupportIssueNoteMutation(
  db: SupportDb,
  args: {
    staff: AuditStaff;
    staffRole: ControlStaffRole;
    issueId: string;
    note: string;
    idempotencyKey: string | null;
  },
): Promise<SupportMutationResult> {
  assertCanMutateSupport(args.staffRole);
  if (!args.issueId || !args.note) {
    throw new SupportValidationError('Missing note');
  }

  try {
    return await db.$transaction(async (tx) => {
      const issue = await tx.controlSupportIssue.findUnique({
        where: { id: args.issueId },
        select: { businessId: true, title: true },
      });
      if (!issue) {
        throw new SupportNotFoundError();
      }
      const businessId = String(issue.businessId);
      const replay = await findIdempotentResult(tx, args.idempotencyKey, businessId);
      if (replay) return replay;

      await tx.controlSupportIssueNote.create({
        data: { issueId: args.issueId, note: args.note, createdByStaffId: args.staff.id },
      });
      await tx.controlSupportIssue.update({
        where: { id: args.issueId },
        data: { lastUpdatedAt: new Date() },
      });
      await writeSupportAudit(tx, {
        staff: args.staff,
        action: 'SUPPORT_NOTE_ADDED',
        businessId,
        summary: 'Internal support note added',
        metadata: { issueId: args.issueId, noteLength: args.note.length },
        idempotencyKey: args.idempotencyKey,
      });

      return { outcome: 'applied' as const, issueId: args.issueId, businessId };
    });
  } catch (error) {
    if (isUniqueViolation(error) && args.idempotencyKey) {
      const replay = await db.$transaction(async (tx) => {
        const issue = await tx.controlSupportIssue.findUnique({
          where: { id: args.issueId },
          select: { businessId: true },
        });
        return findIdempotentResult(tx, args.idempotencyKey, String(issue?.businessId ?? ''));
      });
      if (replay) return replay;
    }
    throw error;
  }
}
