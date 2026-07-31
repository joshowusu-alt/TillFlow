import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * TEMPORARY P0-A native-Git negative control — DO NOT MERGE AS A PRODUCT CHANGE.
 *
 * Gate 3 / PR execution: must pass (pull_request is not master push).
 * Post-merge master push: must fail unit so Vercel Deployment Checks can hold
 * Production aliases on the native-Git Production SHA.
 *
 * Activation requires ALL of:
 * - GITHUB_EVENT_NAME === 'push'
 * - GITHUB_REF === 'refs/heads/master'
 * - tracked marker lib/deploy/p0a-native-git-negative.marker present
 *
 * Removal of this file and the marker fully restores the unit suite.
 */
const MARKER_PATH = path.join(
  process.cwd(),
  'lib',
  'deploy',
  'p0a-native-git-negative.marker',
);

function isApprovedMasterPushNegativeControl(): boolean {
  return (
    process.env.GITHUB_EVENT_NAME === 'push' &&
    process.env.GITHUB_REF === 'refs/heads/master' &&
    existsSync(MARKER_PATH)
  );
}

describe('P0-A TEMPORARY native-Git negative Deployment Check control', () => {
  it('fails only on approved master-push unit execution when the marker is present', () => {
    if (!isApprovedMasterPushNegativeControl()) {
      expect(true).toBe(true);
      return;
    }

    expect(
      false,
      'P0-A_NATIVE_GIT_NEGATIVE_CONTROL: approved master-push unit failure',
    ).toBe(true);
  });
});
