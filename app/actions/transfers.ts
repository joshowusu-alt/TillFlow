'use server';

import { redirect } from 'next/navigation';
import { revalidateTag } from 'next/cache';
import { formAction, withBusinessContext, err, ok, safeAction, type ActionResult } from '@/lib/action-utils';
import { formInt, formOptionalString, formString } from '@/lib/form-helpers';
import { audit } from '@/lib/audit';
import { verifyManagerPin } from '@/lib/security/pin';
import { approveAndCompleteStockTransfer, requestStockTransfer } from '@/lib/services/stock-transfers';

export async function requestStockTransferAction(formData: FormData): Promise<void> {
  return formAction(async () => {
    const { user, businessId } = await withBusinessContext(['MANAGER', 'OWNER']);

    const fromStoreId = formString(formData, 'fromStoreId');
    const toStoreId = formString(formData, 'toStoreId');
    const productId = formString(formData, 'productId');
    const qtyBase = formInt(formData, 'qtyBase');
    const reason = formOptionalString(formData, 'reason');

    const transfer = await requestStockTransfer({
      businessId,
      requestedByUserId: user.id,
      fromStoreId,
      toStoreId,
      reason,
      lines: [{ productId, qtyBase }],
    });

    await audit({
      businessId,
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      action: 'STOCK_TRANSFER_REQUEST',
      entity: 'StockTransfer',
      entityId: transfer.id,
      details: {
        fromStoreId,
        toStoreId,
        reason,
        lines: transfer.lines.map((line) => ({ productId: line.productId, qtyBase: line.qtyBase })),
      },
    });

    redirect('/transfers');
  }, '/transfers');
}

export async function approveStockTransferAction(formData: FormData): Promise<void> {
  return formAction(async () => {
    const result = await approveStockTransferActionSafe({
      transferId: formString(formData, 'transferId'),
      managerPin: formString(formData, 'managerPin'),
    });
    if (!result.success) {
      return err(result.error);
    }
    redirect('/transfers');
  }, '/transfers');
}

export async function approveStockTransferActionSafe(input: {
  transferId: string;
  managerPin: string;
}): Promise<ActionResult<{ transferId: string }>> {
  return safeAction(async () => {
    const { user, businessId } = await withBusinessContext(['MANAGER', 'OWNER']);
    const pin = input.managerPin.trim();
    if (!pin) {
      return err('Manager PIN is required to approve transfer.');
    }

    const approvedBy = await verifyManagerPin({ businessId, pin });
    if (!approvedBy) {
      return err('Invalid manager PIN for transfer approval.');
    }

    const transfer = await approveAndCompleteStockTransfer({
      businessId,
      transferId: input.transferId,
      approvedByUserId: approvedBy.id,
    });

    await audit({
      businessId,
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      action: 'STOCK_TRANSFER_APPROVE',
      entity: 'StockTransfer',
      entityId: transfer.id,
      details: {
        approvedByUserId: approvedBy.id,
        fromStoreId: transfer.fromStoreId,
        toStoreId: transfer.toStoreId,
        lines: transfer.lines.map((line) => ({ productId: line.productId, qtyBase: line.qtyBase })),
      },
    });

    revalidateTag('pos-products');

    return ok({ transferId: transfer.id });
  });
}
