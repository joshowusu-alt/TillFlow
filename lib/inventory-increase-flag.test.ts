import { afterEach, describe, expect, it } from 'vitest';
import {
  INVENTORY_INCREASE_PHASE2_BUSINESS_IDS_ENV,
  INVENTORY_INCREASE_PHASE2_ROLLOUT_MODE_ENV,
  isInventoryIncreasePhase2BusinessAllowlisted,
  isInventoryIncreasePhase2Enabled,
  isInventoryIncreasePhase2EnabledForBusiness,
  parseInventoryIncreasePhase2BusinessIds,
  parseInventoryIncreasePhase2RolloutMode,
} from './inventory-increase-flag';

const FLAG = 'TILLFLOW_INVENTORY_ADJUST_PHASE2_INCREASE';
const ALLOW = INVENTORY_INCREASE_PHASE2_BUSINESS_IDS_ENV;
const MODE = INVENTORY_INCREASE_PHASE2_ROLLOUT_MODE_ENV;

const BIZ_A = 'cmexamplebiz00000000000001';
const BIZ_B = 'cmexamplebiz00000000000002';
const BIZ_C = 'cmexamplebiz00000000000003';

function env(partial: Record<string, string | undefined>): NodeJS.ProcessEnv {
  return partial as unknown as NodeJS.ProcessEnv;
}

describe('inventory increase Phase 2 flag + rollout mode + allowlist', () => {
  const previousFlag = process.env[FLAG];
  const previousAllow = process.env[ALLOW];
  const previousMode = process.env[MODE];

  afterEach(() => {
    if (previousFlag === undefined) delete process.env[FLAG];
    else process.env[FLAG] = previousFlag;
    if (previousAllow === undefined) delete process.env[ALLOW];
    else process.env[ALLOW] = previousAllow;
    if (previousMode === undefined) delete process.env[MODE];
    else process.env[MODE] = previousMode;
  });

  it('global flag is enabled only when env is exactly 1', () => {
    expect(isInventoryIncreasePhase2Enabled(env({}))).toBe(false);
    expect(isInventoryIncreasePhase2Enabled(env({ [FLAG]: '0' }))).toBe(false);
    expect(isInventoryIncreasePhase2Enabled(env({ [FLAG]: '1' }))).toBe(true);
  });

  it('rollout mode parses only ALLOWLIST and GENERAL (case-insensitive)', () => {
    expect(parseInventoryIncreasePhase2RolloutMode(null)).toBeNull();
    expect(parseInventoryIncreasePhase2RolloutMode('')).toBeNull();
    expect(parseInventoryIncreasePhase2RolloutMode('allowlist')).toBe('ALLOWLIST');
    expect(parseInventoryIncreasePhase2RolloutMode('GENERAL')).toBe('GENERAL');
    expect(parseInventoryIncreasePhase2RolloutMode(' general ')).toBe('GENERAL');
    expect(parseInventoryIncreasePhase2RolloutMode('OPEN')).toBeNull();
    expect(parseInventoryIncreasePhase2RolloutMode('*')).toBeNull();
    expect(parseInventoryIncreasePhase2RolloutMode('1')).toBeNull();
  });

  it('missing configuration fails closed (no eligible businesses)', () => {
    expect(parseInventoryIncreasePhase2BusinessIds(null).size).toBe(0);
    expect(parseInventoryIncreasePhase2BusinessIds(undefined).size).toBe(0);
    expect(parseInventoryIncreasePhase2BusinessIds('').size).toBe(0);
    expect(parseInventoryIncreasePhase2BusinessIds('   ,  ,\t').size).toBe(0);
    // Flag on but no mode → denied
    expect(isInventoryIncreasePhase2EnabledForBusiness(BIZ_A, env({ [FLAG]: '1' }))).toBe(
      false,
    );
    // Flag on + allowlist but no mode → denied (mode is mandatory)
    expect(
      isInventoryIncreasePhase2EnabledForBusiness(
        BIZ_A,
        env({ [FLAG]: '1', [ALLOW]: BIZ_A }),
      ),
    ).toBe(false);
  });

  it('trims whitespace, ignores empty entries, and deduplicates', () => {
    const ids = parseInventoryIncreasePhase2BusinessIds(
      `  ${BIZ_A},,  ${BIZ_B}\n${BIZ_A}\t${BIZ_C}  `,
    );
    expect(ids.size).toBe(3);
    expect(ids.has(BIZ_A)).toBe(true);
    expect(ids.has(BIZ_B)).toBe(true);
    expect(ids.has(BIZ_C)).toBe(true);
  });

  it('ALLOWLIST mode supports multiple exact IDs', () => {
    const e = env({
      [FLAG]: '1',
      [MODE]: 'ALLOWLIST',
      [ALLOW]: `${BIZ_A},${BIZ_B}`,
    });
    expect(isInventoryIncreasePhase2EnabledForBusiness(BIZ_A, e)).toBe(true);
    expect(isInventoryIncreasePhase2EnabledForBusiness(BIZ_B, e)).toBe(true);
    expect(isInventoryIncreasePhase2EnabledForBusiness(BIZ_C, e)).toBe(false);
  });

  it('GENERAL mode permits any non-empty business ID when flag is on', () => {
    const e = env({ [FLAG]: '1', [MODE]: 'GENERAL', [ALLOW]: BIZ_A });
    expect(isInventoryIncreasePhase2EnabledForBusiness(BIZ_A, e)).toBe(true);
    expect(isInventoryIncreasePhase2EnabledForBusiness(BIZ_B, e)).toBe(true);
    expect(isInventoryIncreasePhase2EnabledForBusiness(BIZ_C, e)).toBe(true);
  });

  it('GENERAL mode ignores allowlist contents (allowlist is not required)', () => {
    const e = env({ [FLAG]: '1', [MODE]: 'GENERAL' });
    expect(isInventoryIncreasePhase2EnabledForBusiness(BIZ_A, e)).toBe(true);
    expect(isInventoryIncreasePhase2EnabledForBusiness(BIZ_B, e)).toBe(true);
  });

  it('GENERAL mode still denied when global flag is off', () => {
    const e = env({ [FLAG]: '0', [MODE]: 'GENERAL' });
    expect(isInventoryIncreasePhase2EnabledForBusiness(BIZ_A, e)).toBe(false);
    expect(isInventoryIncreasePhase2EnabledForBusiness(BIZ_A, env({ [MODE]: 'GENERAL' }))).toBe(
      false,
    );
  });

  it('invalid rollout mode fails closed even with flag on and allowlist present', () => {
    for (const bad of ['OPEN', 'ALL', '*', 'true', '1', 'allow', 'generalize', '']) {
      expect(
        isInventoryIncreasePhase2EnabledForBusiness(
          BIZ_A,
          env({ [FLAG]: '1', [MODE]: bad, [ALLOW]: BIZ_A }),
        ),
      ).toBe(false);
    }
  });

  it('rejects wildcard-like allowlist values (never means all businesses)', () => {
    for (const token of ['*', 'all', 'ALL', 'true', 'TRUE', 'yes', '1', 'any', 'global', 'everyone']) {
      const ids = parseInventoryIncreasePhase2BusinessIds(token);
      expect(ids.size).toBe(0);
      expect(
        isInventoryIncreasePhase2EnabledForBusiness(
          BIZ_A,
          env({ [FLAG]: '1', [MODE]: 'ALLOWLIST', [ALLOW]: token }),
        ),
      ).toBe(false);
    }
  });

  it('rejects malformed IDs and free-text labels safely', () => {
    const raw = [
      'TillFlow QA Demo',
      'qa-owner@tillflow.app',
      'example.com',
      'biz*',
      'a',
      '???',
      'Has Space Label',
      'MixedCaseId',
    ].join(',');
    const ids = parseInventoryIncreasePhase2BusinessIds(raw);
    expect(ids.size).toBe(0);
    expect(parseInventoryIncreasePhase2BusinessIds('TillFlow QA Demo').size).toBe(0);
  });

  it('rejects substring collisions (exact match only)', () => {
    const e = env({ [FLAG]: '1', [MODE]: 'ALLOWLIST', [ALLOW]: BIZ_A });
    expect(isInventoryIncreasePhase2BusinessAllowlisted(BIZ_A, e)).toBe(true);
    expect(isInventoryIncreasePhase2BusinessAllowlisted(BIZ_A.slice(0, 12), e)).toBe(false);
    expect(isInventoryIncreasePhase2BusinessAllowlisted(`${BIZ_A}x`, e)).toBe(false);
    expect(isInventoryIncreasePhase2BusinessAllowlisted(`x${BIZ_A}`, e)).toBe(false);
  });

  describe('fail-closed truth table', () => {
    it('flag off + any mode → denied', () => {
      expect(
        isInventoryIncreasePhase2EnabledForBusiness(
          BIZ_A,
          env({ [FLAG]: '0', [MODE]: 'GENERAL' }),
        ),
      ).toBe(false);
      expect(
        isInventoryIncreasePhase2EnabledForBusiness(
          BIZ_A,
          env({ [FLAG]: '0', [MODE]: 'ALLOWLIST', [ALLOW]: BIZ_A }),
        ),
      ).toBe(false);
    });

    it('flag on + mode missing → denied', () => {
      expect(isInventoryIncreasePhase2EnabledForBusiness(BIZ_A, env({ [FLAG]: '1' }))).toBe(
        false,
      );
    });

    it('flag on + ALLOWLIST + empty allowlist → denied', () => {
      expect(
        isInventoryIncreasePhase2EnabledForBusiness(
          BIZ_A,
          env({ [FLAG]: '1', [MODE]: 'ALLOWLIST' }),
        ),
      ).toBe(false);
    });

    it('flag on + ALLOWLIST + different business → denied', () => {
      expect(
        isInventoryIncreasePhase2EnabledForBusiness(
          BIZ_A,
          env({ [FLAG]: '1', [MODE]: 'ALLOWLIST', [ALLOW]: BIZ_B }),
        ),
      ).toBe(false);
    });

    it('flag on + ALLOWLIST + exact business → allowed', () => {
      expect(
        isInventoryIncreasePhase2EnabledForBusiness(
          BIZ_A,
          env({ [FLAG]: '1', [MODE]: 'ALLOWLIST', [ALLOW]: BIZ_A }),
        ),
      ).toBe(true);
    });

    it('flag on + GENERAL → allowed for any business id', () => {
      expect(
        isInventoryIncreasePhase2EnabledForBusiness(
          BIZ_A,
          env({ [FLAG]: '1', [MODE]: 'GENERAL' }),
        ),
      ).toBe(true);
    });
  });

  it('null/empty business ids are never eligible', () => {
    const allowlist = env({ [FLAG]: '1', [MODE]: 'ALLOWLIST', [ALLOW]: BIZ_A });
    const general = env({ [FLAG]: '1', [MODE]: 'GENERAL' });
    for (const e of [allowlist, general]) {
      expect(isInventoryIncreasePhase2EnabledForBusiness(null, e)).toBe(false);
      expect(isInventoryIncreasePhase2EnabledForBusiness('', e)).toBe(false);
      expect(isInventoryIncreasePhase2EnabledForBusiness(undefined, e)).toBe(false);
      expect(isInventoryIncreasePhase2EnabledForBusiness('   ', e)).toBe(false);
    }
  });

  it('keeps wildcard tokens from enabling ALLOWLIST access even when mixed with a valid ID', () => {
    const e = env({
      [FLAG]: '1',
      [MODE]: 'ALLOWLIST',
      [ALLOW]: `*,all,true,${BIZ_A},yes`,
    });
    expect(parseInventoryIncreasePhase2BusinessIds(e[ALLOW]).size).toBe(1);
    expect(isInventoryIncreasePhase2EnabledForBusiness(BIZ_A, e)).toBe(true);
    expect(isInventoryIncreasePhase2EnabledForBusiness(BIZ_B, e)).toBe(false);
  });
});
