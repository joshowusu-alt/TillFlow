'use server';

import { createPurchase } from '@/lib/services/purchases';
import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';
import { revalidatePath, revalidateTag } from 'next/cache';
import { toPence, formString, formInt, formDate } from '@/lib/form-helpers';
import { PaymentStatusEnum } from '@/lib/validation/enums';
import { withBusinessContext, formAction, type ActionResult, safeAction, ok, err } from '@/lib/action-utils';
import { audit } from '@/lib/audit';
import type { PaymentStatus } from '@/lib/services/shared';
import { revalidateOwnerDashboardCache } from '@/lib/reports/cache-revalidation';

export async function createPurchaseAction(formData: FormData): Promise<void> {
  return formAction(async () => {
    const { user, businessId } = await withBusinessContext(['MANAGER', 'OWNER']);

    const storeId = formString(formData, 'storeId');
    const supplierId = formString(formData, 'supplierId') || null;
    const paymentStatus = (formString(formData, 'paymentStatus') || 'PAID') as PaymentStatus;
    const psValidation = PaymentStatusEnum.safeParse(paymentStatus);
    if (!psValidation.success) {
      redirect('/purchases?error=invalid-payment-status');
    }
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

    const invoice = await createPurchase({
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
      lines,
      userId: user.id
    });

    audit({ businessId, userId: user.id, userName: user.name, userRole: user.role, action: 'PURCHASE_CREATE', entity: 'PurchaseInvoice', details: { lines: lines.length, supplierId } }).catch((e) => console.error('[audit]', e));

    revalidateTag('pos-products');
    revalidateTag('reports');
    revalidateOwnerDashboardCache();
    revalidatePath('/onboarding');
    revalidatePath('/purchases');

    const summary = (invoice as any).supplierProductLinkSummary as
      | {
          linkedCount?: number;
          alreadyLinkedCount?: number;
          skippedDifferentSupplierCount?: number;
        }
      | undefined;
    const params = new URLSearchParams({ created: '1' });
    if (summary) {
      params.set('linked', String(summary.linkedCount ?? 0));
      params.set('already', String(summary.alreadyLinkedCount ?? 0));
      params.set('left', String(summary.skippedDifferentSupplierCount ?? 0));
    }

    redirect(`/purchases/${invoice.id}?${params.toString()}`);
  }, '/purchases');
}

export async function changePurchaseProductSupplierLinkAction(formData: FormData): Promise<void> {
  const purchaseInvoiceId = formString(formData, 'purchaseInvoiceId');
  const productId = formString(formData, 'productId');
  const fallbackPath = purchaseInvoiceId ? `/purchases/${purchaseInvoiceId}` : '/purchases';

  const result = await safeAction(async () => {
    const { user, businessId } = await withBusinessContext(['MANAGER', 'OWNER']);

    if (!purchaseInvoiceId || !productId) {
      return err('Choose a product to update.');
    }

    const invoice = await prisma.purchaseInvoice.findFirst({
      where: { id: purchaseInvoiceId, businessId },
      select: { id: true, supplierId: true, supplier: { select: { id: true, name: true } } },
    });
    if (!invoice) return err('Purchase not found.');
    if (!invoice.supplierId || !invoice.supplier) {
      return err('This purchase has no supplier.');
    }

    const line = await prisma.purchaseInvoiceLine.findFirst({
      where: { purchaseInvoiceId: invoice.id, productId },
      select: { id: true },
    });
    if (!line) {
      return err('This product is not on the purchase.');
    }

    const updateResult = await prisma.product.updateMany({
      where: { id: productId, businessId },
      data: { preferredSupplierId: invoice.supplierId },
    });
    if ((updateResult.count ?? 0) === 0) {
      return err('Product not found.');
    }

    audit({
      businessId,
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      action: 'PRODUCT_UPDATE',
      entity: 'Product',
      entityId: productId,
      details: { purchaseInvoiceId: invoice.id, supplierId: invoice.supplierId },
    }).catch((e) => console.error('[audit]', e));

    revalidateTag('pos-products');
    revalidateTag('reports');
    revalidatePath('/reports/sales-by-supplier');
    revalidatePath('/products');
    revalidatePath(`/products/${productId}`);
    revalidatePath('/purchases');
    revalidatePath(`/purchases/${invoice.id}`);
    revalidatePath(`/suppliers/${invoice.supplierId}`);

    return ok({ invoiceId: invoice.id });
  });

  if (!result.success) {
    redirect(`${fallbackPath}?error=${encodeURIComponent(result.error)}`);
  }

  redirect(`/purchases/${result.data.invoiceId}?supplierLinkChanged=1`);
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
    }).catch((e) => console.error('[audit]', e));

    revalidateTag('pos-products');
    revalidateTag('reports');
    revalidateOwnerDashboardCache();

    return ok();
  });
}

/**
 * Retroactively set or clear the due date on a purchase invoice.
 */
export async function setPurchaseDueDateAction(
  invoiceId: string,
  dueDateStr: string | null
): Promise<ActionResult> {
  return safeAction(async () => {
    const { user, businessId } = await withBusinessContext(['MANAGER', 'OWNER']);

    const invoice = await prisma.purchaseInvoice.findFirst({
      where: { id: invoiceId, businessId },
      select: { id: true, paymentStatus: true, supplierId: true },
    });

    if (!invoice) return err('Invoice not found.');
    if (['RETURNED', 'VOID'].includes(invoice.paymentStatus)) {
      return err('Cannot change the due date on a closed invoice.');
    }

    let dueDate: Date | null = null;
    if (dueDateStr) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDateStr)) {
        return err('Enter a valid due date.');
      }

      dueDate = new Date(`${dueDateStr}T00:00:00Z`);
      if (Number.isNaN(dueDate.getTime()) || dueDate.toISOString().slice(0, 10) !== dueDateStr) {
        return err('Enter a valid due date.');
      }
    }

    await prisma.purchaseInvoice.update({
      where: { id: invoiceId },
      data: { dueDate },
    });

    audit({
      businessId,
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      action: 'PURCHASE_SET_DUE_DATE',
      entity: 'PurchaseInvoice',
      entityId: invoiceId,
      details: { dueDate: dueDate?.toISOString() ?? null },
    }).catch((e) => console.error('[audit]', e));

    revalidateTag('reports');
    revalidateOwnerDashboardCache();
    revalidatePath('/payments/supplier-aging');
    revalidatePath('/payments/supplier-payments');
    revalidatePath('/purchases');
    revalidatePath(`/purchases/${invoiceId}`);
    if (invoice.supplierId) {
      revalidatePath(`/suppliers/${invoice.supplierId}`);
    }

    return ok();
  });
}
