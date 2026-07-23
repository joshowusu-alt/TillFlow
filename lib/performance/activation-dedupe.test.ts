import { describe, expect, it, beforeEach } from 'vitest';
import {
  getActivationSnapshotReadCount,
  resetActivationSnapshotReadCount,
} from '@/lib/performance/home-perf-instrumentation';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');

describe('activation snapshot duplication removal', () => {
  beforeEach(() => {
    resetActivationSnapshotReadCount();
  });

  it('persistActivationSnapshot accepts precomputed readiness+snapshot', () => {
    const src = read('lib/activation-snapshot.ts');
    expect(src).toContain('PersistActivationOptions');
    expect(src).toContain('preloadedSnapshot');
    expect(src).toContain('previousStored');
    expect(src).toContain('markActivationSnapshotRead');
  });

  it('getReadiness loads the snapshot once then persists with reuse', () => {
    const src = read('app/actions/onboarding.ts');
    expect(src).toContain('const snapshot = await loadActivationSnapshot');
    expect(src).toContain('computeActivationReadiness(snapshot)');
    expect(src).toContain('persistActivationSnapshot(business.id, now,');
    expect(src).toContain('readiness: activation');
    expect(src).toContain('snapshot,');
    // Must not call computeActivationForBusiness (which would re-load).
    expect(src).not.toContain('computeActivationForBusiness(');
  });

  it('completed Owner Home skips activation on the useful-Home path', () => {
    const content = read('app/(protected)/onboarding/OwnerReadinessContent.tsx');
    const stream = read('components/owner-home/OwnerHomeCompletedStream.tsx');
    expect(content).toContain('getOwnerHomeCriticalShell');
    expect(content).toContain('OwnerHomeCompletedStream');
    expect(stream).not.toContain('loadActivationSnapshot');
    expect(stream).not.toContain('persistActivationSnapshot');
    expect(stream).not.toContain('computeActivation');
  });

  it('resetActivationSnapshotReadCount clears the counter', () => {
    expect(getActivationSnapshotReadCount()).toBe(0);
  });
});
