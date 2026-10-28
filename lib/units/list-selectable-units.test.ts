import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ findMany: vi.fn(), findUnique: vi.fn(async () => null) }));
vi.mock('@/lib/prisma', () => ({ prisma: { unit: mocks } }));
import { listSelectableUnits } from './list-selectable-units';
import { SHARED_PIECE_UNIT_ID } from './selectable-units';

beforeEach(() => { vi.clearAllMocks(); });
describe('selectable units database load', () => {
  it('uses two reads per overlapping business burst and preserves canonical/custom selection', async () => {
    const piece = { id: SHARED_PIECE_UNIT_ID, name: 'Piece', pluralName: 'Pieces' };
    const used = { id: 'used-piece', name: 'Piece', pluralName: 'Pieces' };
    const custom = { id: 'custom', name: 'Sleeve', pluralName: 'Sleeves' };
    mocks.findMany.mockImplementation(async ({ where }: any) => where.productUnits ? [used, custom] : [piece, used]);
    const results = await Promise.all(Array.from({ length: 25 }, () => listSelectableUnits('business-a')));
    expect(mocks.findMany).toHaveBeenCalledTimes(2);
    for (const result of results) expect(result).toEqual([used, custom]);
    await listSelectableUnits('business-a');
    expect(mocks.findMany).toHaveBeenCalledTimes(4); // No result cache after completion.
  });
  it('scopes concurrent custom-unit reads to each business', async () => {
    mocks.findMany.mockImplementation(async ({ where }: any) => !where.productUnits ? [] : [{ id: where.productUnits.some.product.businessId, name: 'Custom', pluralName: 'Customs' }]);
    const [a, b] = await Promise.all([listSelectableUnits('a'), listSelectableUnits('b')]);
    expect(a[0].id).toBe('a'); expect(b[0].id).toBe('b');
    expect(mocks.findMany).toHaveBeenCalledTimes(4);
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });
});
