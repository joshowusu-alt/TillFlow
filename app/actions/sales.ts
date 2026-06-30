'use server';

import { createSale, amendSale } from '@/lib/services/sales';
import { redirect } from 'next/navigation';
import { revalidateTag, revalidatePath } from 'next/cache';
import { toInt, formString, formInt, formDate } from '@/lib/form-helpers';
import { PaymentStatusEnum } from '@/lib/validation/enums';
import { parseDiscountValue } from '@/lib/format';
import { withBusinessContext, formAction, safeAction, UserError, type ActionResult } from '@/lib/action-utils';
import { audit } from '@/lib/audit';
import { verifyManagerPin } from '@/lib/security/pin';
import { isDiscountReasonCode } from '@/lib/fraud/reason-codes';
import { resolveEffectiveSellingPricePence, type PaymentStatus } from '@/lib/services/shared';
import type { DiscountType } from '@/lib/services/sales';
import { checkAndSendLowStockAlert } from '@/app/actions/stock-alerts';
import { prisma } from '@/lib/prisma';
import { revalidateOwnerDashboardCache } from '@/lib/reports/cache-revalidation';
import { measureServerOperation } from '@/lib/observability';

const CHECKOUT_ACTION_STAGE_THRESHOLDS_MS = {
  auditLog: 200,
  revalidate: 300,
} as const;

function checkoutActionTimingMetadata({
  businessId,
  storeId,
  lines,
  payments,
  customerId,
  paymentStatus,
  hasDiscount,
}: {
  businessId: string;
  storeId: string;
  lines: Array<{ productId: string; discountType?: DiscountType; discountValue?: number }>;
  payments: Array<{ method: string; amountPence: number }>;
  customerId: string | null;
  paymentStatus: PaymentStatus;
  hasDiscount: boolean;
}) {
  const positivePaymentMethods = new Set(
    payments.filter((payment) => payment.amountPence > 0).map((payment) => payment.method),
  );

  return {
    businessId,
    storeId,
    action: 'completeSaleAction',
    cartLineCount: lines.length,
    distinctProductCount: new Set(lines.map((line) => line.productId)).size,
    paymentMethodCount: positivePaymentMethods.size,
    hasCredit: paymentStatus !== 'PAID',
    hasCustomerId: Boolean(customerId),
    hasCashPayment: positivePaymentMethods.has('CASH'),
    hasCardPayment: positivePaymentMethods.has('CARD'),
    hasBankTransferPayment: positivePaymentMethods.has('TRANSFER'),
    hasMobileMoneyPayment: positivePaymentMethods.has('MOBILE_MONEY'),
    hasDiscount:
      hasDiscount ||
      lines.some((line) => (line.discountType && line.discountType !== 'NONE') || (line.discountValue ?? 0) > 0),
    cacheState: 'write-through',
  };
}

export async function createSaleAction(formData: FormData): Promise<void> {
  return formAction(async () => {
    const { user, businessId } = await withBusinessContext();

    const storeId = formString(formData, 'storeId');
    const tillId = formString(formData, 'tillId');
    const productId = formString(formData, 'productId');
    const unitId = formString(formData, 'unitId');
    const qtyInUnit = formInt(formData, 'qtyInUnit');
    const paymentStatus = (formString(formData, 'paymentStatus') || 'PAID') as PaymentStatus;
    const psValidation = PaymentStatusEnum.safeParse(paymentStatus);
    if (!psValidation.success) {
      redirect('/pos?error=invalid-payment-status');
    }
    const customerId = formString(formData, 'customerId') || null;
    const dueDate = formDate(formData, 'dueDate');
    const orderDiscountType = (formString(formData, 'orderDiscountType') || 'NONE') as DiscountType;
    const orderDiscountValue = parseDiscountValue(
      orderDiscountType,
      formData.get('orderDiscountValue')
    );
    const discountManagerPin = formString(formData, 'discountManagerPin') || '';
    const discountReasonCode = formString(formData, 'discountReasonCode') || null;
    const discountReason = formString(formData, 'discountReason') || null;
    if (discountReasonCode && !isDiscountReasonCode(discountReasonCode)) {
      redirect('/pos?error=invalid-discount-reason');
    }
    let discountApprovedByUserId: string | null = null;

    if (discountManagerPin) {
      const approvedBy = await verifyManagerPin({ businessId, pin: discountManagerPin });
      if (!approvedBy) {
        redirect('/pos?error=invalid-discount-pin');
      }
      discountApprovedByUserId = approvedBy?.id ?? null;
    }

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
      const checkoutTimingMetadata = checkoutActionTimingMetadata({
        businessId,
        storeId,
        lines,
        payments: [
          { method: 'CASH', amountPence: formInt(formData, 'cashPaid') },
          { method: 'CARD', amountPence: formInt(formData, 'cardPaid') },
          { method: 'TRANSFER', amountPence: formInt(formData, 'transferPaid') },
        ],
        customerId,
        paymentStatus,
        hasDiscount: Boolean(orderDiscountType && orderDiscountType !== 'NONE') || orderDiscountValue > 0,
      });

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
        discountOverrideReasonCode: discountReasonCode,
        discountOverrideReason: discountReason,
        discountApprovedByUserId,
        payments: [
          { method: 'CASH', amountPence: formInt(formData, 'cashPaid') },
          { method: 'CARD', amountPence: formInt(formData, 'cardPaid') },
          { method: 'TRANSFER', amountPence: formInt(formData, 'transferPaid') }
        ],
        lines
      });

      const affectedProductIds = [...new Set(lines.map((line) => line.productId).filter(Boolean))];
      void checkAndSendLowStockAlert({
        businessId,
        storeId,
        productIds: affectedProductIds,
      }).catch(() => {});

      void measureServerOperation(
        'action.checkout.audit-log',
        async () => audit({ businessId, userId: user.id, userName: user.name, userRole: user.role, action: 'SALE_CREATE', entity: 'SalesInvoice', entityId: invoice.id, details: { lines: lines.length, total: invoice.totalPence } }),
        { ...checkoutTimingMetadata, stage: 'audit-log', rowCount: 1 },
        { thresholdMs: CHECKOUT_ACTION_STAGE_THRESHOLDS_MS.auditLog, operationType: 'action' },
      ).catch(() => {});

      await measureServerOperation(
        'action.checkout.revalidate',
        async () => {
          revalidateTag(`today-sales-${businessId}`);
          revalidateTag(`readiness-${businessId}`);
          revalidateTag('reports');
          revalidateOwnerDashboardCache();
          revalidatePath('/onboarding');
        },
        { ...checkoutTimingMetadata, stage: 'revalidate' },
        { thresholdMs: CHECKOUT_ACTION_STAGE_THRESHOLDS_MS.revalidate, operationType: 'action' },
      );
      redirect(`/receipts/${invoice.id}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (message.includes('Insufficient stock') || message.includes('Insufficient stock on hand')) {
        redirect('/pos?error=insufficient-stock');
      }
      if (message.includes('Open till is required')) {
        redirect('/pos?error=till-not-open');
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
  discountManagerPin?: string;
  discountReasonCode?: string;
  discountReason?: string;
  loyaltyPointsToRedeem?: number;
}): Promise<ActionResult<{ receiptId: string; totalPence: number; transactionNumber: string | null }>> {
  return safeAction(async () => {
    const { user, businessId } = await withBusinessContext();

    const paymentStatus = (data.paymentStatus || 'PAID') as PaymentStatus;
    const completePsValidation = PaymentStatusEnum.safeParse(paymentStatus);
    if (!completePsValidation.success) {
      return { success: false, error: completePsValidation.error.issues[0].message };
    }
    const customerId = data.customerId || null;
    const dueDate = data.dueDate ? new Date(data.dueDate) : null;
    const orderDiscountType = (data.orderDiscountType || 'NONE') as DiscountType;
    const orderDiscountValue = parseDiscountValue(orderDiscountType, data.orderDiscountValue);
    const momoPaid = Math.max(0, data.momoPaid ?? 0);
    const discountManagerPin = (data.discountManagerPin || '').trim();
    const discountReasonCode = (data.discountReasonCode || '').trim() || null;
    const discountReason = (data.discountReason || '').trim() || null;
    if (discountReasonCode && !isDiscountReasonCode(discountReasonCode)) {
      return { success: false, error: 'Invalid discount reason code.' };
    }
    let discountApprovedByUserId: string | null = null;

    // MoMo collection API not yet integrated — allow sales without a
    // confirmed collectionId.  Staff verify receipts manually; reconciliation
    // catches discrepancies at end-of-day.
    // if (momoPaid > 0 && !data.momoCollectionId) {
    //   return { success: false, error: 'Confirm MoMo payment before completing sale.' };
    // }

    if (discountManagerPin) {
      const approvedBy = await verifyManagerPin({ businessId, pin: discountManagerPin });
      if (!approvedBy) {
        return { success: false, error: 'Invalid manager PIN for discount approval.' };
      }
      discountApprovedByUserId = approvedBy.id;
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
              qtyBase: item.qtyBase != null ? Number(item.qtyBase) : undefined,
              lineSubtotalPence:
                item.lineSubtotalPence != null ? Number(item.lineSubtotalPence) : undefined,
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

    const salePayments = [
      { method: 'CASH' as const, amountPence: data.cashPaid },
      { method: 'CARD' as const, amountPence: data.cardPaid },
      { method: 'TRANSFER' as const, amountPence: data.transferPaid },
      {
        method: 'MOBILE_MONEY' as const,
        amountPence: momoPaid,
        reference: data.momoRef ?? null,
        payerMsisdn: data.momoPayerMsisdn ?? null,
        network: data.momoNetwork ?? null,
      },
    ];
    const checkoutTimingMetadata = checkoutActionTimingMetadata({
      businessId,
      storeId: data.storeId,
      lines,
      payments: salePayments,
      customerId,
      paymentStatus,
      hasDiscount: Boolean(orderDiscountType && orderDiscountType !== 'NONE') || orderDiscountValue > 0,
    });

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
      discountOverrideReasonCode: discountReasonCode,
      discountOverrideReason: discountReason,
      discountApprovedByUserId,
      momoCollectionId: data.momoCollectionId || null,
      loyaltyPointsToRedeem: Math.max(0, Math.floor(data.loyaltyPointsToRedeem ?? 0)),
      payments: salePayments,
      lines,
    });

    const affectedProductIds = [...new Set(lines.map((line) => line.productId).filter(Boolean))];
    void checkAndSendLowStockAlert({
      businessId,
      storeId: data.storeId,
      productIds: affectedProductIds,
    }).catch(() => {});

    // Fire-and-forget: audit + cache revalidation should not block the cashier
    void measureServerOperation(
      'action.checkout.audit-log',
      async () => audit({
        businessId,
        userId: user.id,
        userName: user.name,
        userRole: user.role,
        action: 'SALE_CREATE',
        entity: 'SalesInvoice',
        entityId: invoice.id,
        details: { lines: lines.length, total: invoice.totalPence },
      }),
      { ...checkoutTimingMetadata, stage: 'audit-log', rowCount: 1 },
      { thresholdMs: CHECKOUT_ACTION_STAGE_THRESHOLDS_MS.auditLog, operationType: 'action' },
    ).catch(() => {});

    // Keep owner/reporting surfaces fresh after a sale lands. This is a single
    // lightweight tag invalidation, so the dashboard reflects new tickets
    // promptly without a manual refresh cycle.
    await measureServerOperation(
      'action.checkout.revalidate',
      async () => {
        revalidateTag(`today-sales-${businessId}`);
        revalidateTag(`readiness-${businessId}`);
        revalidateTag('reports');
        revalidateOwnerDashboardCache();
        revalidatePath('/onboarding');
      },
      { ...checkoutTimingMetadata, stage: 'revalidate' },
      { thresholdMs: CHECKOUT_ACTION_STAGE_THRESHOLDS_MS.revalidate, operationType: 'action' },
    );

    return { success: true, data: { receiptId: invoice.id, totalPence: invoice.totalPence, transactionNumber: invoice.transactionNumber ?? null } };
  });
}

export async function amendSaleAction(formData: FormData): Promise<void> {
  return formAction(async () => {
    const { user, businessId } = await withBusinessContext(['MANAGER', 'OWNER']);

    const salesInvoiceId = formString(formData, 'salesInvoiceId');
    const reason = formString(formData, 'reason') || 'Sale amended';
    const refundMethod = (formString(formData, 'refundMethod') || 'CASH') as 'CASH' | 'CARD' | 'TRANSFER' | 'MOBILE_MONEY';
    const additionalPaymentMethod = (formString(formData, 'additionalPaymentMethod') || 'CASH') as 'CASH' | 'CARD' | 'TRANSFER' | 'MOBILE_MONEY';

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

    let newLines: { productId: string; unitId: string; qtyInUnit: number; unitPricePence?: number; managerPin?: string }[] = [];
    const newLinesRaw = formData.get('newLines');
    if (newLinesRaw) {
      try {
        const parsed = JSON.parse(String(newLinesRaw));
        if (Array.isArray(parsed)) {
          newLines = parsed
            .filter((l: any) => l.productId && l.unitId && l.qtyInUnit > 0)
            .map((l: any) => ({
              productId: String(l.productId),
              unitId: String(l.unitId),
              qtyInUnit: Number(l.qtyInUnit),
              unitPricePence:
                l.unitPricePence !== undefined && Number(l.unitPricePence) > 0
                  ? Math.round(Number(l.unitPricePence))
                  : undefined,
              managerPin: typeof l.managerPin === 'string' ? l.managerPin : undefined,
            }));
        }
      } catch {
        newLines = [];
      }
    }

    let priceOverrideApprovedBy: { id: string; name: string | null; role: string } | null = null;
    if (newLines.some((line) => line.unitPricePence !== undefined)) {
      const [business, productUnits] = await Promise.all([
        prisma.business.findUnique({
          where: { id: businessId },
          select: { discountApprovalThresholdBps: true },
        }),
        prisma.productUnit.findMany({
          where: {
            product: { businessId },
            OR: newLines.map((line) => ({ productId: line.productId, unitId: line.unitId })),
          },
          include: { product: true },
        }),
      ]);
      const thresholdBps = business?.discountApprovalThresholdBps ?? 1500;
      const unitMap = new Map(productUnits.map((pu) => [`${pu.productId}:${pu.unitId}`, pu]));
      const needsApproval = newLines.some((line) => {
        if (line.unitPricePence === undefined) return false;
        const productUnit = unitMap.get(`${line.productId}:${line.unitId}`);
        if (!productUnit) return false;
        const originalPricePence = resolveEffectiveSellingPricePence(productUnit.product, productUnit);
        const diffBps = originalPricePence > 0
          ? Math.round((Math.abs(originalPricePence - line.unitPricePence) * 10000) / originalPricePence)
          : line.unitPricePence === originalPricePence ? 0 : Number.POSITIVE_INFINITY;
        return diffBps > thresholdBps;
      });

      if (needsApproval) {
        const managerPin = newLines.find((line) => line.managerPin)?.managerPin?.trim() ?? '';
        if (!managerPin) {
          throw new UserError('Manager PIN required for this price change.');
        }
        const approvedBy = await verifyManagerPin({ businessId, pin: managerPin });
        if (!approvedBy) {
          throw new UserError('Invalid manager PIN for price change approval.');
        }
        priceOverrideApprovedBy = approvedBy;
      }
    }

    const sanitizedNewLines = newLines.map(({ managerPin, ...line }) => line);

    const result = await amendSale({
      salesInvoiceId,
      businessId,
      userId: user.id,
      reason,
      keepLineIds,
      newLines: sanitizedNewLines.length > 0 ? sanitizedNewLines : undefined,
      refundMethod,
      additionalPaymentMethod,
    });

    audit({
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
        additionalPaymentNeeded: result.additionalPaymentNeeded,
        additionalPaymentMethod: result.additionalPaymentMethod,
        priceOverrideApprovedBy,
      },
    }).catch(() => {});

    revalidateTag('pos-products');
    revalidateTag('reports');
    revalidateOwnerDashboardCache();

    redirect('/sales?amended=true');
  }, '/sales');
}
