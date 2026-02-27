'use server';

import { createSalesReturn, createPurchaseReturn } from '@/lib/services/returns';
import { redirect } from 'next/navigation';
import { revalidateTag } from 'next/cache';
import { formString, formInt } from '@/lib/form-helpers';
import { withBusinessContext, formAction, type ActionResult } from '@/lib/action-utils';
import { audit } from '@/lib/audit';
import { verifyManagerPin } from '@/lib/security/pin';
import { isVoidReturnReasonCode } from '@/lib/fraud/reason-codes';

export async function createSalesReturnAction(formData: FormData): Promise<void> {
  return formAction(async () => {
    const { user, businessId } = await withBusinessContext(['CASHIER', 'MANAGER', 'OWNER']);

    const salesInvoiceId = formString(formData, 'salesInvoiceId');
    const refundMethod = formString(formData, 'refundMethod') as 'CASH' | 'CARD' | 'TRANSFER' | 'MOBILE_MONEY' | '';
    const refundAmountPence = formInt(formData, 'refundAmountPence');
    const type = (formString(formData, 'type') || 'RETURN') as 'RETURN' | 'VOID';
    const reasonCode = formString(formData, 'reasonCode') || null;
    const reason = formString(formData, 'reason') || null;
    const managerPin = formString(formData, 'managerPin').trim();
    const auditAction = type === 'VOID' ? 'SALE_VOID' : 'SALE_RETURN';

    const deny = async (message: string, code: string) => {
      audit({
        businessId,
        userId: user.id,
        userName: user.name,
        userRole: user.role,
        action: auditAction,
        entity: 'SalesInvoice',
        entityId: salesInvoiceId || undefined,
        details: {
          blocked: true,
          code,
          type,
          reasonCode,
          reason,
          refundAmountPence,
        },
      });
      throw new Error(message);
    };

    if (!isVoidReturnReasonCode(reasonCode)) {
      await deny('Select a valid reason code for this return/void.', 'INVALID_REASON_CODE');
    }
    if (!managerPin) {
      await deny('Manager PIN is required for returns and voids.', 'MISSING_MANAGER_PIN');
    }

    const approvedBy = await verifyManagerPin({ businessId, pin: managerPin });
    if (!approvedBy) {
      await deny('Invalid manager PIN for return approval.', 'INVALID_MANAGER_PIN');
    }
    const approvedByUserId = approvedBy!.id;

    await createSalesReturn({
      businessId,
      salesInvoiceId,
      userId: user.id,
      reasonCode,
      refundMethod: refundMethod || null,
      refundAmountPence,
      reason,
      managerApprovedByUserId: approvedByUserId,
      managerApprovalMode: 'PIN',
      type
    });

    audit({
      businessId,
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      action: auditAction,
      entity: 'SalesInvoice',
      entityId: salesInvoiceId,
      details: {
        blocked: false,
        type,
        reasonCode,
        reason,
        refundAmountPence,
        managerApprovedByUserId: approvedByUserId,
      },
    });

    revalidateTag('pos-products');
    revalidateTag('reports');

    redirect('/sales');
  }, '/sales');
}

export async function createPurchaseReturnAction(formData: FormData): Promise<void> {
  return formAction(async () => {
    const { user, businessId } = await withBusinessContext(['MANAGER', 'OWNER']);

    const purchaseInvoiceId = formString(formData, 'purchaseInvoiceId');
    const refundMethod = formString(formData, 'refundMethod') as 'CASH' | 'CARD' | 'TRANSFER' | 'MOBILE_MONEY' | '';
    const refundAmountPence = formInt(formData, 'refundAmountPence');
    const type = (formString(formData, 'type') || 'RETURN') as 'RETURN' | 'VOID';
    const reason = formString(formData, 'reason') || null;

    await createPurchaseReturn({
      businessId,
      purchaseInvoiceId,
      userId: user.id,
      refundMethod: refundMethod || null,
      refundAmountPence,
      reason,
      type
    });

    audit({ businessId, userId: user.id, userName: user.name, userRole: user.role, action: 'PURCHASE_RETURN', entity: 'PurchaseInvoice', entityId: purchaseInvoiceId, details: { type, reason, refundAmountPence } });

    revalidateTag('pos-products');
    revalidateTag('reports');

    redirect('/purchases');
  }, '/purchases');
}
