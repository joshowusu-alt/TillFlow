import { describe, expect, it } from 'vitest';

/**
 * TEMPORARY P0-A Stage 1 fixture — DO NOT MERGE AS A PRODUCT CHANGE.
 *
 * Purpose: produce a deterministic GitHub `unit` check failure so Stage 2 can
 * prove Vercel Production Deployment Checks withhold canonical aliases.
 *
 * Isolation: assertion-only; no app imports, no DB, no network, no schema.
 * Removal of this file fully restores the unit suite.
 */
describe('P0-A TEMPORARY deployment-checks empirical fixture', () => {
  it('fails deterministically so the unit Deployment Check stays unsatisfied', () => {
    expect(
      false,
      'P0-A TEMPORARY FIXTURE: intentional unit failure for Deployment Check alias-hold proof. Remove this file after Stage 5 cleanup.',
    ).toBe(true);
  });
});
