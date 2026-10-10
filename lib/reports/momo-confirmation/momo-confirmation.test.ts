import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { CLASSIFIED_PAYMENT_STATUSES, isUnverifiedLegacyStatus } from '@/lib/reports/money-received';
import { resolveMoneyReceivedAccess } from '@/lib/reports/money-received/access';
import {
  defaultMomoConfirmationStatusFilter,
  momoConfirmationPaymentWhere,
  momoConfirmationDateInputValue,
  momoConfirmationReceiptScope,
  MOMO_CONFIRMATION_STATUS,
} from '@/lib/reports/momo-confirmation';
import { receivableDocumentBalance } from '@/lib/reports/receivables-balance';
import { defaultTenantLocalRange } from '@/lib/reports/reporting-clock';
import { listMomoConfirmationPayments, iterMomoConfirmationExportCsvChunks } from '@/lib/reports/momo-confirmation/query';

describe('MoMo confirmation review — classification vs Money Received', () => {
  it('treats PENDING_MANUAL as unverified (excluded from Money Received)', () => {
    expect(isUnverifiedLegacyStatus(MOMO_CONFIRMATION_STATUS)).toBe(true);
    expect(CLASSIFIED_PAYMENT_STATUSES).not.toContain(MOMO_CONFIRMATION_STATUS);
    expect(isUnverifiedLegacyStatus('CONFIRMED')).toBe(false);
  });

  it('default filter targets PENDING_MANUAL', () => {
    expect(defaultMomoConfirmationStatusFilter()).toBe('PENDING_MANUAL');
  });

  it('where clause includes PENDING_MANUAL and scopes by business/period', () => {
    const where = momoConfirmationPaymentWhere({
      businessId: 'biz-1',
      branchIds: ['store-1'],
      periodStart: new Date('2026-08-01T00:00:00.000Z'),
      periodEndExclusive: new Date('2026-09-01T00:00:00.000Z'),
      status: 'PENDING_MANUAL',
      saleStatus: 'ALL',
      cashierUserId: 'ALL',
    });
    expect(where.status).toBe('PENDING_MANUAL');
    expect(where.salesInvoice).toMatchObject({
      businessId: 'biz-1',
      storeId: { in: ['store-1'] },
    });
    expect(JSON.stringify(where)).not.toContain('CONFIRMED');
    expect(where.receivedAt).toEqual({
      gte: new Date('2026-08-01T00:00:00.000Z'),
      lt: new Date('2026-09-01T00:00:00.000Z'),
    });
  });

  it('keeps an explicit period and lets the outstanding queue include older pending receipts', () => {
    const period = momoConfirmationPaymentWhere({
      businessId: 'biz-1',
      branchIds: null,
      periodStart: new Date('2026-09-06T00:00:00.000Z'),
      periodEndExclusive: new Date('2026-10-07T00:00:00.000Z'),
      status: 'PENDING_MANUAL',
      saleStatus: 'ALL',
      cashierUserId: 'ALL',
      receiptScope: 'period',
    });
    const outstanding = momoConfirmationPaymentWhere({
      businessId: 'biz-1',
      branchIds: null,
      periodStart: new Date('2026-09-06T00:00:00.000Z'),
      periodEndExclusive: new Date('2026-10-07T00:00:00.000Z'),
      status: 'PENDING_MANUAL',
      saleStatus: 'ALL',
      cashierUserId: 'ALL',
      receiptScope: 'outstanding',
    });
    const recordedAt = new Date('2026-08-01T12:00:00.000Z');
    const periodReceived = period.receivedAt as { gte: Date; lt: Date };
    expect(recordedAt < periodReceived.gte || recordedAt >= periodReceived.lt).toBe(true);
    expect(outstanding.receivedAt).toBeUndefined();
    expect(outstanding.status).toBe('PENDING_MANUAL');
    expect(momoConfirmationReceiptScope(undefined)).toBe('outstanding');
    expect(momoConfirmationReceiptScope({ from: '', to: '' })).toBe('outstanding');
    expect(momoConfirmationReceiptScope({ from: '2026-09-01', to: '2026-10-06' })).toBe('period');
    expect(momoConfirmationReceiptScope({ queue: 'outstanding', from: '2026-09-01' })).toBe('outstanding');
    expect(momoConfirmationDateInputValue('outstanding', '2026-09-07')).toBe('');
    expect(momoConfirmationDateInputValue('period', '2026-09-07')).toBe('2026-09-07');
  });

  it('treats a recorded manual MoMo tender as unpaid until the receipt is confirmed', () => {
    const recorded = {
      paymentStatus: 'PAID',
      totalPence: 18_946_00,
      payments: [{ amountPence: 18_946_00, status: 'PENDING_MANUAL' }],
    };
    expect(receivableDocumentBalance(recorded)).toMatchObject({ paidPence: 0, balancePence: 18_946_00 });
    const confirmed = {
      ...recorded,
      payments: [{ amountPence: 18_946_00, status: 'CONFIRMED' }],
    };
    expect(receivableDocumentBalance(confirmed)).toMatchObject({ paidPence: 18_946_00, balancePence: 0 });
    const window = defaultTenantLocalRange(new Date('2026-10-06T18:00:00.000Z'), 'Africa/Accra', 30);
    const older = new Date('2026-08-07T12:00:00.000Z');
    expect(older < window.startInclusive).toBe(true);
  });

  it('ALL status filter uses notIn classified statuses (same as unverified metric)', () => {
    const where = momoConfirmationPaymentWhere({
      businessId: 'biz-1',
      branchIds: null,
      periodStart: new Date('2026-08-01T00:00:00.000Z'),
      periodEndExclusive: new Date('2026-09-01T00:00:00.000Z'),
      status: 'ALL',
      saleStatus: 'PAID',
      cashierUserId: 'user-1',
    });
    expect(where.status).toEqual({ notIn: [...CLASSIFIED_PAYMENT_STATUSES] });
    expect(where.salesInvoice).toMatchObject({
      businessId: 'biz-1',
      paymentStatus: 'PAID',
      cashierUserId: 'user-1',
    });
  });
});

describe('MoMo confirmation review — access', () => {
  it('allows Owner and Manager', () => {
    for (const role of ['OWNER', 'MANAGER'] as const) {
      const access = resolveMoneyReceivedAccess({
        actor: { role, businessId: 'biz-1' },
        authorisedStoreIds: ['s1'],
        requestedStoreId: 'ALL',
      });
      expect(access.ok).toBe(true);
    }
  });

  it('denies Cashier', () => {
    const access = resolveMoneyReceivedAccess({
      actor: { role: 'CASHIER', businessId: 'biz-1' },
      authorisedStoreIds: ['s1'],
    });
    expect(access.ok).toBe(false);
    if (!access.ok) {
      expect(access.reason).toBe('ROLE_DENIED');
      expect(access.status).toBe(403);
    }
  });
});

describe('MoMo confirmation review — list and export', () => {
  it('lists PENDING_MANUAL rows from the query layer', async () => {
    const receivedAt = new Date('2026-08-10T12:00:00.000Z');
    const findMany = vi.fn().mockResolvedValue([
      {
        id: 'pay-1',
        amountPence: 7600,
        method: 'MOBILE_MONEY',
        status: 'PENDING_MANUAL',
        receiptOrigin: null,
        reference: null,
        network: 'MTN',
        provider: null,
        payerMsisdn: null,
        collectionId: null,
        receivedAt,
        salesInvoiceId: 'inv-1',
        salesInvoice: {
          transactionNumber: 'INV-1',
          paymentStatus: 'PAID',
          storeId: 'store-1',
          store: { name: 'Main' },
          cashierUserId: 'u1',
          cashierUser: { name: 'Ada' },
          customer: { name: 'Customer A' },
        },
      },
    ]);
    const count = vi.fn().mockResolvedValue(1);
    const aggregate = vi.fn().mockResolvedValue({ _sum: { amountPence: 7600 } });
    const db = { salesPayment: { findMany, count, aggregate } } as any;

    const result = await listMomoConfirmationPayments(
      db,
      {
        businessId: 'biz-1',
        branchIds: null,
        periodStart: new Date('2026-08-01T00:00:00.000Z'),
        periodEndExclusive: new Date('2026-09-01T00:00:00.000Z'),
        status: 'PENDING_MANUAL',
        saleStatus: 'ALL',
        cashierUserId: 'ALL',
      },
      1,
      25,
    );

    expect(result.totalCount).toBe(1);
    expect(result.totalAmountPence).toBe(7600);
    expect(result.rows[0]?.status).toBe('PENDING_MANUAL');
    expect(result.rows[0]?.transactionNumber).toBe('INV-1');
    expect(findMany.mock.calls[0][0].where.status).toBe('PENDING_MANUAL');
  });

  it('export streams COMPLETE_STREAM and scoped rows without silent truncation marker', async () => {
    const receivedAt = new Date('2026-08-10T12:00:00.000Z');
    const findMany = vi
      .fn()
      .mockResolvedValueOnce([
        {
          id: 'pay-1',
          amountPence: 5000,
          method: 'MOBILE_MONEY',
          status: 'PENDING_MANUAL',
          receiptOrigin: null,
          reference: null,
          network: null,
          provider: null,
          payerMsisdn: null,
          collectionId: null,
          receivedAt,
          salesInvoiceId: 'inv-1',
          salesInvoice: {
            transactionNumber: 'INV-1',
            paymentStatus: 'PAID',
            storeId: 'store-1',
            store: { name: 'Main' },
            cashierUserId: 'u1',
            cashierUser: { name: 'Ada' },
            customer: null,
          },
        },
      ])
      .mockResolvedValueOnce([]);
    const db = { salesPayment: { findMany } } as any;

    let csv = '';
    for await (const chunk of iterMomoConfirmationExportCsvChunks(
      db,
      {
        businessId: 'biz-1',
        branchIds: ['store-1'],
        periodStart: new Date('2026-08-01T00:00:00.000Z'),
        periodEndExclusive: new Date('2026-09-01T00:00:00.000Z'),
        status: 'PENDING_MANUAL',
        saleStatus: 'ALL',
        cashierUserId: 'ALL',
      },
      { pageSize: 100 },
    )) {
      csv += chunk;
    }

    expect(csv).toContain('COMPLETE_STREAM');
    expect(csv).toContain('MoMo Confirmation Review');
    expect(csv).toContain('pay-1');
    expect(csv).toContain('not included in Money Received');
    expect(csv).not.toContain('PARTIAL_EXPORT_CAP');
    expect(findMany.mock.calls[0][0].where.salesInvoice.businessId).toBe('biz-1');
    expect(findMany.mock.calls[0][0].where.salesInvoice.storeId).toEqual({ in: ['store-1'] });
  });
});

describe('MoMo confirmation review — surface wiring', () => {
  it('wires page, export route, nav, and Money Received deep link', () => {
    const root = process.cwd();
    const page = readFileSync(join(root, 'app/(protected)/reports/momo-confirmation/page.tsx'), 'utf8');
    const exportRoute = readFileSync(
      join(root, 'app/(protected)/exports/momo-confirmation/route.ts'),
      'utf8',
    );
    const moneyPage = readFileSync(
      join(root, 'app/(protected)/reports/money-received/page.tsx'),
      'utf8',
    );
    const nav = readFileSync(join(root, 'lib/reports/today/stage3a-nav.ts'), 'utf8');

    expect(page).toContain('MoMo Confirmation Review');
    expect(page).toContain("surfaceId: 'momo_confirmation'");
    expect(page).toContain('MomoConfirmDrawer');
    expect(page).not.toContain('Mark verified');
    expect(page).not.toContain('Approve');
    expect(page).not.toContain('read-only report yet');
    expect(exportRoute).toContain('COMPLETE_STREAM');
    expect(exportRoute).toContain('iterMomoConfirmationExportCsvChunks');
    expect(moneyPage).toContain('/reports/momo-confirmation');
    expect(moneyPage).toContain('Needs MoMo confirmation');
    expect(nav).toContain("/reports/momo-confirmation");
  });
});
