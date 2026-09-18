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
