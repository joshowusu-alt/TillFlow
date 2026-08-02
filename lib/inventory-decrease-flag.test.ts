import { afterEach, describe, expect, it } from 'vitest';
import { isInventoryDecreasePhase1Enabled } from './inventory-decrease-flag';

describe('isInventoryDecreasePhase1Enabled', () => {
  const previous = process.env.TILLFLOW_INVENTORY_ADJUST_PHASE1;

  afterEach(() => {
    if (previous === undefined) delete process.env.TILLFLOW_INVENTORY_ADJUST_PHASE1;
    else process.env.TILLFLOW_INVENTORY_ADJUST_PHASE1 = previous;
  });

  it('is enabled only when env is exactly 1', () => {
    expect(isInventoryDecreasePhase1Enabled({} as unknown as NodeJS.ProcessEnv)).toBe(false);
    expect(
      isInventoryDecreasePhase1Enabled({
        TILLFLOW_INVENTORY_ADJUST_PHASE1: '0',
      } as unknown as NodeJS.ProcessEnv),
    ).toBe(false);
    expect(
      isInventoryDecreasePhase1Enabled({
        TILLFLOW_INVENTORY_ADJUST_PHASE1: '1',
      } as unknown as NodeJS.ProcessEnv),
    ).toBe(true);
  });
});
