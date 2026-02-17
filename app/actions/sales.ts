'use server';

import { createSale, amendSale } from '@/lib/services/sales';
import { redirect } from 'next/navigation';
import { toInt, toPence } from '@/lib/form-helpers';
import { formString, formInt, formDate } from '@/lib/form-helpers';
import { withBusinessContext, formAction, safeAction, type ActionResult } from '@/lib/action-utils';
import { audit } from '@/lib/audit';
import type { PaymentStatus } from '@/lib/services/shared';
import type { DiscountType } from '@/lib/services/sales';

const parseDiscountValue = (type: string | undefined, raw: any) => {
  if (!type || type === 'NONE') return 0;
  if (type === 'PERCENT') {
    const parsed = Number(raw);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  if (type === 'AMOUNT') {
    return toPence(raw ?? '');
  }
  return 0;
};

export async function createSaleAction(formData: FormData): Promise<void> {
  return formAction(async () => {
    const { user, businessId } = await withBusinessContext();

    const storeId = formString(formData, 'storeId');
    const tillId = formString(formData, 'tillId');
    const productId = formString(formData, 'productId');
    const unitId = formString(formData, 'unitId');
    const qtyInUnit = formInt(formData, 'qtyInUnit');
    const paymentStatus = (formString(formData, 'paymentStatus') || 'PAID') as PaymentStatus;
    const customerId = formString(formData, 'customerId') || null;
    const dueDate = formDate(formData, 'dueDate');
    const orderDiscountType = (formString(formData, 'orderDiscountType') || 'NONE') as DiscountType;
    const orderDiscountValue = parseDiscountValue(
      orderDiscountType,
      formData.get('orderDiscountValue')
    );

    let lines: {
      productId: string;
      unitId: string;
      qtyInUnit: number;
      discountType?: DiscountType;
      discountValue?: number;
    }[] = [];
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
              discountType: (item.discountType || 'NONE') as DiscountType,
              discountValue: parseDiscountValue(item.discountType, item.discountValue)
            }))
            .filter((item) => item.productId && item.unitId && item.qtyInUnit > 0);
        }
      } catch {
        lines = [];
      }
    }

    if (lines.length === 0 && productId && unitId && qtyInUnit > 0) {
      lines = [{ productId, unitId, qtyInUnit }];
    }

    if (paymentStatus !== 'PAID' && !customerId) {
      redirect('/pos?error=customer-required');
    }

    try {
      const invoice = await createSale({
        businessId,
        storeId,
        tillId,
        cashierUserId: user.id,
        customerId,
        paymentStatus,
        dueDate,
        orderDiscountType,
        orderDiscountValue,
        payments: [
          { method: 'CASH', amountPence: formInt(formData, 'cashPaid') },
          { method: 'CARD', amountPence: formInt(formData, 'cardPaid') },
          { method: 'TRANSFER', amountPence: formInt(formData, 'transferPaid') }
        ],
        lines
      });

      await audit({ businessId, userId: user.id, userName: user.name, userRole: user.role, action: 'SALE_CREATE', entity: 'SalesInvoice', entityId: invoice.id, details: { lines: lines.length, total: invoice.totalPence } });

      redirect(`/receipts/${invoice.id}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (message.includes('Insufficient stock')) {
        redirect('/pos?error=insufficient-stock');
      }
      if (message.includes('Customer is required')) {
        redirect('/pos?error=customer-required');
      }
      throw error;
    }
  });
}

/**
 * Complete a sale and return the receipt ID — stays on POS (no redirect).
 * Called from PosClient via JavaScript for a seamless checkout flow.
 */
export async function completeSaleAction(data: {
  storeId: string;
  tillId: string;
  cart: string;
  paymentStatus: string;
  customerId: string;
  dueDate: string;
  orderDiscountType: string;
  orderDiscountValue: string;
  cashPaid: number;
  cardPaid: number;
  transferPaid: number;
  momoPaid?: number;
  momoRef?: string;
  momoCollectionId?: string;
  momoPayerMsisdn?: string;
  momoNetwork?: string;
}): Promise<ActionResult<{ receiptId: string; totalPence: number }>> {
  return safeAction(async () => {
    const { user, businessId } = await withBusinessContext();

    const paymentStatus = (data.paymentStatus || 'PAID') as PaymentStatus;
    const customerId = data.customerId || null;
    const dueDate = data.dueDate ? new Date(data.dueDate) : null;
    const orderDiscountType = (data.orderDiscountType || 'NONE') as DiscountType;
    const orderDiscountValue = parseDiscountValue(orderDiscountType, data.orderDiscountValue);
    const momoPaid = Math.max(0, data.momoPaid ?? 0);

    if (momoPaid > 0 && !data.momoCollectionId) {
      return { success: false, error: 'Confirm MoMo payment before completing sale.' };
    }

    let lines: {
      productId: string;
      unitId: string;
      qtyInUnit: number;
      discountType?: DiscountType;
      discountValue?: number;
    }[] = [];

    if (data.cart) {
      try {
        const parsed = JSON.parse(data.cart);
        if (Array.isArray(parsed)) {
          lines = parsed
            .map((item: any) => ({
              productId: String(item.productId || ''),
              unitId: String(item.unitId || ''),
              qtyInUnit: Number(item.qtyInUnit || 0),
              discountType: (item.discountType || 'NONE') as DiscountType,
              discountValue: parseDiscountValue(item.discountType, item.discountValue),
            }))
            .filter((item: any) => item.productId && item.unitId && item.qtyInUnit > 0);
        }
      } catch {
        lines = [];
      }
    }

    if (paymentStatus !== 'PAID' && !customerId) {
      return { success: false, error: 'Select a customer for credit or part-paid sales.' };
    }

    const invoice = await createSale({
      businessId,
      storeId: data.storeId,
      tillId: data.tillId,
      cashierUserId: user.id,
      customerId,
      paymentStatus,
      dueDate,
      orderDiscountType,
      orderDiscountValue,
      momoCollectionId: data.momoCollectionId || null,
      payments: [
        { method: 'CASH', amountPence: data.cashPaid },
        { method: 'CARD', amountPence: data.cardPaid },
        { method: 'TRANSFER', amountPence: data.transferPaid },
        {
          method: 'MOBILE_MONEY',
          amountPence: momoPaid,
          reference: data.momoRef ?? null,
          payerMsisdn: data.momoPayerMsisdn ?? null,
          network: data.momoNetwork ?? null,
        },
      ],
      lines,
    });

    await audit({
      businessId,
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      action: 'SALE_CREATE',
      entity: 'SalesInvoice',
      entityId: invoice.id,
      details: { lines: lines.length, total: invoice.totalPence },
    });

    return { success: true, data: { receiptId: invoice.id, totalPence: invoice.totalPence } };
  });
}

export async function amendSaleAction(formData: FormData): Promise<void> {
  return formAction(async () => {
    const { user, businessId } = await withBusinessContext(['MANAGER', 'OWNER']);

    const salesInvoiceId = formString(formData, 'salesInvoiceId');
    const reason = formString(formData, 'reason') || 'Sale amended';
    const refundMethod = (formString(formData, 'refundMethod') || 'CASH') as 'CASH' | 'CARD' | 'TRANSFER' | 'MOBILE_MONEY';

    let keepLineIds: string[] = [];
    const keepRaw = formData.get('keepLineIds');
    if (keepRaw) {
      try {
        const parsed = JSON.parse(String(keepRaw));
        if (Array.isArray(parsed)) {
          keepLineIds = parsed.map(String).filter(Boolean);
        }
      } catch {
        keepLineIds = [];
      }
    }

    const result = await amendSale({
      salesInvoiceId,
      businessId,
      userId: user.id,
      reason,
      keepLineIds,
      refundMethod,
    });

    await audit({
      businessId,
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      action: 'SALE_AMEND',
      entity: 'SalesInvoice',
      entityId: salesInvoiceId,
      details: {
        reason,
        before: result.before,
        after: result.after,
        refundAmount: result.refundAmount,
        refundMethod: result.refundMethod,
      },
    });

    redirect('/sales?amended=true');
  }, '/sales');
}
