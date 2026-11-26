import { describe, expect, it, vi, beforeEach } from 'vitest';
const mocks = vi.hoisted(() => ({ business: vi.fn(), rows: vi.fn() }));
vi.mock('@/lib/prisma', () => ({ prisma: { business: { findUnique: mocks.business }, cashVarianceInvestigation: { findMany: mocks.rows } } }));
import { getUnreviewedHomeCashDifferences } from './cash-differences';

describe('owner Home unreviewed cash differences', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.business.mockResolvedValue({ shiftCloseApprovalThresholdPence: 5000 });
  });
  it('requests only the current business’s closed, nonzero, unreviewed rows and flags both signs above the cutoff', async () => {
    const date = new Date('2026-11-26T12:00:00Z');
    const shift = { closedAt: date, varianceReasonCode: 'MISSING_CASH', varianceReason: null, user: { name: 'Fictional Cashier' }, till: { store: { id: 'store-b', name: 'Branch B' } } };
    mocks.rows.mockResolvedValue([-8000, 8000, -5000, 5000, -1].map((amount, i) => ({ id: String(i), createdAt: date, variancePence: amount, cashierExplanation: 'MISSING_CASH', shift })));
    const rows = await getUnreviewedHomeCashDifferences('biz');
    expect(mocks.rows).toHaveBeenCalledWith(expect.objectContaining({ where: { businessId: 'biz', reviewedAt: null, status: { notIn: ['APPROVED', 'REVIEWED'] }, variancePence: { not: 0 }, shift: { status: 'CLOSED', till: { store: { businessId: 'biz' } } } } }));
    expect(rows.map(row => row.large)).toEqual([true, true, false, false, false]);
    expect(rows[0]).toMatchObject({ date, cashier: 'Fictional Cashier', reason: 'Missing cash', storeId: 'store-b', variancePence: -8000 });
  });
  it('returns no items when all differences have been reviewed', async () => {
    mocks.rows.mockResolvedValue([]);
    expect(await getUnreviewedHomeCashDifferences('biz')).toEqual([]);
  });
});
