import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NEGATIVE_ACTUAL_CASH_MSG } from '@/lib/services/shifts';
import { MISSING_STORE_CONTEXT_MSG, STORE_MISMATCH_MSG } from '@/lib/reliability/selected-store';

const performShiftCloseMock = vi.fn();
const verifyManagerPinMock = vi.fn();
const withBusinessContextMock = vi.fn();
const findFirstMock = vi.fn();
const findUniqueMock = vi.fn();
const bcryptCompareMock = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    shift: { findFirst: (...args: unknown[]) => findFirstMock(...args) },
    user: { findUnique: (...args: unknown[]) => findUniqueMock(...args) },
  },
}));
vi.mock('@/lib/action-utils', async () => {
  const actual = await vi.importActual<typeof import('@/lib/action-utils')>('@/lib/action-utils');
  return {
    ...actual,
    withBusinessContext: (...args: unknown[]) => withBusinessContextMock(...args),
    requireSelectedStoreContext: async () => ({
      user: { id: 'owner-1', name: 'Owner', role: 'OWNER', email: 'owner@test', businessId: 'biz-1' },
      businessId: 'biz-1',
      storeId: 'store-b',
    }),
  };
});
vi.mock('@/lib/services/shifts', async () => {
  const actual = await vi.importActual<typeof import('@/lib/services/shifts')>('@/lib/services/shifts');
  return {
    ...actual,
    performShiftClose: (...args: unknown[]) => performShiftCloseMock(...args),
  };
});
vi.mock('@/lib/security/pin', () => ({
  verifyManagerPin: (...args: unknown[]) => verifyManagerPinMock(...args),
}));
vi.mock('@/lib/audit', () => ({ audit: vi.fn() }));
vi.mock('@/lib/observability', () => ({
  measureServerOperation: (_name: string, callback: () => unknown) => callback(),
  PERFORMANCE_THRESHOLDS_MS: { action: 1000, route: 1000 },
  appLog: vi.fn(),
}));
vi.mock('@/app/actions/stock-alerts', () => ({ sendCashVarianceAlert: vi.fn() }));
vi.mock('@/lib/reports/cache-revalidation', () => ({ revalidateOwnerDashboardCache: vi.fn() }));
vi.mock('@/lib/cache/pos-tags', () => ({ revalidatePosTillShiftTags: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock('bcryptjs', () => ({
  default: { compare: (...args: unknown[]) => bcryptCompareMock(...args) },
}));

function closeForm(overrides: Record<string, string> = {}) {
  const form = new FormData();
  form.set('shiftId', 'shift-1');
  form.set('storeId', 'store-b');
  form.set('actualCash', '-2.50');
  form.set('managerPin', '1234');
  form.set('varianceReasonCode', 'MISSING_CASH');
  form.set('varianceReason', 'counted short');
  for (const [key, value] of Object.entries(overrides)) form.set(key, value);
  return form;
}

describe('close shift actions reject negative counted cash', () => {
  beforeEach(() => {
    performShiftCloseMock.mockReset();
    verifyManagerPinMock.mockReset();
    findFirstMock.mockReset();
    findUniqueMock.mockReset();
    bcryptCompareMock.mockReset();
    withBusinessContextMock.mockResolvedValue({
      user: { id: 'owner-1', name: 'Owner', role: 'OWNER' },
      businessId: 'biz-1',
    });
    findFirstMock.mockResolvedValue({ till: { storeId: 'store-b' } });
    verifyManagerPinMock.mockResolvedValue({ id: 'mgr-1', role: 'MANAGER' });
    findUniqueMock.mockResolvedValue({ passwordHash: 'hash' });
    bcryptCompareMock.mockResolvedValue(true);
  });

  it('rejects the normal close action without writing', async () => {
    const { closeShiftAction } = await import('./shifts');
    const result = await closeShiftAction(closeForm());
    expect(result).toEqual({ success: false, error: NEGATIVE_ACTUAL_CASH_MSG });
    expect(performShiftCloseMock).not.toHaveBeenCalled();
    expect(verifyManagerPinMock).not.toHaveBeenCalled();
  });

  it('rejects the owner-override close action without writing', async () => {
    const { closeShiftOwnerOverrideAction } = await import('./shifts');
    const result = await closeShiftOwnerOverrideAction(
      closeForm({
        ownerPassword: 'secret',
        overrideReasonCode: 'EMERGENCY_CLOSE',
        overrideJustification: 'Need to close now',
      }),
    );
    expect(result).toEqual({ success: false, error: NEGATIVE_ACTUAL_CASH_MSG });
    expect(performShiftCloseMock).not.toHaveBeenCalled();
    expect(bcryptCompareMock).not.toHaveBeenCalled();
  });

  it('rejects a replayed negative close on both actions', async () => {
    const { closeShiftAction, closeShiftOwnerOverrideAction } = await import('./shifts');
    const form = closeForm();
    expect(await closeShiftAction(form)).toEqual({ success: false, error: NEGATIVE_ACTUAL_CASH_MSG });
    expect(await closeShiftAction(form)).toEqual({ success: false, error: NEGATIVE_ACTUAL_CASH_MSG });
    expect(
      await closeShiftOwnerOverrideAction(
        closeForm({
          ownerPassword: 'secret',
          overrideReasonCode: 'EMERGENCY_CLOSE',
          overrideJustification: 'Need to close now',
        }),
      ),
    ).toEqual({ success: false, error: NEGATIVE_ACTUAL_CASH_MSG });
    expect(performShiftCloseMock).not.toHaveBeenCalled();
  });

  it('fails closed when store identity is omitted or mismatched', async () => {
    const { closeShiftAction } = await import('./shifts');
    const missing = closeForm({ actualCash: '10.00' });
    missing.set('storeId', '');
    expect(await closeShiftAction(missing)).toEqual({
      success: false,
      error: MISSING_STORE_CONTEXT_MSG,
    });

    findFirstMock.mockResolvedValue({ till: { storeId: 'store-a' } });
    expect(await closeShiftAction(closeForm({ actualCash: '10.00' }))).toEqual({
      success: false,
      error: STORE_MISMATCH_MSG,
    });
    expect(performShiftCloseMock).not.toHaveBeenCalled();
  });

  it('fails closed when the manager PIN is omitted or wrong', async () => {
    const { closeShiftAction } = await import('./shifts');
    expect(await closeShiftAction(closeForm({ actualCash: '10.00', managerPin: '' }))).toEqual({
      success: false,
      error: 'Manager PIN is required to close till.',
    });
    verifyManagerPinMock.mockResolvedValue(null);
    expect(await closeShiftAction(closeForm({ actualCash: '10.00', managerPin: '0000' }))).toEqual({
      success: false,
      error: 'Invalid manager PIN.',
    });
    expect(performShiftCloseMock).not.toHaveBeenCalled();
  });
});
