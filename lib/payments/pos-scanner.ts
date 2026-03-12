export type ScannerBufferState = {
  value: string;
  lastTime: number;
  fastCount: number;
  active: boolean;
};

export type ScannerBufferEnterResult = {
  shouldScan: boolean;
  code: string | null;
};

export function resetScannerBuffer(state: ScannerBufferState): void {
  state.value = '';
  state.lastTime = 0;
  state.fastCount = 0;
  state.active = false;
}

export function handleScannerEnter(state: ScannerBufferState): ScannerBufferEnterResult {
  const shouldScan = state.active && state.value.length >= 4;
  const code = shouldScan ? state.value : null;
  resetScannerBuffer(state);
  return { shouldScan, code };
}

export function updateScannerBufferState(
  state: ScannerBufferState,
  key: string,
  now: number
): void {
  if (key.length !== 1) return;

  const delta = state.lastTime ? now - state.lastTime : 0;
  if (delta > 200) {
    resetScannerBuffer(state);
  }
  if (delta > 0 && delta < 50) {
    state.fastCount += 1;
  } else {
    state.fastCount = 0;
  }
  if (state.fastCount >= 2) {
    state.active = true;
  }

  state.value += key;
  state.lastTime = now;
}

export function calculateCompactDropdownViewport(input: {
  viewportHeight: number;
  viewportOffsetTop: number;
  shellBottom: number | null;
}): { top: number; maxHeight: number } {
  const preferredTop = input.shellBottom !== null ? input.shellBottom + 8 : input.viewportOffsetTop + 96;
  const minTop = input.viewportOffsetTop + 12;
  const top = Math.max(minTop, Math.min(preferredTop, input.viewportOffsetTop + input.viewportHeight - 220));
  const maxHeight = Math.max(180, Math.floor(input.viewportOffsetTop + input.viewportHeight - top - 12));
  return { top, maxHeight };
}
