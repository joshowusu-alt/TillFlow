import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  prismaMock,
  reserveNextDocumentNumberMock,
} = vi.hoisted(() => ({
  prismaMock: {
    $transaction: vi.fn(),
    cashVarianceInvestigation: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    auditLog: { create: vi.fn() },
    user: { findFirst: vi.fn() },
    shift: { findFirst: vi.fn(), create: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
    till: { findFirst: vi.fn() },
    businessSequence: { update: vi.fn(), create: vi.fn(), upsert: vi.fn().mockResolvedValue({ nextVal: 1 }) },
  },
  reserveNextDocumentNumberMock: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('@/lib/services/document-numbers', () => ({
  reserveNextDocumentNumber: reserveNextDocumentNumberMock,
}));

import {
  approveCashVariance,
  assignCashVarianceReviewer,
  createCashVarianceInvestigationTx,
  explainCashVariance,
  resolveCashVariance,
} from './cash-variance';

const ACTOR = { userId: 'owner-1', userName: 'Owner', userRole: 'OWNER' };

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.$transaction.mockImplementation(async (cb: any) => cb(prismaMock));
  reserveNextDocumentNumberMock.mockResolvedValue('VAR-000001');
  prismaMock.auditLog.create.mockResolvedValue({ id: 'audit-1' });
});

describe('cash variance investigation', () => {
  it('does not rewrite counted or expected cash in the variance service', () => {
    const source = readFileSync(join(process.cwd(), 'lib/services/cash-variance.ts'), 'utf8');
    expect(source).not.toMatch(/\bactualCashPence\b/);
    expect(source).not.toMatch(/\bexpectedCashPence\b/);
    expect(source).not.toMatch(/shift\.(update|updateMany)/);
  });

  it('creates an OPEN investigation with a VAR number and variance snapshot', async () => {
    prismaMock.cashVarianceInvestigation.create.mockResolvedValue({
      id: 'var-1',
      variancePence: -500,
      status: 'OPEN',
      transactionNumber: 'VAR-000001',
    });

    const created = await createCashVarianceInvestigationTx(prismaMock as never, {
      businessId: 'biz-1',
      shiftId: 'shift-1',
      variancePence: -500,
      cashierExplanation: 'Short at close',
      actor: ACTOR,
    });

    expect(created).toMatchObject({
      id: 'var-1',
      variancePence: -500,
      status: 'OPEN',
      transactionNumber: 'VAR-000001',
    });
    expect(reserveNextDocumentNumberMock).toHaveBeenCalledWith(prismaMock, 'biz-1', 'cash_variance');
    expect(prismaMock.cashVarianceInvestigation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          shiftId: 'shift-1',
          status: 'OPEN',
          variancePence: -500,
          transactionNumber: 'VAR-000001',
        }),
      }),
    );
    expect(prismaMock.shift.update).not.toHaveBeenCalled();
    expect(prismaMock.shift.updateMany).not.toHaveBeenCalled();
  });

  it('skips investigation when variance is zero', async () => {
    await expect(
      createCashVarianceInvestigationTx(prismaMock as never, {
        businessId: 'biz-1',
        shiftId: 'shift-1',
        variancePence: 0,
        actor: ACTOR,
      }),
    ).resolves.toBeNull();
    expect(prismaMock.cashVarianceInvestigation.create).not.toHaveBeenCalled();
  });

  it('replays an existing investigation on shiftId unique without rewriting the snapshot', async () => {
    prismaMock.cashVarianceInvestigation.create.mockRejectedValue({
      code: 'P2002',
      meta: { target: ['shiftId'] },
    });
    prismaMock.cashVarianceInvestigation.findUnique.mockResolvedValue({
      id: 'var-existing',
      variancePence: -500,
      status: 'ASSIGNED',
      transactionNumber: 'VAR-000001',
    });

    const existing = await createCashVarianceInvestigationTx(prismaMock as never, {
      businessId: 'biz-1',
      shiftId: 'shift-1',
      variancePence: -9999,
      actor: ACTOR,
    });

    expect(existing).toMatchObject({ id: 'var-existing', variancePence: -500 });
    expect(prismaMock.cashVarianceInvestigation.update).not.toHaveBeenCalled();
  });

  it('assign / explain / resolve / approve never touch shift cash columns', async () => {
    prismaMock.cashVarianceInvestigation.findFirst.mockResolvedValue({
      id: 'var-1',
      businessId: 'biz-1',
      shiftId: 'shift-1',
      status: 'OPEN',
      variancePence: -500,
      cashierExplanation: null,
      evidencePath: null,
      managerResolution: null,
      assignedReviewerUserId: null,
      approvedByUserId: null,
      approvedAt: null,
      transactionNumber: 'VAR-000001',
    });
    prismaMock.user.findFirst.mockResolvedValue({
      id: 'mgr-1',
      role: 'MANAGER',
      name: 'Manager',
      businessId: 'biz-1',
    });
    prismaMock.shift.findFirst.mockResolvedValue({ id: 'shift-1', userId: 'cashier-1' });
    prismaMock.cashVarianceInvestigation.update.mockResolvedValue({
      id: 'var-1',
      status: 'ASSIGNED',
      variancePence: -500,
    });

    await assignCashVarianceReviewer({
      businessId: 'biz-1',
      investigationId: 'var-1',
      reviewerUserId: 'mgr-1',
      actor: ACTOR,
    });

    prismaMock.cashVarianceInvestigation.findFirst.mockResolvedValue({
      id: 'var-1',
      businessId: 'biz-1',
      shiftId: 'shift-1',
      status: 'ASSIGNED',
      variancePence: -500,
      cashierExplanation: null,
      evidencePath: null,
      managerResolution: null,
      assignedReviewerUserId: 'mgr-1',
      approvedByUserId: null,
      approvedAt: null,
      transactionNumber: 'VAR-000001',
    });
    prismaMock.cashVarianceInvestigation.update.mockResolvedValue({
      id: 'var-1',
      status: 'EXPLAINED',
      variancePence: -500,
    });
    await explainCashVariance({
      businessId: 'biz-1',
      investigationId: 'var-1',
      explanation: 'Miscount then found note',
      evidenceNote: 'Recount sheet in the safe',
      actor: { userId: 'cashier-1', userName: 'Cashier', userRole: 'CASHIER' },
    });

    prismaMock.cashVarianceInvestigation.findFirst.mockResolvedValue({
      id: 'var-1',
      businessId: 'biz-1',
      shiftId: 'shift-1',
      status: 'EXPLAINED',
      variancePence: -500,
      cashierExplanation: 'Miscount then found note',
      evidencePath: 'Recount sheet in the safe',
      managerResolution: null,
      assignedReviewerUserId: 'mgr-1',
      approvedByUserId: null,
      approvedAt: null,
      transactionNumber: 'VAR-000001',
    });
    prismaMock.cashVarianceInvestigation.update.mockResolvedValue({
      id: 'var-1',
      status: 'RESOLVED',
      variancePence: -500,
    });
    await resolveCashVariance({
      businessId: 'biz-1',
      investigationId: 'var-1',
      resolution: 'Accepted as count error',
      actor: { userId: 'mgr-1', userName: 'Manager', userRole: 'MANAGER' },
    });

    prismaMock.cashVarianceInvestigation.findFirst.mockResolvedValue({
      id: 'var-1',
      businessId: 'biz-1',
      shiftId: 'shift-1',
      status: 'RESOLVED',
      variancePence: -500,
      cashierExplanation: 'Miscount then found note',
      evidencePath: 'Recount sheet in the safe',
      managerResolution: 'Accepted as count error',
      assignedReviewerUserId: 'mgr-1',
      approvedByUserId: null,
      approvedAt: null,
      transactionNumber: 'VAR-000001',
    });
    prismaMock.cashVarianceInvestigation.update.mockResolvedValue({
      id: 'var-1',
      status: 'APPROVED',
      variancePence: -500,
    });
    await approveCashVariance({
      businessId: 'biz-1',
      investigationId: 'var-1',
      actor: ACTOR,
    });

    expect(prismaMock.shift.update).not.toHaveBeenCalled();
    expect(prismaMock.shift.updateMany).not.toHaveBeenCalled();
    const updatePayloads = prismaMock.cashVarianceInvestigation.update.mock.calls.map((call: any) => call[0].data);
    for (const data of updatePayloads) {
      expect(data).not.toHaveProperty('variancePence');
      expect(data).not.toHaveProperty('actualCashPence');
      expect(data).not.toHaveProperty('expectedCashPence');
    }
  });
});
