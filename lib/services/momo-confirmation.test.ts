import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { computeMoneyReceivedMetrics, isUnverifiedLegacyStatus } from '@/lib/reports/money-received/compute';
import { CONFIRMED_PAYMENT_STATUS } from '@/lib/reports/money-received/types';
import type { ReportingScopeContext } from '@/lib/reports/money-received/types';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    salesPayment: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
    salesInvoice: {
      update: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock('@/lib/prisma', () => ({
  prisma: prismaMock,
}));

vi.mock('@/lib/accounting', () => ({
  postJournalEntry: vi.fn(),
}));

vi.mock('@/lib/services/cash-drawer', () => ({
  recordCashDrawerEntryTx: vi.fn(),
}));

import {
  confirmMomoPayment,
  isManualMomoConfirmableStatus,
  MomoConfirmError,
  MOMO_CONFIRM_ERROR,
} from './momo-confirmation';

const receivedAt = new Date('2026-07-15T10:30:00.000Z');

function makePayment(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pay-1',
    status: 'PENDING_MANUAL',
    method: 'MOBILE_MONEY',
    amountPence: 7600,
    receivedAt,
    reference: null,
    receiptOrigin: 'RECEIVED_AT_SALE',
    collectionId: null,
    branchId: 'store-1',
    network: 'MTN',
    provider: null,
    salesInvoiceId: 'inv-1',
    salesInvoice: {
      id: 'inv-1',
      businessId: 'biz-1',
      storeId: 'store-1',
      paymentStatus: 'PAID',
      transactionNumber: 'INV-000001',
    },
    collection: null,
    ...overrides,
  };
}

const ownerActor = {
  userId: 'user-owner',
  userName: 'Ama Owner',
  userRole: 'OWNER',
  businessId: 'biz-1',
};

const managerActor = {
  ...ownerActor,
  userId: 'user-mgr',
  userName: 'Kofi Manager',
  userRole: 'MANAGER',
};

function confirmInput(overrides: Record<string, unknown> = {}) {
  return {
    paymentId: 'pay-1',
    reference: 'MTN-TXN-9988',
    note: 'Matched MTN statement 15 Jul',
    actor: ownerActor,
    authorisedStoreIds: ['store-1', 'store-2'],
    ...overrides,
  };
}

const periodScope: ReportingScopeContext = {
  businessId: 'biz-1',
  branchIds: null,
  currency: 'GHS',
  timeZone: 'Africa/Accra',
  periodStart: new Date('2026-07-01T00:00:00.000Z'),
  periodEndExclusive: new Date('2026-08-01T00:00:00.000Z'),
  asOf: new Date('2026-08-13T12:00:00.000Z'),
  definitionVersion: 'tf-rc/3R.4R-phase1-money-received',
};

describe('isManualMomoConfirmableStatus', () => {
  it('allows PENDING_MANUAL and other unclassified statuses', () => {
    expect(isManualMomoConfirmableStatus('PENDING_MANUAL')).toBe(true);
    expect(isManualMomoConfirmableStatus('LEGACY_RAW')).toBe(true);
    expect(isUnverifiedLegacyStatus('PENDING_MANUAL')).toBe(true);
  });

  it('rejects classified statuses', () => {
    expect(isManualMomoConfirmableStatus('CONFIRMED')).toBe(false);
    expect(isManualMomoConfirmableStatus('FAILED')).toBe(false);
    expect(isManualMomoConfirmableStatus('PENDING')).toBe(false);
  });
});

describe('confirmMomoPayment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation(async (callback: any) => callback(prismaMock));
    prismaMock.auditLog.create.mockResolvedValue({ id: 'audit-1' });
    prismaMock.salesPayment.updateMany.mockResolvedValue({ count: 1 });
  });

  it('Owner can confirm PENDING_MANUAL and writes AuditLog in the same transaction', async () => {
    prismaMock.salesPayment.findUnique.mockResolvedValue(makePayment());

    const result = await confirmMomoPayment(confirmInput());

    expect(result.alreadyConfirmed).toBe(false);
    expect(result.status).toBe(CONFIRMED_PAYMENT_STATUS);
    expect(result.receivedAt).toEqual(receivedAt);
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.salesPayment.updateMany).toHaveBeenCalledWith({
      where: { id: 'pay-1', status: 'PENDING_MANUAL' },
      data: { status: 'CONFIRMED', reference: 'MTN-TXN-9988' },
    });
    expect(prismaMock.auditLog.create).toHaveBeenCalledTimes(1);
    const audit = prismaMock.auditLog.create.mock.calls[0][0].data;
    expect(audit.action).toBe('MOMO_PAYMENT_CONFIRM');
    expect(audit.entityId).toBe('pay-1');
    expect(audit.reason).toBe('Matched MTN statement 15 Jul');
    expect(audit.userId).toBe('user-owner');
    expect(JSON.parse(audit.beforeState).status).toBe('PENDING_MANUAL');
    expect(JSON.parse(audit.afterState).status).toBe('CONFIRMED');
    expect(JSON.parse(audit.afterState).receivedAt).toBe(receivedAt.toISOString());
    const details = JSON.parse(audit.details);
    expect(details.salesInvoiceId).toBe('inv-1');
    expect(details.amountPence).toBe(7600);
    expect(details.providerReference).toBe('MTN-TXN-9988');
    expect(details.confirmedByUserId).toBe('user-owner');
    expect(details.originalReceivedAt).toBe(receivedAt.toISOString());
    expect(details.confirmedAt).toBeTruthy();
  });

  it('Manager can confirm PENDING_MANUAL', async () => {
    prismaMock.salesPayment.findUnique.mockResolvedValue(makePayment());

    const result = await confirmMomoPayment(confirmInput({ actor: managerActor }));

    expect(result.alreadyConfirmed).toBe(false);
    expect(prismaMock.auditLog.create.mock.calls[0][0].data.userRole).toBe('MANAGER');
  });

  it('Cashier is denied', async () => {
    await expect(
      confirmMomoPayment(
        confirmInput({
          actor: { ...ownerActor, userRole: 'CASHIER' },
        }),
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', message: MOMO_CONFIRM_ERROR.FORBIDDEN });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(prismaMock.salesPayment.updateMany).not.toHaveBeenCalled();
  });

  it('cross-tenant payment is denied', async () => {
    prismaMock.salesPayment.findUnique.mockResolvedValue(
      makePayment({
        salesInvoice: {
          id: 'inv-x',
          businessId: 'biz-other',
          storeId: 'store-1',
          paymentStatus: 'PAID',
          transactionNumber: 'INV-X',
        },
      }),
    );

    await expect(confirmMomoPayment(confirmInput())).rejects.toMatchObject({ code: 'TENANT' });
    expect(prismaMock.salesPayment.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.auditLog.create).not.toHaveBeenCalled();
  });

  it('unauthorised branch is denied', async () => {
    prismaMock.salesPayment.findUnique.mockResolvedValue(makePayment());

    await expect(
      confirmMomoPayment(confirmInput({ authorisedStoreIds: ['store-2'] })),
    ).rejects.toMatchObject({ code: 'BRANCH' });
    expect(prismaMock.salesPayment.updateMany).not.toHaveBeenCalled();
  });

  it.each(['RETURNED', 'VOID'] as const)('blocks parent sale %s', async (paymentStatus) => {
    prismaMock.salesPayment.findUnique.mockResolvedValue(
      makePayment({
        salesInvoice: {
          id: 'inv-1',
          businessId: 'biz-1',
          storeId: 'store-1',
          paymentStatus,
          transactionNumber: 'INV-000001',
        },
      }),
    );

    await expect(confirmMomoPayment(confirmInput())).rejects.toMatchObject({
      code: 'PARENT_RETURNED_VOID',
    });
    expect(prismaMock.salesPayment.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.auditLog.create).not.toHaveBeenCalled();
  });

  it('already CONFIRMED is idempotent without a second audit write', async () => {
    prismaMock.salesPayment.findUnique.mockResolvedValue(makePayment({ status: 'CONFIRMED', reference: 'EXISTING' }));

    const result = await confirmMomoPayment(confirmInput());

    expect(result.alreadyConfirmed).toBe(true);
    expect(result.status).toBe('CONFIRMED');
    expect(result.receivedAt).toEqual(receivedAt);
    expect(prismaMock.salesPayment.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.auditLog.create).not.toHaveBeenCalled();
  });

  it('requires a provider/statement reference', async () => {
    await expect(confirmMomoPayment(confirmInput({ reference: '  ' }))).rejects.toMatchObject({
      code: 'REFERENCE_REQUIRED',
    });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('requires a confirmation note', async () => {
    await expect(confirmMomoPayment(confirmInput({ note: 'ab' }))).rejects.toMatchObject({
      code: 'NOTE_REQUIRED',
    });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('blocks non-confirmable statuses', async () => {
    prismaMock.salesPayment.findUnique.mockResolvedValue(makePayment({ status: 'FAILED' }));

    await expect(confirmMomoPayment(confirmInput())).rejects.toBeInstanceOf(MomoConfirmError);
    await expect(confirmMomoPayment(confirmInput())).rejects.toMatchObject({ code: 'STATUS' });
  });

  it('blocks non-MoMo methods', async () => {
    prismaMock.salesPayment.findUnique.mockResolvedValue(makePayment({ method: 'CASH' }));

    await expect(confirmMomoPayment(confirmInput())).rejects.toMatchObject({ code: 'METHOD' });
  });

  it('blocks provider-confirmed collections', async () => {
    prismaMock.salesPayment.findUnique.mockResolvedValue(
      makePayment({
        collectionId: 'col-1',
        collection: { id: 'col-1', status: 'CONFIRMED' },
      }),
    );

    await expect(confirmMomoPayment(confirmInput())).rejects.toMatchObject({
      code: 'PROVIDER_CONFIRMED',
    });
  });

  it('does not overwrite an existing reference', async () => {
    prismaMock.salesPayment.findUnique.mockResolvedValue(makePayment({ reference: 'POS-REF-1' }));

    await confirmMomoPayment(confirmInput());

    expect(prismaMock.salesPayment.updateMany).toHaveBeenCalledWith({
      where: { id: 'pay-1', status: 'PENDING_MANUAL' },
      data: { status: 'CONFIRMED' },
    });
  });

  it('does not change receivedAt, invoice, GL, or cash drawer', async () => {
    prismaMock.salesPayment.findUnique.mockResolvedValue(makePayment());

    await confirmMomoPayment(confirmInput());

    const updateData = prismaMock.salesPayment.updateMany.mock.calls[0][0].data;
    expect(updateData).not.toHaveProperty('receivedAt');
    expect(updateData).not.toHaveProperty('receiptOrigin');
    expect(prismaMock.salesInvoice.update).not.toHaveBeenCalled();

    const serviceSrc = readFileSync(join(process.cwd(), 'lib/services/momo-confirmation.ts'), 'utf8');
    expect(serviceSrc).not.toContain('postJournalEntry');
    expect(serviceSrc).not.toContain('recordCashDrawerEntryTx');
    expect(serviceSrc).not.toContain("from '@/lib/audit'");
    expect(serviceSrc).toContain('tx.auditLog.create');
  });

  it('Money Received existing compute includes the payment only after CONFIRMED', () => {
    const pendingFact = {
      id: 'pay-1',
      amountPence: 7600,
      method: 'MOBILE_MONEY',
      status: 'PENDING_MANUAL',
      receivedAt,
      salesInvoiceId: 'inv-1',
      branchId: 'store-1',
    };
    const confirmedFact = { ...pendingFact, status: CONFIRMED_PAYMENT_STATUS };

    const before = computeMoneyReceivedMetrics({ receipts: [pendingFact], refunds: [] }, periodScope);
    const after = computeMoneyReceivedMetrics({ receipts: [confirmedFact], refunds: [] }, periodScope);

    const moneyBefore = before.find((m) => m.metricId === 'money_received');
    const unverifiedBefore = before.find((m) => m.metricId === 'unverified_legacy_receipts');
    const moneyAfter = after.find((m) => m.metricId === 'money_received');
    const unverifiedAfter = after.find((m) => m.metricId === 'unverified_legacy_receipts');

    expect(moneyBefore?.valuePence).toBe(0);
    expect(unverifiedBefore?.valuePence).toBe(7600);
    expect(moneyAfter?.valuePence).toBe(7600);
    expect(unverifiedAfter?.valuePence).toBe(0);
  });
});

describe('confirm action and UI wiring', () => {
  it('gates the server action to Owner/Manager and uses the transactional service', () => {
    const action = readFileSync(join(process.cwd(), 'app/actions/momo-confirmation.ts'), 'utf8');
    expect(action).toContain("withBusinessContext(['OWNER', 'MANAGER'])");
    expect(action).toContain('confirmMomoPayment');
    expect(action).not.toContain("from '@/lib/audit'");
  });

  it('review page offers Review and Confirm MoMo payment without bulk or reject', () => {
    const page = readFileSync(join(process.cwd(), 'app/(protected)/reports/momo-confirmation/page.tsx'), 'utf8');
    const drawer = readFileSync(
      join(process.cwd(), 'app/(protected)/reports/momo-confirmation/MomoConfirmDrawer.tsx'),
      'utf8',
    );
    expect(page).toContain('MomoConfirmDrawer');
    expect(page).toContain('original payment date');
    expect(drawer).toContain('Review');
    expect(drawer).toContain('Confirm MoMo payment');
    expect(drawer).toContain('not a new receipt');
    expect(drawer).toContain('original payment date');
    expect(drawer).not.toContain('Confirm all');
    expect(drawer).not.toContain('Reject');
    expect(drawer).not.toContain('Mark duplicate');
  });
});
