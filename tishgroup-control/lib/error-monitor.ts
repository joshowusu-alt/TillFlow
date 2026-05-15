import { prisma } from '@/lib/prisma';

type CaptureErrorArgs = {
  context: string;
  error: unknown;
  staffId?: string | null;
  staffEmail?: string;
  staffRole?: string;
  businessId?: string | null;
  metadata?: Record<string, unknown> | null;
};

/**
 * Fire-and-forget error capture. Writes to ControlAuditLog so admins can
 * view failures without needing Sentry or an external service. Never throws —
 * the caller's original redirect/response is preserved even if the write fails.
 */
export async function captureError({
  context,
  error,
  staffId,
  staffEmail = 'system',
  staffRole = 'SYSTEM',
  businessId,
  metadata,
}: CaptureErrorArgs): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack?.slice(0, 1000) : undefined;
  const action = context.startsWith('login:') ? 'LOGIN_FAILURE' : 'SYSTEM_ERROR';

  try {
    await prisma.controlAuditLog.create({
      data: {
        staffId: staffId ?? null,
        staffEmail,
        staffRole,
        action,
        businessId: businessId ?? null,
        summary: `[${context}] ${message.slice(0, 200)}`,
        metadata: JSON.stringify({ context, message, stack, ...metadata }),
      },
    });
  } catch (writeError) {
    console.error('[error-monitor] Failed to persist error record', {
      context,
      originalError: message,
      writeError,
    });
  }
}

export type ErrorLogEntry = {
  id: string;
  staffEmail: string;
  context: string;
  message: string;
  businessId: string | null;
  createdAt: Date;
  metadata: Record<string, unknown> | null;
};

export async function listRecentErrors(limit = 50): Promise<ErrorLogEntry[]> {
  try {
    const rows = await prisma.controlAuditLog.findMany({
      where: { action: { in: ['SYSTEM_ERROR', 'LOGIN_FAILURE'] } },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return rows.map((row) => {
      const meta = safeParse(row.metadata);
      return {
        id: row.id,
        staffEmail: row.staffEmail,
        context: (meta?.context as string) ?? row.action,
        message: (meta?.message as string) ?? row.summary,
        businessId: row.businessId,
        createdAt: row.createdAt,
        metadata: meta,
      };
    });
  } catch {
    return [];
  }
}

function safeParse(value: string | null): Record<string, unknown> | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === 'object' && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
}
