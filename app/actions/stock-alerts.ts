'use server';

import { Prisma } from '@prisma/client';

import { requireUser } from '@/lib/auth';
import { audit, type AuditAction } from '@/lib/audit';
import { err, ok, safeAction, type ActionResult } from '@/lib/action-utils';
import { prisma } from '@/lib/prisma';
import { sendWhatsAppMessage } from '@/lib/notifications/providers';
import { normalizeWhatsappPhone, resolveBusinessTimeZone } from '@/lib/notifications/utils';
import { buildLowStockAlertTemplate } from '@/lib/notifications/templates/low-stock';
import { buildCashVarianceTemplate } from '@/lib/notifications/templates/cash-variance';
import { buildDebtorReminderTemplate } from '@/lib/notifications/templates/debtor-reminder';
import { buildVoidReturnAlertTemplate } from '@/lib/notifications/templates/void-return';

type NotificationBusiness = {
  id: string;
  name: string;
  currency: string;
  whatsappEnabled: boolean;
  whatsappPhone: string | null;
  timezone: string | null;
  whatsappLowStockEnabled: boolean;
  whatsappCashVarianceEnabled: boolean;
  whatsappCashVarianceThreshold: unknown;
  whatsappVoidAlertEnabled: boolean;
  whatsappVoidAlertThreshold: unknown;
};

type DeliveryResultData = {
  sent: boolean;
  recipient: string | null;
  deepLink: string;
  status?: string;
  provider?: string;
  reason?: string;
};

function decimalToPence(value: unknown, fallbackMajor: number) {
  if (value === null || value === undefined) {
    return Math.round(fallbackMajor * 100);
  }

  const numeric =
    typeof value === 'number'
      ? value
      : Number(typeof value === 'object' && value && 'toString' in value ? value.toString() : value);

  return Number.isFinite(numeric) ? Math.round(numeric * 100) : Math.round(fallbackMajor * 100);
}

function formatDateTime(date: Date | null | undefined, timeZone?: string | null) {
  if (!date) return '—';
  return date.toLocaleString('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: resolveBusinessTimeZone(timeZone),
  });
}

function formatDate(date: Date | null | undefined, timeZone?: string | null) {
  if (!date) return 'No payment recorded';
  return date.toLocaleDateString('en-GB', {
    dateStyle: 'medium',
    timeZone: resolveBusinessTimeZone(timeZone),
  });
}

function getDeliveryStatus(messageStatus: string) {
  return messageStatus === 'ACCEPTED' || messageStatus === 'DELIVERED' || messageStatus === 'READ'
    ? 'SUCCESS'
    : 'REVIEW_REQUIRED';
}

async function createMessageLogSafe(data: Record<string, unknown>) {
  try {
    return await prisma.messageLog.create({ data: data as Prisma.MessageLogUncheckedCreateInput });
  } catch (error) {
    console.error('[stock-alerts] failed to create MessageLog', {
      businessId: data.businessId,
      recipient: data.recipient,
      messageType: data.messageType,
      error,
    });
    return null;
  }
}

async function getBusinessConfig(businessId: string): Promise<NotificationBusiness | null> {
  return (await prisma.business.findUnique({
    where: { id: businessId },
    select: {
      id: true,
      name: true,
      currency: true,
      whatsappEnabled: true,
      whatsappPhone: true,
      timezone: true,
      whatsappLowStockEnabled: true,
      whatsappCashVarianceEnabled: true,
      whatsappCashVarianceThreshold: true,
      whatsappVoidAlertEnabled: true,
      whatsappVoidAlertThreshold: true,
    } as any,
  })) as NotificationBusiness | null;
}

async function deliverWhatsAppNotification(input: {
  businessId: string;
  messageType: 'LOW_STOCK_ALERT' | 'CASH_VARIANCE_ALERT' | 'DEBTOR_REMINDER' | 'VOID_RETURN_ALERT';
  recipient: string | null;
  text: string;
  deepLink: string;
  missingRecipientMessage: string;
  auditAction?: AuditAction;
  auditUser?: { id: string; name: string | null; role: string };
  auditDetails?: Record<string, unknown>;
}): Promise<ActionResult<DeliveryResultData>> {
  if (!input.recipient) {
    await createMessageLogSafe({
      businessId: input.businessId,
      channel: 'WHATSAPP',
      provider: 'WHATSAPP_DEEPLINK',
      recipient: 'missing_recipient',
      messageType: input.messageType,
      payload: input.text,
      status: 'FAILED',
      providerStatus: 'MISSING_RECIPIENT',
      errorMessage: input.missingRecipientMessage,
      deepLink: input.deepLink,
      deliveredAt: null,
    });

    return err(input.missingRecipientMessage);
  }

  const delivery = await sendWhatsAppMessage({
    recipient: input.recipient,
    text: input.text,
    messageType: input.messageType,
  });

  await createMessageLogSafe({
    businessId: input.businessId,
    channel: 'WHATSAPP',
    provider: delivery.provider,
    recipient: input.recipient,
    messageType: input.messageType,
    payload: input.text,
    status: delivery.status,
    providerStatus: delivery.providerStatus,
    providerMessageId: delivery.providerMessageId ?? null,
    errorMessage: delivery.errorMessage ?? null,
    deepLink: delivery.deepLink ?? input.deepLink,
    deliveredAt: null,
  });

  if (input.auditAction && input.auditUser) {
    audit({
      businessId: input.businessId,
      userId: input.auditUser.id,
      userName: input.auditUser.name,
      userRole: input.auditUser.role,
      action: input.auditAction,
      entity: 'MessageLog',
      details: {
        channel: 'WHATSAPP',
        messageType: input.messageType,
        recipient: input.recipient,
        status: delivery.status,
        provider: delivery.provider,
        providerStatus: delivery.providerStatus,
        providerMessageId: delivery.providerMessageId ?? null,
        attemptedProvider: delivery.attemptedProvider ?? null,
        ...(input.auditDetails ?? {}),
      },
    });
  }

  return ok({
    sent: delivery.ok,
    recipient: input.recipient,
    deepLink: delivery.deepLink ?? input.deepLink,
    status: delivery.status,
    provider: delivery.provider,
    reason: getDeliveryStatus(delivery.status),
  });
}

export async function checkAndSendLowStockAlert(input?: {
  businessId?: string;
  storeId?: string;
  productIds?: string[];
}): Promise<ActionResult<DeliveryResultData & { itemCount: number }>> {
  return safeAction<DeliveryResultData & { itemCount: number }>(async () => {
    const user = await requireUser();
    const businessId = input?.businessId ?? user.businessId;
    const business = await getBusinessConfig(businessId);

    if (!business || !business.whatsappEnabled || !business.whatsappLowStockEnabled) {
      return ok({
        sent: false,
        recipient: null,
        deepLink: '',
        itemCount: 0,
        reason: 'disabled',
      });
    }

    const rawBalances = await prisma.inventoryBalance.findMany({
      where: {
        ...(input?.storeId ? { storeId: input.storeId } : { store: { businessId } }),
        product: {
          businessId,
          reorderPointBase: { gt: 0 },
          ...(input?.productIds?.length ? { id: { in: input.productIds } } : {}),
        },
      },
      select: {
        qtyOnHandBase: true,
        store: { select: { name: true } },
        product: {
          select: {
            id: true,
            name: true,
            reorderPointBase: true,
            category: { select: { name: true } },
          },
        },
      },
    });

    const lowStockItems = rawBalances
      .filter((item) => item.qtyOnHandBase <= item.product.reorderPointBase)
      .map((item) => ({
        categoryName: item.product.category?.name ?? 'Uncategorised',
        productName: item.product.name,
        currentQty: item.qtyOnHandBase,
        reorderQty: item.product.reorderPointBase,
        shortageQty: item.product.reorderPointBase - item.qtyOnHandBase,
        storeName: item.store.name,
      }))
      .sort((a, b) => b.shortageQty - a.shortageQty || a.currentQty - b.currentQty || a.productName.localeCompare(b.productName))
      .slice(0, 10);

    const recipient = normalizeWhatsappPhone(business.whatsappPhone);
    const { text, deepLink } = buildLowStockAlertTemplate({
      recipient,
      businessName: business.name,
      storeName: input?.storeId ? lowStockItems[0]?.storeName ?? null : null,
      items: lowStockItems,
    });

    if (lowStockItems.length === 0) {
      return ok({
        sent: false,
        recipient,
        deepLink,
        itemCount: 0,
        reason: 'no_low_stock_items',
      });
    }

    const deliveryResult = await deliverWhatsAppNotification({
      businessId,
      messageType: 'LOW_STOCK_ALERT',
      recipient,
      text,
      deepLink,
      missingRecipientMessage: 'Owner WhatsApp phone is missing or invalid for low stock alerts.',
      auditAction: 'WHATSAPP_LOW_STOCK_SENT',
      auditUser: { id: user.id, name: user.name, role: user.role },
      auditDetails: { itemCount: lowStockItems.length, storeId: input?.storeId ?? null },
    });

    if (!deliveryResult.success) {
      return deliveryResult;
    }

    return ok({ ...deliveryResult.data, itemCount: lowStockItems.length });
  });
}

export async function sendCashVarianceAlert(input: {
  shiftId: string;
  businessId?: string;
}): Promise<ActionResult<DeliveryResultData & { variancePence: number }>> {
  return safeAction<DeliveryResultData & { variancePence: number }>(async () => {
    const user = await requireUser();
    const businessId = input.businessId ?? user.businessId;
    const business = await getBusinessConfig(businessId);

    if (!business || !business.whatsappEnabled || !business.whatsappCashVarianceEnabled) {
      return ok({
        sent: false,
        recipient: null,
        deepLink: '',
        variancePence: 0,
        reason: 'disabled',
      });
    }

    const shift = await prisma.shift.findFirst({
      where: {
        id: input.shiftId,
        till: { store: { businessId } },
      },
      select: {
        id: true,
        openedAt: true,
        closedAt: true,
        expectedCashPence: true,
        actualCashPence: true,
        variance: true,
        user: { select: { name: true } },
      },
    });

    if (!shift) {
      return err('Shift not found for cash variance alert.');
    }

    const variancePence =
      shift.variance ?? (shift.actualCashPence ?? shift.expectedCashPence) - shift.expectedCashPence;
    const thresholdPence = decimalToPence(business.whatsappCashVarianceThreshold, 50);

    const recipient = normalizeWhatsappPhone(business.whatsappPhone);
    const { text, deepLink } = buildCashVarianceTemplate({
      recipient,
      businessName: business.name,
      cashierName: shift.user.name ?? 'Unknown cashier',
      expectedCashPence: shift.expectedCashPence,
      actualCashPence: shift.actualCashPence ?? shift.expectedCashPence,
      variancePence,
      shiftRangeLabel: `${formatDateTime(shift.openedAt, business.timezone)} - ${formatDateTime(
        shift.closedAt ?? new Date(),
        business.timezone,
      )}`,
      currency: business.currency,
    });

    if (Math.abs(variancePence) < thresholdPence) {
      return ok({
        sent: false,
        recipient,
        deepLink,
        variancePence,
        reason: 'below_threshold',
      });
    }

    const deliveryResult = await deliverWhatsAppNotification({
      businessId,
      messageType: 'CASH_VARIANCE_ALERT',
      recipient,
      text,
      deepLink,
      missingRecipientMessage: 'Owner WhatsApp phone is missing or invalid for cash variance alerts.',
      auditAction: 'WHATSAPP_CASH_VARIANCE_SENT',
      auditUser: { id: user.id, name: user.name, role: user.role },
      auditDetails: { shiftId: shift.id, variancePence, thresholdPence },
    });

    if (!deliveryResult.success) {
      return deliveryResult;
    }

    return ok({ ...deliveryResult.data, variancePence });
  });
}

export async function sendDebtorReminderAction(
  customerId: string,
): Promise<ActionResult<DeliveryResultData & { outstandingBalancePence: number }>> {
  return safeAction<DeliveryResultData & { outstandingBalancePence: number }>(async () => {
    const user = await requireUser();
    if (!['MANAGER', 'OWNER'].includes(user.role)) {
      return err('You are not authorised to send debtor reminders.');
    }

    const business = await getBusinessConfig(user.businessId);
    if (!business || !business.whatsappEnabled) {
      return ok({
        sent: false,
        recipient: null,
        deepLink: '',
        outstandingBalancePence: 0,
        reason: 'disabled',
      });
    }

    const customer = await prisma.customer.findFirst({
      where: { id: customerId, businessId: user.businessId },
      select: { id: true, name: true, phone: true },
    });

    if (!customer) {
      return err('Customer not found.');
    }

    const invoices = await prisma.salesInvoice.findMany({
      where: {
        businessId: user.businessId,
        customerId: customer.id,
        paymentStatus: { in: ['UNPAID', 'PART_PAID'] },
      },
      select: {
        totalPence: true,
        dueDate: true,
        createdAt: true,
        payments: { select: { amountPence: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    const outstandingBalancePence = invoices.reduce((sum, invoice) => {
      const paid = invoice.payments.reduce((paymentSum, payment) => paymentSum + payment.amountPence, 0);
      return sum + Math.max(invoice.totalPence - paid, 0);
    }, 0);

    const oldestOutstandingDate = invoices[0]?.dueDate ?? invoices[0]?.createdAt ?? new Date();
    const agingDays = Math.max(
      0,
      Math.floor((Date.now() - new Date(oldestOutstandingDate).getTime()) / (24 * 60 * 60 * 1000)),
    );

    const lastPayment = await prisma.salesPayment.findFirst({
      where: {
        salesInvoice: {
          businessId: user.businessId,
          customerId: customer.id,
        },
      },
      orderBy: { receivedAt: 'desc' },
      select: { receivedAt: true },
    });

    const recipient = normalizeWhatsappPhone(customer.phone);
    const { text, deepLink } = buildDebtorReminderTemplate({
      recipient,
      businessName: business.name,
      customerName: customer.name,
      outstandingBalancePence,
      lastPaymentDateLabel: formatDate(lastPayment?.receivedAt, business.timezone),
      agingDays,
      currency: business.currency,
    });

    if (outstandingBalancePence <= 0) {
      return ok({
        sent: false,
        recipient,
        deepLink,
        outstandingBalancePence,
        reason: 'no_outstanding_balance',
      });
    }

    const deliveryResult = await deliverWhatsAppNotification({
      businessId: user.businessId,
      messageType: 'DEBTOR_REMINDER',
      recipient,
      text,
      deepLink,
      missingRecipientMessage: 'Customer WhatsApp phone is missing or invalid for debtor reminders.',
      auditAction: 'WHATSAPP_DEBTOR_REMINDER_SENT',
      auditUser: { id: user.id, name: user.name, role: user.role },
      auditDetails: { customerId: customer.id, outstandingBalancePence, agingDays },
    });

    if (!deliveryResult.success) {
      return deliveryResult;
    }

    return ok({ ...deliveryResult.data, outstandingBalancePence });
  });
}

export async function sendVoidReturnAlert(input: {
  salesReturnId: string;
  businessId?: string;
}): Promise<ActionResult<DeliveryResultData & { amountPence: number }>> {
  return safeAction<DeliveryResultData & { amountPence: number }>(async () => {
    const user = await requireUser();
    const businessId = input.businessId ?? user.businessId;
    const business = await getBusinessConfig(businessId);

    if (!business || !business.whatsappEnabled || !business.whatsappVoidAlertEnabled) {
      return ok({
        sent: false,
        recipient: null,
        deepLink: '',
        amountPence: 0,
        reason: 'disabled',
      });
    }

    const salesReturn = await prisma.salesReturn.findFirst({
      where: {
        id: input.salesReturnId,
        salesInvoice: { businessId },
      },
      select: {
        id: true,
        type: true,
        refundAmountPence: true,
        reasonCode: true,
        reason: true,
        user: { select: { name: true } },
        salesInvoice: {
          select: {
            id: true,
            transactionNumber: true,
            totalPence: true,
            lines: {
              select: {
                qtyInUnit: true,
                product: { select: { name: true } },
              },
            },
          },
        },
      },
    });

    if (!salesReturn) {
      return err('Void/return transaction not found.');
    }

    const amountPence =
      salesReturn.type === 'VOID' ? salesReturn.salesInvoice.totalPence : salesReturn.refundAmountPence;
    const thresholdPence = decimalToPence(business.whatsappVoidAlertThreshold, 100);
    const recipient = normalizeWhatsappPhone(business.whatsappPhone);
    const { text, deepLink } = buildVoidReturnAlertTemplate({
      recipient,
      businessName: business.name,
      kind: salesReturn.type as 'VOID' | 'RETURN',
      cashierName: salesReturn.user.name ?? 'Unknown cashier',
      invoiceNumber:
        salesReturn.salesInvoice.transactionNumber ??
        `#${salesReturn.salesInvoice.id.slice(0, 8).toUpperCase()}`,
      amountPence,
      items: salesReturn.salesInvoice.lines.slice(0, 5).map((line) => `${line.qtyInUnit} x ${line.product.name}`),
      reason: salesReturn.reason?.trim() || salesReturn.reasonCode?.trim() || 'No reason provided',
      currency: business.currency,
    });

    if (amountPence < thresholdPence) {
      return ok({
        sent: false,
        recipient,
        deepLink,
        amountPence,
        reason: 'below_threshold',
      });
    }

    const deliveryResult = await deliverWhatsAppNotification({
      businessId,
      messageType: 'VOID_RETURN_ALERT',
      recipient,
      text,
      deepLink,
      missingRecipientMessage: 'Owner WhatsApp phone is missing or invalid for void/return alerts.',
      auditAction: 'WHATSAPP_VOID_RETURN_SENT',
      auditUser: { id: user.id, name: user.name, role: user.role },
      auditDetails: {
        salesReturnId: salesReturn.id,
        kind: salesReturn.type,
        amountPence,
        thresholdPence,
      },
    });

    if (!deliveryResult.success) {
      return deliveryResult;
    }

    return ok({ ...deliveryResult.data, amountPence });
  });
}
