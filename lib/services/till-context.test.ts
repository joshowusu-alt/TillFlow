import { describe, expect, it } from 'vitest';
import { resolvePosTillId } from '@/lib/pos/till-context';

const tills = [
  { id: 'till-1', name: 'Till 1' },
  { id: 'till-2', name: 'Till 2' },
];

describe('POS till context', () => {
  it('prefers an explicitly requested active till with an open shift', () => {
    expect(resolvePosTillId({
      requestedTillId: 'till-2',
      savedTillId: 'till-1',
      tills,
      openShiftTillIds: ['till-1', 'till-2'],
    })).toBe('till-2');
  });

  it('does not allow local storage to select a till without an open shift', () => {
    expect(resolvePosTillId({
      savedTillId: 'till-2',
      tills,
      openShiftTillIds: ['till-1'],
    })).toBe('till-1');
  });

  it('rejects requested inactive or wrong-store tills', () => {
    expect(resolvePosTillId({
      requestedTillId: 'till-other-store',
      tills,
      openShiftTillIds: ['till-other-store'],
    })).toBe('');
  });
});
