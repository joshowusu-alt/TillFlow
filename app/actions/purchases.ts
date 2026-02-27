'use server';

import { createPurchase } from '@/lib/services/purchases';
import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';
import { revalidateTag } from 'next/cache';
import { toInt, toPence, formString, formInt, formDate } from '@/lib/form-helpers';
import { withBusinessContext, formAction, type ActionResult, safeAction, ok, err } from '@/lib/action-utils';
import { audit } from '@/lib/audit';
import type { PaymentStatus } from '@/lib/services/shared';

export async function createPurchaseAction(formData: FormData): Promise<void> {
  return formAction(async () => {
    const { user, businessId } = await withBusinessContext();

    const storeId = formString(formData, 'storeId');
    const supplierId = formString(formData, 'supplierId') || null;
    const paymentStatus = (formString(formData, 'paymentStatus') || 'PAID') as PaymentStatus;
    const dueDate = formDate(formData, 'dueDate');

    let lines: { productId: string; unitId: string; qtyInUnit: number; unitCostPence?: number | null }[] = [];
    const cartRaw = formData.get('cart');
    if (cartRaw) {
      try {
        const parsed = JSON.parse(String(cartRaw));
        if (Array.isArray(parsed)) {
          lines = parsed
            .map((item) => ({
              productId: String(item.productId || ''),
              unitId: String(item.unitId || ''),
              qtyInUnit: Number(item.qtyInUnit || 0),
              unitCostPence: toPence(item.unitCostInput ?? item.unitCostPence ?? '')
            }))
            .filter((item) => item.productId && item.unitId && item.qtyInUnit > 0);
        }
      } catch {
        lines = [];
      }
    }

    await createPurchase({
      businessId,
      storeId,
      supplierId,
      paymentStatus,
      dueDate,
      payments: [
        { method: 'CASH', amountPence: formInt(formData, 'cashPaid') },
        { method: 'CARD', amountPence: formInt(formData, 'cardPaid') },
        { method: 'TRANSFER', amountPence: formInt(formData, 'transferPaid') }
      ],
      lines
    });

    audit({ businessId, userId: user.id, userName: user.name, userRole: user.role, action: 'PURCHASE_CREATE', entity: 'PurchaseInvoice', details: { lines: lines.length, supplierId } });

    revalidateTag('pos-products');
    revalidateTag('reports');

    redirect(`/purchases?created=${Date.now()}`);
  }, '/purchases');
}

/**
 * Delete a purchase invoice and reverse the inventory movements.
 */
export async function deletePurchaseAction(purchaseId: string): Promise<ActionResult> {
  return safeAction(async () => {
    const { user, businessId } = await withBusinessContext(['MANAGER', 'OWNER']);

    const invoice = await prisma.purchaseInvoice.findFirst({
      where: { id: purchaseId, businessId },
      include: { lines: true, payments: true, purchaseReturn: true },
    });

    if (!invoice) {
      return err('Purchase not found.');
    }

    if (invoice.purchaseReturn) {
      return err('Cannot delete a purchase that has been returned.');
    }

    // Atomically reverse inventory and delete all related records
    await prisma.$transaction(async (tx) => {
      // Reverse inventory: subtract the quantities that were added
      for (const line of invoice.lines) {
        const balance = await tx.inventoryBalance.findFirst({
          where: { storeId: invoice.storeId, productId: line.productId },
        });
        if (balance) {
          await tx.inventoryBalance.update({
            where: { id: balance.id },
            data: { qtyOnHandBase: Math.max(0, balance.qtyOnHandBase - line.qtyBase) },
          });
        }
      }

      // Delete related records then the invoice
      await tx.purchasePayment.deleteMany({ where: { purchaseInvoiceId: purchaseId } });
      await tx.stockMovement.deleteMany({ where: { referenceType: 'PURCHASE_INVOICE', referenceId: purchaseId } });
      await tx.purchaseInvoiceLine.deleteMany({ where: { purchaseInvoiceId: purchaseId } });
      await tx.purchaseInvoice.delete({ where: { id: purchaseId } });

      // Delete accounting entries if any
      await tx.journalLine.deleteMany({
        where: { journalEntry: { referenceType: 'PURCHASE_INVOICE', referenceId: purchaseId } },
      });
      await tx.journalEntry.deleteMany({
        where: { referenceType: 'PURCHASE_INVOICE', referenceId: purchaseId },
      });
    });

    audit({
      businessId,
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      action: 'PURCHASE_DELETE',
      entity: 'PurchaseInvoice',
      entityId: purchaseId,
      details: { action: 'DELETE', lines: invoice.lines.length },
    });

    revalidateTag('pos-products');
    revalidateTag('reports');

    return ok();
  });
}
