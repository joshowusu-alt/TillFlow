import { afterEach, describe, expect, it } from 'vitest';
import { isInventoryIncreasePhase2Enabled } from './inventory-increase-flag';

describe('isInventoryIncreasePhase2Enabled', () => {
  const previous = process.env.TILLFLOW_INVENTORY_ADJUST_PHASE2_INCREASE;

  afterEach(() => {
    if (previous === undefined) delete process.env.TILLFLOW_INVENTORY_ADJUST_PHASE2_INCREASE;
    else process.env.TILLFLOW_INVENTORY_ADJUST_PHASE2_INCREASE = previous;
  });

  it('is enabled only when env is exactly 1', () => {
    expect(isInventoryIncreasePhase2Enabled({} as unknown as NodeJS.ProcessEnv)).toBe(false);
    expect(
      isInventoryIncreasePhase2Enabled({
        TILLFLOW_INVENTORY_ADJUST_PHASE2_INCREASE: '0',
      } as unknown as NodeJS.ProcessEnv),
    ).toBe(false);
    expect(
      isInventoryIncreasePhase2Enabled({
        TILLFLOW_INVENTORY_ADJUST_PHASE2_INCREASE: '1',
      } as unknown as NodeJS.ProcessEnv),
    ).toBe(true);
  });
});
