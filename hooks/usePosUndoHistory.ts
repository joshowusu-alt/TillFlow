'use client';

import { useCallback, useRef, useState } from 'react';

type UndoHistoryOptions = {
  /** Maximum number of snapshots kept in the stack (default 10). */
  maxSteps?: number;
};

type UndoHistoryResult<T> = {
  /** Whether there is at least one snapshot available to restore. */
  canUndo: boolean;
  /** Current underlying stack — exposed so callers can snapshot it. */
  stack: T[];
  /** Push the current value as the next undo snapshot. */
  push: (value: T) => void;
  /** Pop the most recent snapshot and return it, or null if the stack is empty. */
  undo: () => T | null;
  /** Clear the entire history — use after a full cart reset, e.g. after a completed sale. */
  clear: () => void;
  /** Replace the entire stack — used to rehydrate from a snapshot after a failed save. */
  replace: (next: T[]) => void;
};

/**
 * Generic bounded-depth undo stack. Used by the POS to let a cashier
 * revert the last cart mutation via Ctrl/Cmd+Z; written generically so
 * other flows (e.g. receipt design, bulk label builder) can reuse it.
 */
export function usePosUndoHistory<T>(options: UndoHistoryOptions = {}): UndoHistoryResult<T> {
  const maxSteps = options.maxSteps ?? 10;
  const [stack, setStack] = useState<T[]>([]);
  // Keep a ref in sync with the rendered state so undo() can read the
  // latest snapshot without closing over a stale value between renders.
  const stackRef = useRef<T[]>(stack);
  stackRef.current = stack;

  const push = useCallback(
    (value: T) => {
      setStack((prev) => [...prev.slice(-(maxSteps - 1)), value]);
    },
    [maxSteps]
  );

  const undo = useCallback((): T | null => {
    const current = stackRef.current;
    if (current.length === 0) return null;
    const popped = current[current.length - 1];
    setStack((prev) => prev.slice(0, -1));
    return popped;
  }, []);

  const clear = useCallback(() => {
    setStack([]);
  }, []);

  const replace = useCallback((next: T[]) => {
    // Copy defensively + cap to maxSteps so a restored snapshot cannot
    // re-introduce an over-long stack.
    setStack(next.slice(-maxSteps));
  }, [maxSteps]);

  return {
    canUndo: stack.length > 0,
    stack,
    push,
    undo,
    clear,
    replace,
  };
}
