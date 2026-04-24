import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { usePosUndoHistory } from './usePosUndoHistory';

describe('usePosUndoHistory', () => {
  it('starts empty and canUndo is false', () => {
    const { result } = renderHook(() => usePosUndoHistory<number>());
    expect(result.current.stack).toEqual([]);
    expect(result.current.canUndo).toBe(false);
  });

  it('pushes snapshots and flips canUndo true', () => {
    const { result } = renderHook(() => usePosUndoHistory<number>());
    act(() => result.current.push(1));
    expect(result.current.stack).toEqual([1]);
    expect(result.current.canUndo).toBe(true);
  });

  it('caps the stack at maxSteps — pushing beyond drops the oldest', () => {
    const { result } = renderHook(() => usePosUndoHistory<number>({ maxSteps: 3 }));
    act(() => {
      result.current.push(1);
      result.current.push(2);
      result.current.push(3);
      result.current.push(4);
    });
    expect(result.current.stack).toEqual([2, 3, 4]);
  });

  it('undo pops the latest snapshot and returns it', () => {
    const { result } = renderHook(() => usePosUndoHistory<string>());
    act(() => {
      result.current.push('a');
      result.current.push('b');
    });

    let popped: string | null = null;
    act(() => {
      popped = result.current.undo();
    });

    expect(popped).toBe('b');
    expect(result.current.stack).toEqual(['a']);
    expect(result.current.canUndo).toBe(true);
  });

  it('undo returns null on an empty stack and leaves state untouched', () => {
    const { result } = renderHook(() => usePosUndoHistory<number>());
    let popped: number | null = 99;
    act(() => {
      popped = result.current.undo();
    });
    expect(popped).toBeNull();
    expect(result.current.stack).toEqual([]);
    expect(result.current.canUndo).toBe(false);
  });

  it('clear() empties the stack', () => {
    const { result } = renderHook(() => usePosUndoHistory<number>());
    act(() => {
      result.current.push(1);
      result.current.push(2);
      result.current.clear();
    });
    expect(result.current.stack).toEqual([]);
    expect(result.current.canUndo).toBe(false);
  });

  it('replace() swaps the stack in place', () => {
    const { result } = renderHook(() => usePosUndoHistory<number>());
    act(() => result.current.push(1));
    act(() => result.current.replace([10, 20, 30]));
    expect(result.current.stack).toEqual([10, 20, 30]);
  });

  it('replace() caps at maxSteps so a restored snapshot cannot resurrect an over-long history', () => {
    const { result } = renderHook(() => usePosUndoHistory<number>({ maxSteps: 3 }));
    act(() => result.current.replace([1, 2, 3, 4, 5, 6]));
    // Keeps the newest maxSteps entries — these are the most recent snapshots.
    expect(result.current.stack).toEqual([4, 5, 6]);
  });

  it('uses a default maxSteps of 10 when no option is passed', () => {
    const { result } = renderHook(() => usePosUndoHistory<number>());
    act(() => {
      for (let i = 1; i <= 15; i += 1) {
        result.current.push(i);
      }
    });
    expect(result.current.stack.length).toBe(10);
    expect(result.current.stack[0]).toBe(6);
    expect(result.current.stack[9]).toBe(15);
  });
});
