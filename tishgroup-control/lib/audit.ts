import { prisma } from '@/lib/prisma';

const SECRET_METADATA_KEYS = [
  'password',
  'passwordHash',
  'hash',
  'secret',
  'token',
  'session',
  'accessKey',
  'twoFactorSecret',
  'note',
  'description',
  'body',
  'recipient',
  'email',
  'phone',
];

const BCRYPT_LIKE = /\$2[aby]\$\d{2}\$[A-Za-z0-9./]{22,}/;

export type AuditAction =
  | 'SUBSCRIPTION_UPDATED'
  | 'PAYMENT_RECORDED'
  | 'NOTE_ADDED'
  | 'SUBSCRIPTION_REMINDER_RESENT'
  | 'REVIEW_COMPLETED'
  | 'REVIEW_REOPENED'
  | 'STAFF_CREATED'
  | 'STAFF_ACTIVATED'
  | 'STAFF_DEACTIVATED'
  | 'STAFF_ROLE_CHANGED'
  | 'PASSWORD_SET'
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILURE'
  | 'BULK_REVIEW'
  | 'BULK_REMINDER_SENT'
  | 'SYSTEM_ERROR'
  | 'AGENT_ASSIGNED'
  | 'REFERRAL_UPDATED'
  | 'SETUP_CALL_COMPLETED'
  | 'FIRST_SALE_VERIFIED'
  | 'PAYMENT_FOLLOWUP_FLAGGED'
  | 'TRIAL_GRACE_EXTENDED'
  | 'SUPPORT_ISSUE_CREATED'
  | 'SUPPORT_ISSUE_UPDATED'
  | 'SUPPORT_NOTE_ADDED';

export type AuditStaff = {
  id: string;
  email: string;
  role: string;
};

export type RecordAuditArgs = {
  staff: AuditStaff;
  action: AuditAction;
  businessId?: string | null;
  summary: string;
  metadata?: Record<string, unknown> | null;
  idempotencyKey?: string | null;
};

function isSensitiveKey(key: string) {
  const lower = key.toLowerCase();
  return SECRET_METADATA_KEYS.some((secret) => lower.includes(secret.toLowerCase()));
}

function sanitizeValue(value: unknown): unknown {
  if (typeof value === 'string' && BCRYPT_LIKE.test(value)) {
    return '[redacted]';
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return sanitizeAuditMetadata(value as Record<string, unknown>);
  }
  return value;
}

export function sanitizeAuditMetadata(metadata?: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!metadata) return null;
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (isSensitiveKey(key)) {
      continue;
    }
    sanitized[key] = sanitizeValue(value);
  }
  return Object.keys(sanitized).length > 0 ? sanitized : null;
}

function auditData({ staff, action, businessId, summary, metadata, idempotencyKey }: RecordAuditArgs) {
  const safeMetadata = sanitizeAuditMetadata(metadata);
  return {
    staffId: staff.id,
    staffEmail: staff.email,
    staffRole: staff.role,
    action,
    businessId: businessId ?? null,
    summary,
    metadata: safeMetadata ? JSON.stringify(safeMetadata) : null,
    idempotencyKey: idempotencyKey ?? null,
  };
}

export async function recordAuditInTransaction(
  tx: { controlAuditLog: { create: (args: { data: ReturnType<typeof auditData> }) => unknown } },
  args: RecordAuditArgs,
): Promise<void> {
  await tx.controlAuditLog.create({ data: auditData(args) });
}

/**
 * Best-effort audit for non-critical visibility only.
 * Remaining best-effort writers (must not change commercial, staff, support-ticket,
 * entitlement, or merchant-visible billing state):
 * - Scale cockpit operational fields: AGENT_ASSIGNED, REFERRAL_UPDATED,
 *   SETUP_CALL_COMPLETED, FIRST_SALE_VERIFIED, PAYMENT_FOLLOWUP_FLAGGED, NOTE_ADDED
 * - captureError / LOGIN_FAILURE telemetry
 * Critical commercial, staff, support, payment, and SMS-queue mutations must use
 * recordAuditInTransaction inside the same Prisma transaction.
 */
export async function recordAudit(args: RecordAuditArgs): Promise<void> {
  try {
    await prisma.controlAuditLog.create({ data: auditData(args) });
  } catch (error) {
    console.error('[control-audit] Failed to write audit row', { action: args.action, businessId: args.businessId, error });
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
