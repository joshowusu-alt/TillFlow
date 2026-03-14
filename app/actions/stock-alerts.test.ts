import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  prismaMock,
  requireUserMock,
  sendWhatsAppMessageMock,
  auditMock,
  buildLowStockAlertTemplateMock,
  buildCashVarianceTemplateMock,
  buildDebtorReminderTemplateMock,
  buildVoidReturnAlertTemplateMock,
} = vi.hoisted(() => ({
  prismaMock: {
    business: { findUnique: vi.fn() },
    inventoryBalance: { findMany: vi.fn() },
    messageLog: { create: vi.fn() },
    shift: { findFirst: vi.fn() },
    customer: { findFirst: vi.fn() },
    salesInvoice: { findMany: vi.fn() },
    salesPayment: { findFirst: vi.fn() },
    salesReturn: { findFirst: vi.fn() },
  },
  requireUserMock: vi.fn(),
  sendWhatsAppMessageMock: vi.fn(),
  auditMock: vi.fn(),
  buildLowStockAlertTemplateMock: vi.fn(),
  buildCashVarianceTemplateMock: vi.fn(),
  buildDebtorReminderTemplateMock: vi.fn(),
  buildVoidReturnAlertTemplateMock: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('@/lib/auth', () => ({ requireUser: requireUserMock }));
vi.mock('@/lib/audit', () => ({ audit: auditMock }));
vi.mock('@/lib/notifications/providers', () => ({
  sendWhatsAppMessage: sendWhatsAppMessageMock,
}));
vi.mock('@/lib/notifications/templates/low-stock', () => ({
  buildLowStockAlertTemplate: buildLowStockAlertTemplateMock,
}));
vi.mock('@/lib/notifications/templates/cash-variance', () => ({
  buildCashVarianceTemplate: buildCashVarianceTemplateMock,
}));
vi.mock('@/lib/notifications/templates/debtor-reminder', () => ({
  buildDebtorReminderTemplate: buildDebtorReminderTemplateMock,
}));
vi.mock('@/lib/notifications/templates/void-return', () => ({
  buildVoidReturnAlertTemplate: buildVoidReturnAlertTemplateMock,
}));

import {
  checkAndSendLowStockAlert,
  sendCashVarianceAlert,
  sendDebtorReminderAction,
  sendVoidReturnAlert,
} from '@/app/actions/stock-alerts';

function makeBusiness(overrides: Record<string, unknown> = {}) {
  return {
    id: 'biz-1',
    name: 'TillFlow Market',
    currency: 'GHS',
    whatsappEnabled: true,
    whatsappPhone: '+233241234567',
    timezone: 'Africa/Accra',
    whatsappLowStockEnabled: true,
    whatsappCashVarianceEnabled: true,
    whatsappCashVarianceThreshold: 50,
    whatsappVoidAlertEnabled: true,
    whatsappVoidAlertThreshold: 100,
    ...overrides,
  };
}

function makeDelivery(overrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    status: 'ACCEPTED',
    provider: 'META_WHATSAPP',
    providerStatus: 'ACCEPTED',
    providerMessageId: 'msg-1',
    deepLink: 'https://wa.me/233241234567?text=mock',
    ...overrides,
  };
}

describe('stock alert actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();

    requireUserMock.mockResolvedValue({
      id: 'user-1',
      businessId: 'biz-1',
      name: 'Ama',
      role: 'OWNER',
    });

    prismaMock.business.findUnique.mockResolvedValue(makeBusiness());
    prismaMock.inventoryBalance.findMany.mockResolvedValue([]);
    prismaMock.messageLog.create.mockResolvedValue({ id: 'log-1' });
    prismaMock.shift.findFirst.mockResolvedValue(null);
    prismaMock.customer.findFirst.mockResolvedValue(null);
    prismaMock.salesInvoice.findMany.mockResolvedValue([]);
    prismaMock.salesPayment.findFirst.mockResolvedValue(null);
    prismaMock.salesReturn.findFirst.mockResolvedValue(null);

    sendWhatsAppMessageMock.mockResolvedValue(makeDelivery());

    buildLowStockAlertTemplateMock.mockImplementation(({ items, recipient }) => ({
      text: `low-stock:${items.map((item: { productName: string }) => item.productName).join(',')}`,
      deepLink: recipient ? `https://wa.me/${recipient}?text=low-stock` : 'https://wa.me/?text=low-stock',
    }));
    buildCashVarianceTemplateMock.mockImplementation(({ recipient, variancePence }) => ({
      text: `cash-variance:${variancePence}`,
      deepLink: recipient
        ? `https://wa.me/${recipient}?text=cash-variance`
        : 'https://wa.me/?text=cash-variance',
    }));
    buildDebtorReminderTemplateMock.mockImplementation(({ recipient, customerName }) => ({
      text: `debtor:${customerName}`,
      deepLink: recipient ? `https://wa.me/${recipient}?text=debtor` : 'https://wa.me/?text=debtor',
    }));
    buildVoidReturnAlertTemplateMock.mockImplementation(({ recipient, kind, amountPence }) => ({
      text: `void-return:${kind}:${amountPence}`,
      deepLink: recipient
        ? `https://wa.me/${recipient}?text=void-return`
        : 'https://wa.me/?text=void-return',
    }));
  });

  describe('checkAndSendLowStockAlert', () => {
    it('sends an alert when products are below reorder level', async () => {
      prismaMock.inventoryBalance.findMany.mockResolvedValue([
        {
          qtyOnHandBase: 2,
          store: { name: 'Main Branch' },
          product: {
            id: 'prod-1',
            name: 'Cola',
            reorderPointBase: 8,
            category: { name: 'Beverages' },
          },
        },
      ]);

      const result = await checkAndSendLowStockAlert();

      expect(result).toEqual({
        success: true,
        data: expect.objectContaining({
          sent: true,
          recipient: '233241234567',
          status: 'ACCEPTED',
          provider: 'META_WHATSAPP',
          itemCount: 1,
          reason: 'SUCCESS',
        }),
      });
      expect(sendWhatsAppMessageMock).toHaveBeenCalledWith({
        recipient: '233241234567',
        text: 'low-stock:Cola',
        messageType: 'LOW_STOCK_ALERT',
      });
      expect(prismaMock.messageLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            messageType: 'LOW_STOCK_ALERT',
            recipient: '233241234567',
          }),
        }),
      );
    });

    it('skips sending when the low-stock feature is disabled', async () => {
      prismaMock.business.findUnique.mockResolvedValue(makeBusiness({ whatsappLowStockEnabled: false }));

      const result = await checkAndSendLowStockAlert();

      expect(result).toEqual({
        success: true,
        data: {
          sent: false,
          recipient: null,
          deepLink: '',
          itemCount: 0,
          reason: 'disabled',
        },
      });
      expect(sendWhatsAppMessageMock).not.toHaveBeenCalled();
    });

    it('skips sending when there are no products at or below reorder level', async () => {
      prismaMock.inventoryBalance.findMany.mockResolvedValue([
        {
          qtyOnHandBase: 12,
          store: { name: 'Main Branch' },
          product: {
            id: 'prod-1',
            name: 'Cola',
            reorderPointBase: 8,
            category: { name: 'Beverages' },
          },
        },
      ]);

      const result = await checkAndSendLowStockAlert();

      expect(result).toEqual({
        success: true,
        data: {
          sent: false,
          recipient: '233241234567',
          deepLink: 'https://wa.me/233241234567?text=low-stock',
          itemCount: 0,
          reason: 'no_low_stock_items',
        },
      });
      expect(sendWhatsAppMessageMock).not.toHaveBeenCalled();
    });

    it('limits the alert to the top ten low-stock items', async () => {
      prismaMock.inventoryBalance.findMany.mockResolvedValue(
        Array.from({ length: 12 }, (_, index) => ({
          qtyOnHandBase: index,
          store: { name: 'Main Branch' },
          product: {
            id: `prod-${index}`,
            name: `Product ${index}`,
            reorderPointBase: 20,
            category: { name: 'General' },
          },
        })),
      );

      const result = await checkAndSendLowStockAlert();

      expect(result).toEqual({
        success: true,
        data: expect.objectContaining({
          sent: true,
          itemCount: 10,
        }),
      });
      expect(buildLowStockAlertTemplateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          items: expect.arrayContaining([
            expect.objectContaining({ productName: 'Product 0' }),
          ]),
        }),
      );
      expect(buildLowStockAlertTemplateMock.mock.calls[0][0].items).toHaveLength(10);
    });
  });

  describe('sendCashVarianceAlert', () => {
    it('sends an alert when the variance exceeds the configured threshold', async () => {
      prismaMock.shift.findFirst.mockResolvedValue({
        id: 'shift-1',
        openedAt: new Date('2024-01-15T08:00:00.000Z'),
        closedAt: new Date('2024-01-15T18:00:00.000Z'),
        expectedCashPence: 100_000,
        actualCashPence: 40_000,
        variance: -60_000,
        user: { name: 'Ama' },
      });

      const result = await sendCashVarianceAlert({ shiftId: 'shift-1' });

      expect(result).toEqual({
        success: true,
        data: expect.objectContaining({
          sent: true,
          recipient: '233241234567',
          variancePence: -60_000,
          reason: 'SUCCESS',
        }),
      });
      expect(sendWhatsAppMessageMock).toHaveBeenCalledWith({
        recipient: '233241234567',
        text: 'cash-variance:-60000',
        messageType: 'CASH_VARIANCE_ALERT',
      });
    });

    it('skips sending when the variance is below threshold', async () => {
      prismaMock.shift.findFirst.mockResolvedValue({
        id: 'shift-1',
        openedAt: new Date('2024-01-15T08:00:00.000Z'),
        closedAt: new Date('2024-01-15T18:00:00.000Z'),
        expectedCashPence: 100_000,
        actualCashPence: 96_000,
        variance: -4_000,
        user: { name: 'Ama' },
      });

      const result = await sendCashVarianceAlert({ shiftId: 'shift-1' });

      expect(result).toEqual({
        success: true,
        data: {
          sent: false,
          recipient: '233241234567',
          deepLink: 'https://wa.me/233241234567?text=cash-variance',
          variancePence: -4_000,
          reason: 'below_threshold',
        },
      });
      expect(sendWhatsAppMessageMock).not.toHaveBeenCalled();
    });

    it('skips sending when the cash-variance feature is disabled', async () => {
      prismaMock.business.findUnique.mockResolvedValue(
        makeBusiness({ whatsappCashVarianceEnabled: false }),
      );

      const result = await sendCashVarianceAlert({ shiftId: 'shift-1' });

      expect(result).toEqual({
        success: true,
        data: {
          sent: false,
          recipient: null,
          deepLink: '',
          variancePence: 0,
          reason: 'disabled',
        },
      });
      expect(sendWhatsAppMessageMock).not.toHaveBeenCalled();
    });
  });

  describe('sendDebtorReminderAction', () => {
    it('sends a debtor reminder for customers with an outstanding balance', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-01-20T12:00:00.000Z'));

      prismaMock.customer.findFirst.mockResolvedValue({
        id: 'customer-1',
        name: 'Kojo Mensah',
        phone: '0241234567',
      });
      prismaMock.salesInvoice.findMany.mockResolvedValue([
        {
          totalPence: 50_000,
          dueDate: new Date('2024-01-10T00:00:00.000Z'),
          createdAt: new Date('2024-01-08T00:00:00.000Z'),
          payments: [{ amountPence: 10_000 }],
        },
      ]);
      prismaMock.salesPayment.findFirst.mockResolvedValue({
        receivedAt: new Date('2024-01-12T00:00:00.000Z'),
      });

      const result = await sendDebtorReminderAction('customer-1');

      expect(result).toEqual({
        success: true,
        data: expect.objectContaining({
          sent: true,
          recipient: '0241234567',
          outstandingBalancePence: 40_000,
          reason: 'SUCCESS',
        }),
      });
      expect(sendWhatsAppMessageMock).toHaveBeenCalledWith({
        recipient: '0241234567',
        text: 'debtor:Kojo Mensah',
        messageType: 'DEBTOR_REMINDER',
      });
      expect(buildDebtorReminderTemplateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          customerName: 'Kojo Mensah',
          outstandingBalancePence: 40_000,
          agingDays: 10,
          lastPaymentDateLabel: expect.any(String),
        }),
      );
    });

    it('returns an error when the customer cannot be found', async () => {
      const result = await sendDebtorReminderAction('missing-customer');

      expect(result).toEqual({
        success: false,
        error: 'Customer not found.',
      });
      expect(sendWhatsAppMessageMock).not.toHaveBeenCalled();
    });
  });

  describe('sendVoidReturnAlert', () => {
    it('sends an alert for a qualifying VOID transaction', async () => {
      prismaMock.salesReturn.findFirst.mockResolvedValue({
        id: 'return-1',
        type: 'VOID',
        refundAmountPence: 20_000,
        reasonCode: 'VOID_REASON',
        reason: 'Wrong customer selection',
        user: { name: 'Ama' },
        salesInvoice: {
          id: 'invoice-1',
          transactionNumber: 'INV-001',
          totalPence: 150_000,
          lines: [{ qtyInUnit: 1, product: { name: 'Rice' } }],
        },
      });

      const result = await sendVoidReturnAlert({ salesReturnId: 'return-1' });

      expect(result).toEqual({
        success: true,
        data: expect.objectContaining({
          sent: true,
          recipient: '233241234567',
          amountPence: 150_000,
          reason: 'SUCCESS',
        }),
      });
      expect(sendWhatsAppMessageMock).toHaveBeenCalledWith({
        recipient: '233241234567',
        text: 'void-return:VOID:150000',
        messageType: 'VOID_RETURN_ALERT',
      });
    });

    it('sends an alert for a qualifying RETURN transaction', async () => {
      prismaMock.salesReturn.findFirst.mockResolvedValue({
        id: 'return-2',
        type: 'RETURN',
        refundAmountPence: 125_000,
        reasonCode: null,
        reason: 'Damaged item',
        user: { name: 'Yaw' },
        salesInvoice: {
          id: 'invoice-2',
          transactionNumber: 'INV-002',
          totalPence: 200_000,
          lines: [{ qtyInUnit: 2, product: { name: 'Oil' } }],
        },
      });

      const result = await sendVoidReturnAlert({ salesReturnId: 'return-2' });

      expect(result).toEqual({
        success: true,
        data: expect.objectContaining({
          sent: true,
          amountPence: 125_000,
          reason: 'SUCCESS',
        }),
      });
      expect(sendWhatsAppMessageMock).toHaveBeenCalledWith({
        recipient: '233241234567',
        text: 'void-return:RETURN:125000',
        messageType: 'VOID_RETURN_ALERT',
      });
    });

    it('skips sending when the void or return amount is below threshold', async () => {
      prismaMock.salesReturn.findFirst.mockResolvedValue({
        id: 'return-3',
        type: 'RETURN',
        refundAmountPence: 9_000,
        reasonCode: null,
        reason: 'Damaged item',
        user: { name: 'Yaw' },
        salesInvoice: {
          id: 'invoice-3',
          transactionNumber: 'INV-003',
          totalPence: 200_000,
          lines: [{ qtyInUnit: 2, product: { name: 'Oil' } }],
        },
      });

      const result = await sendVoidReturnAlert({ salesReturnId: 'return-3' });

      expect(result).toEqual({
        success: true,
        data: {
          sent: false,
          recipient: '233241234567',
          deepLink: 'https://wa.me/233241234567?text=void-return',
          amountPence: 9_000,
          reason: 'below_threshold',
        },
      });
      expect(sendWhatsAppMessageMock).not.toHaveBeenCalled();
    });

    it('skips sending when void and return alerts are disabled', async () => {
      prismaMock.business.findUnique.mockResolvedValue(makeBusiness({ whatsappVoidAlertEnabled: false }));

      const result = await sendVoidReturnAlert({ salesReturnId: 'return-1' });

      expect(result).toEqual({
        success: true,
        data: {
          sent: false,
          recipient: null,
          deepLink: '',
          amountPence: 0,
          reason: 'disabled',
        },
      });
      expect(sendWhatsAppMessageMock).not.toHaveBeenCalled();
    });
  });
});
