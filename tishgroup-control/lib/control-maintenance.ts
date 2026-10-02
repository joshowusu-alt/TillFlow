import { redirect } from 'next/navigation';

export const CONTROL_MAINTENANCE_MODE_VALUE = 'read-only';
export const CONTROL_MAINTENANCE_MESSAGE = 'Changes are temporarily disabled.';

const NORMAL_VALUES = new Set(['', 'off', '0', 'false', 'normal']);

export function isControlMaintenanceMode(env: NodeJS.Dict<string> | NodeJS.ProcessEnv = process.env): boolean {
  const value = String(env.CONTROL_MAINTENANCE_MODE ?? '').trim().toLowerCase();
  if (NORMAL_VALUES.has(value)) return false;
  return true;
}

export function assertControlMutationsAllowed(returnPath = '/'): void {
  if (!isControlMaintenanceMode()) return;
  const path = returnPath.startsWith('/') ? returnPath : '/';
  const separator = path.includes('?') ? '&' : '?';
  redirect(`${path}${separator}error=${encodeURIComponent(CONTROL_MAINTENANCE_MESSAGE)}`);
}

export function maintenanceDeniedPayload() {
  return {
    ok: false as const,
    error: 'maintenance',
    message: CONTROL_MAINTENANCE_MESSAGE,
  };
}
