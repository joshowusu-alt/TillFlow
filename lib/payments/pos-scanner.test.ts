import { describe, expect, it } from 'vitest';

import {
  calculateCompactDropdownViewport,
  handleScannerEnter,
  resetScannerBuffer,
  updateScannerBufferState,
  type ScannerBufferState,
} from './pos-scanner';

function createState(): ScannerBufferState {
  return { value: '', lastTime: 0, fastCount: 0, active: false };
}

describe('pos-scanner helpers', () => {
  it('activates fast scanner buffers and returns a scan on enter', () => {
    const state = createState();

    updateScannerBufferState(state, '1', 1000);
    updateScannerBufferState(state, '2', 1020);
    updateScannerBufferState(state, '3', 1040);
    updateScannerBufferState(state, '4', 1060);

    expect(state.active).toBe(true);
    expect(state.value).toBe('1234');

    expect(handleScannerEnter(state)).toEqual({ shouldScan: true, code: '1234' });
    expect(state).toEqual(createState());
  });

  it('resets stale buffers and ignores short enter sequences', () => {
    const state = createState();

    updateScannerBufferState(state, 'A', 1000);
    updateScannerBufferState(state, 'B', 1305);

    expect(state.value).toBe('B');
    expect(state.active).toBe(false);

    expect(handleScannerEnter(state)).toEqual({ shouldScan: false, code: null });
    resetScannerBuffer(state);
    expect(state).toEqual(createState());
  });

  it('calculates compact dropdown viewport bounds', () => {
    expect(calculateCompactDropdownViewport({
      viewportHeight: 700,
      viewportOffsetTop: 20,
      shellBottom: 180,
    })).toEqual({ top: 188, maxHeight: 520 });
  });
});
