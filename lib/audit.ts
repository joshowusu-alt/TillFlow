import { prisma } from '@/lib/prisma';
import { headers } from 'next/headers';

export type AuditAction =
  | 'LOGIN'
  | 'LOGIN_FAILED'
  | 'LOGOUT'
  | 'SALE_CREATE'
  | 'SALE_AMEND'
  | 'SALE_VOID'
  | 'SALE_RETURN'
  | 'PRODUCT_CREATE'
  | 'PRODUCT_UPDATE'
  | 'PRODUCT_DELETE'
  | 'INVENTORY_ADJUST'
  | 'PURCHASE_CREATE'
  | 'PURCHASE_RETURN'
  | 'EXPENSE_CREATE'
  | 'EXPENSE_UPDATE'
  | 'USER_CREATE'
  | 'USER_UPDATE'
  | 'USER_DEACTIVATE'
  | 'SETTINGS_UPDATE'
  | 'PASSWORD_CHANGE'
  | 'PRICE_CHANGE'
  | 'DISCOUNT_APPLIED'
  | 'SHIFT_OPEN'
  | 'SHIFT_CLOSE'
  | 'MOMO_COLLECTION_INITIATE'
  | 'MOMO_COLLECTION_STATUS'
  | 'MOMO_COLLECTION_REINITIATE'
  | 'MOMO_COLLECTION_RECONCILE'
  | 'DATA_RESET'
  | 'STOCKTAKE_CREATE'
  | 'STOCKTAKE_COMPLETE';

/**
 * Write an entry to the audit trail — fire-and-forget, never throws.
 */
export async function audit(opts: {
  businessId: string;
  userId?: string | null;
  userName: string | null;
  userRole: string;
  action: AuditAction;
  entity?: string;
  entityId?: string;
  details?: Record<string, unknown>;
}) {
  try {
    const hdrs = headers();
    const ip =
      hdrs.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      hdrs.get('x-real-ip') ??
      null;

    await prisma.auditLog.create({
      data: {
        businessId: opts.businessId,
        userId: opts.userId ?? null,
        userName: opts.userName ?? 'Unknown',
        userRole: opts.userRole,
        action: opts.action,
        entity: opts.entity,
        entityId: opts.entityId,
        details: opts.details ? JSON.stringify(opts.details) : null,
        ipAddress: ip,
      },
    });
  } catch {
    // Never let audit logging break the main action
    console.error('[audit] Failed to write audit log');
  }
}
