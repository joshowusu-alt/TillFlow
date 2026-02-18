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

    await audit({ businessId, userId: user.id, userName: user.name, userRole: user.role, action: 'PURCHASE_CREATE', entity: 'PurchaseInvoice', details: { lines: lines.length, supplierId } });

    revalidateTag('pos-products');

    redirect('/purchases');
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

    // Reverse inventory: subtract the quantities that were added
    for (const line of invoice.lines) {
      const balance = await prisma.inventoryBalance.findFirst({
        where: { storeId: invoice.storeId, productId: line.productId },
      });
      if (balance) {
        await prisma.inventoryBalance.update({
          where: { id: balance.id },
          data: { qtyOnHandBase: Math.max(0, balance.qtyOnHandBase - line.qtyBase) },
        });
      }
    }

    // Delete related records then the invoice
    await prisma.purchasePayment.deleteMany({ where: { purchaseInvoiceId: purchaseId } });
    await prisma.stockMovement.deleteMany({ where: { referenceType: 'PURCHASE_INVOICE', referenceId: purchaseId } });
    await prisma.purchaseInvoiceLine.deleteMany({ where: { purchaseInvoiceId: purchaseId } });
    await prisma.purchaseInvoice.delete({ where: { id: purchaseId } });

    // Delete accounting entries if any
    await prisma.journalLine.deleteMany({
      where: { journalEntry: { referenceType: 'PURCHASE_INVOICE', referenceId: purchaseId } },
    });
    await prisma.journalEntry.deleteMany({
      where: { referenceType: 'PURCHASE_INVOICE', referenceId: purchaseId },
    });

    await audit({
      businessId,
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      action: 'PURCHASE_CREATE',
      entity: 'PurchaseInvoice',
      entityId: purchaseId,
      details: { action: 'DELETE', lines: invoice.lines.length },
    });

    revalidateTag('pos-products');

    return ok();
  });
}
