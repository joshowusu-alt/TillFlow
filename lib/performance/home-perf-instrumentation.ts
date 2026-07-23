/**
 * Environment-gated Home performance instrumentation.
 * Enabled when HOME_PERF_INSTRUMENT=1 or NODE_ENV !== 'production'.
 * Logs only operation names and durations — no tenant PII or money amounts.
 */

type PerfEntry = { op: string; ms: number; at: string };

const buffer: PerfEntry[] = [];

function enabled() {
  // Production: opt-in only via HOME_PERF_INSTRUMENT=1. Never on by default.
  if (process.env.NODE_ENV === 'production') {
    return process.env.HOME_PERF_INSTRUMENT === '1';
  }
  if (process.env.HOME_PERF_INSTRUMENT === '0') return false;
  if (process.env.HOME_PERF_INSTRUMENT === '1') return true;
  return true;
}

export async function measureHomePerf<T>(op: string, fn: () => Promise<T>): Promise<T> {
  if (!enabled()) return fn();
  const start = Date.now();
  try {
    return await fn();
  } finally {
    const ms = Date.now() - start;
    const entry = { op, ms, at: new Date().toISOString() };
    buffer.push(entry);
    // Structured, PII-free log line for local/benchmark runs.
    console.info(JSON.stringify({ type: 'home_perf', ...entry }));
  }
}

/** Test helper — recent instrumented ops (cleared on read in tests if desired). */
export function getHomePerfBuffer(): PerfEntry[] {
  return [...buffer];
}

export function clearHomePerfBuffer() {
  buffer.length = 0;
}

/** Activation snapshot read counter for call-count tests. */
let activationSnapshotReads = 0;

export function markActivationSnapshotRead() {
  activationSnapshotReads += 1;
}

export function getActivationSnapshotReadCount() {
  return activationSnapshotReads;
}

export function resetActivationSnapshotReadCount() {
  activationSnapshotReads = 0;
}
