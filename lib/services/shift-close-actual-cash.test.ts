import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NEGATIVE_ACTUAL_CASH_MSG, performShiftClose } from './shifts';

vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/services/risk-monitor', () => ({ detectCashVarianceRisk: vi.fn() }));
vi.mock('@/lib/audit', () => ({ audit: vi.fn() }));
vi.mock('@/lib/observability', () => ({
  measureServerOperation: (_name: string, callback: () => unknown) => callback(),
  PERFORMANCE_THRESHOLDS_MS: { action: 1000 },
}));
vi.mock('@/lib/services/cash-drawer', () => ({
  recordCashDrawerEntryTx: vi.fn(),
  summarizeCashDrawerEntries: () => ({ totalPence: 0, byType: {} }),
}));
vi.mock('@/lib/services/document-numbers', () => ({
  reserveNextDocumentNumber: vi.fn().mockResolvedValue('SHC-000001'),
}));
vi.mock('@/lib/services/cash-variance', () => ({
  createCashVarianceInvestigationTx: vi.fn(),
}));

const negativeInput = {
  businessId: 'biz-1',
  actor: { userId: 'mgr-1', userName: 'Manager', userRole: 'MANAGER' },
  shiftId: 'shift-1',
  actualCash: -250,
  notes: 'should not write',
  varianceReasonCode: 'MISSING_CASH',
  varianceReason: 'negative count',
  approval: { mode: 'PIN' as const, approvingManagerId: 'mgr-1' },
};

describe('performShiftClose rejects negative counted cash', () => {
  beforeEach(async () => {
    const { prisma } = await import('@/lib/prisma');
    (prisma as any).shift = { findFirst: vi.fn(), updateMany: vi.fn() };
    (prisma as any).business = { findUnique: vi.fn() };
    (prisma as any).$transaction = vi.fn();
    (prisma as any).$queryRaw = vi.fn();
  });

  it('rejects a direct close before reading or writing the shift', async () => {
    const { prisma } = await import('@/lib/prisma');
    await expect(performShiftClose(negativeInput)).rejects.toThrow(NEGATIVE_ACTUAL_CASH_MSG);
    expect((prisma as any).shift.findFirst).not.toHaveBeenCalled();
    expect((prisma as any).$transaction).not.toHaveBeenCalled();
    expect((prisma as any).shift.updateMany).not.toHaveBeenCalled();
  });

  it('rejects a replayed negative close and still writes nothing', async () => {
    const { prisma } = await import('@/lib/prisma');
    await expect(performShiftClose(negativeInput)).rejects.toThrow(NEGATIVE_ACTUAL_CASH_MSG);
    await expect(performShiftClose(negativeInput)).rejects.toThrow(NEGATIVE_ACTUAL_CASH_MSG);
    expect((prisma as any).$transaction).not.toHaveBeenCalled();
    expect((prisma as any).shift.updateMany).not.toHaveBeenCalled();
  });
});

describe('close actions reject negative counted cash on every entry point', () => {
  const actions = readFileSync(join(process.cwd(), 'app/actions/shifts.ts'), 'utf8');
  const closeAction = actions.split('export async function closeShiftAction')[1] ?? '';
  const overrideAction = actions.split('export async function closeShiftOwnerOverrideAction')[1] ?? '';
  const legacyClose = actions.split('export async function closeTillAction')[1] ?? closeAction;

  it('normal close does not silently clamp negatives with Math.max', () => {
    expect(closeAction).toContain('assertNonNegativeActualCash');
    expect(closeAction).not.toContain('Math.max(0');
  });

  it('owner override does not silently clamp negatives with Math.max', () => {
    expect(overrideAction).toContain('assertNonNegativeActualCash');
    expect(overrideAction).not.toContain('Math.max(0');
  });

  it('legacy/alternative close uses the same non-negative guard', () => {
    expect(legacyClose).toContain('assertNonNegativeActualCash');
    expect(legacyClose).not.toContain('Math.max(0');
  });

  it('authoritative service rejects inside the close transaction path', () => {
    const service = readFileSync(join(process.cwd(), 'lib/services/shifts.ts'), 'utf8');
    expect(service).toContain('assertNonNegativeActualCash(input.actualCash)');
    expect(service).toContain('assertNonNegativeActualCash(actualCash)');
  });
});

describe('cashier self-close rules on locked cash', () => {
  const input = { ...negativeInput, actor: { userId: 'cashier-1', userName: 'Cashier', userRole: 'CASHIER' }, approval: { mode: 'SELF' as const }, varianceReason: null, varianceReasonCode: null };
  beforeEach(async () => {
    const { prisma } = await import('@/lib/prisma');
    const shift = { id: 'shift-1', userId: 'cashier-1', tillId: 'till-1', status: 'OPEN', openedAt: new Date(), openingCashPence: 10000, till: { id: 'till-1', storeId: 'store-1', name: 'Till 1' }, salesInvoices: [], cashDrawerEntries: [{ id: 'entry-1', entryType: 'OPEN_FLOAT', amountPence: 10000, createdAt: new Date() }] };
    (prisma as any).shift = { findFirst: vi.fn().mockResolvedValue(shift), updateMany: vi.fn().mockResolvedValue({ count: 1 }) };
    (prisma as any).business = { findUnique: vi.fn().mockResolvedValue({ varianceReasonRequired: false, shiftCloseApprovalThresholdPence: 5000 }) };
    (prisma as any).$queryRaw = vi.fn();
    (prisma as any).$transaction = vi.fn(async (cb: any) => cb(prisma));
  });
  it.each([10000, 5000, 2000, 0, 12000, 18000])('closes counted %s with SELF and no approver', async (actualCash) => {
    const { prisma } = await import('@/lib/prisma');
    const { createCashVarianceInvestigationTx } = await import('@/lib/services/cash-variance');
    await performShiftClose({ ...input, actualCash, varianceReason: actualCash === 10000 ? null : 'Count checked' });
    expect((prisma as any).shift.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ closeManagerApprovalMode: 'SELF', closeManagerApprovedByUserId: null, variance: actualCash - 10000 }) }));
    expect(JSON.parse((prisma as any).shift.updateMany.mock.calls[0][0].data.closureSnapshotJson)).toMatchObject({ closedBySelf: true });
    expect(createCashVarianceInvestigationTx).toHaveBeenCalledWith(prisma, expect.objectContaining({ variancePence: actualCash - 10000, cashierExplanation: actualCash === 10000 ? null : 'Count checked' }));
  });
  it.each([5000, 2000, 0, 12000, 18000])('requires a reason for counted %s', async (actualCash) => {
    await expect(performShiftClose({ ...input, actualCash })).rejects.toThrow("Please say why the cash doesn't match.");
  });
  it('closes a large shortage from the reason picker alone', async () => {
    await expect(performShiftClose({ ...input, actualCash: 2000, varianceReasonCode: 'MISSING_CASH' })).resolves.toMatchObject({ id: 'shift-1' });
  });
  it('blocks a different cashier', async () => {
    await expect(performShiftClose({ ...input, actualCash: 10000, actor: { ...input.actor, userId: 'other' } })).rejects.toThrow('You can only close your own shift');
  });
  it('does not create another review if the conditional close loses a concurrent race', async () => {
    const { prisma } = await import('@/lib/prisma');
    const { createCashVarianceInvestigationTx } = await import('@/lib/services/cash-variance');
    vi.mocked(createCashVarianceInvestigationTx).mockClear();
    (prisma as any).shift.updateMany.mockResolvedValue({ count: 0 });
    await expect(performShiftClose({ ...input, actualCash: 9000, varianceReason: 'Short' })).rejects.toThrow('already closed');
    expect(createCashVarianceInvestigationTx).not.toHaveBeenCalled();
  });
});
