export const CASH_DRAWER_ENABLED_KEY = 'pos.cashDrawerEnabled';

export function isCashDrawerEnabled() {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(CASH_DRAWER_ENABLED_KEY) === 'true';
}

export function setCashDrawerEnabled(enabled: boolean) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(CASH_DRAWER_ENABLED_KEY, enabled ? 'true' : 'false');
}

export function isSerialSupported() {
  if (typeof window === 'undefined') return false;
  return 'serial' in navigator;
}

export async function requestCashDrawerPort() {
  if (typeof window === 'undefined' || !('serial' in navigator)) {
    throw new Error('WebSerial not supported in this browser.');
  }
  // @ts-expect-error WebSerial types may not be present.
  return navigator.serial.requestPort();
}

export async function openCashDrawer() {
  if (typeof window === 'undefined' || !('serial' in navigator)) {
    throw new Error('WebSerial not supported in this browser.');
  }
  // @ts-expect-error WebSerial types may not be present.
  const ports = await navigator.serial.getPorts();
  if (!ports.length) {
    throw new Error('No cash drawer paired. Pair a device in Settings.');
  }
  const port = ports[0];
  try {
    await port.open({ baudRate: 9600 });
  } catch {
    // Ignore if already open.
  }
  const writer = port.writable?.getWriter();
  if (!writer) {
    throw new Error('Cash drawer port is not writable.');
  }
  const pulse = new Uint8Array([0x1b, 0x70, 0x00, 0x19, 0xfa]);
  await writer.write(pulse);
  writer.releaseLock();
  try {
    await port.close();
  } catch {
    // Ignore close errors.
  }
  return true;
}
