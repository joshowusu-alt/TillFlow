import { prisma } from '@/lib/prisma';

export type AuditAction =
  | 'SUBSCRIPTION_UPDATED'
  | 'PAYMENT_RECORDED'
  | 'NOTE_ADDED'
  | 'REVIEW_COMPLETED'
  | 'REVIEW_REOPENED'
  | 'STAFF_CREATED'
  | 'STAFF_ACTIVATED'
  | 'STAFF_DEACTIVATED'
  | 'BULK_REVIEW';

type AuditStaff = {
  id: string;
  email: string;
  role: string;
};

type RecordAuditArgs = {
  staff: AuditStaff;
  action: AuditAction;
  businessId?: string | null;
  summary: string;
  metadata?: Record<string, unknown> | null;
};

/**
 * Append-only audit write. Never blocks the parent action: a failure here
 * is logged to console but never propagates, because losing visibility on
 * one event is preferable to rolling back a paid invoice or completed
 * review. The schema indexes (businessId+createdAt, staffId+createdAt,
 * action+createdAt) make every common query path cheap.
 */
export async function recordAudit({ staff, action, businessId, summary, metadata }: RecordAuditArgs): Promise<void> {
  try {
    await prisma.controlAuditLog.create({
      data: {
        staffId: staff.id,
        staffEmail: staff.email,
        staffRole: staff.role,
        action,
        businessId: businessId ?? null,
        summary,
        metadata: metadata ? JSON.stringify(metadata) : null,
      },
    });
  } catch (error) {
    console.error('[control-audit] Failed to write audit row', { action, businessId, error });
  }
}

export type AuditLogEntry = {
  id: string;
  staffEmail: string;
  staffRole: string;
  action: AuditAction;
  summary: string;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
};

export async function listBusinessAuditTrail(businessId: string, limit = 50): Promise<AuditLogEntry[]> {
  try {
    const rows = await prisma.controlAuditLog.findMany({
      where: { businessId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return rows.map((row) => ({
      id: row.id,
      staffEmail: row.staffEmail,
      staffRole: row.staffRole,
      action: row.action as AuditAction,
      summary: row.summary,
      metadata: row.metadata ? safeParse(row.metadata) : null,
      createdAt: row.createdAt,
    }));
  } catch (error) {
    console.error('[control-audit] Failed to read audit trail', { businessId, error });
    return [];
  }
}

function safeParse(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === 'object' && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
}
