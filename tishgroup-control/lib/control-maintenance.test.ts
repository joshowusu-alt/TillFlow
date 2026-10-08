import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CONTROL_MAINTENANCE_MESSAGE, isControlMaintenanceMode } from '@/lib/control-maintenance';

describe('control maintenance mode', () => {
  it('stays off when absent, empty, or explicitly normal', () => {
    expect(isControlMaintenanceMode({})).toBe(false);
    expect(isControlMaintenanceMode({ CONTROL_MAINTENANCE_MODE: '' })).toBe(false);
    expect(isControlMaintenanceMode({ CONTROL_MAINTENANCE_MODE: 'off' })).toBe(false);
    expect(isControlMaintenanceMode({ CONTROL_MAINTENANCE_MODE: 'normal' })).toBe(false);
  });

  it('enables read-only for the exact value and other malformed non-off values', () => {
    expect(isControlMaintenanceMode({ CONTROL_MAINTENANCE_MODE: 'read-only' })).toBe(true);
    expect(isControlMaintenanceMode({ CONTROL_MAINTENANCE_MODE: 'READ-ONLY' })).toBe(true);
    expect(isControlMaintenanceMode({ CONTROL_MAINTENANCE_MODE: 'readonly' })).toBe(true);
  });

  it('does not treat maintenance as shared-key or auth bypass', () => {
    expect(CONTROL_MAINTENANCE_MESSAGE).toMatch(/temporarily disabled/);
    const login = readFileSync(join(process.cwd(), 'app/actions/control-auth.ts'), 'utf8');
    expect(login).toContain('loginControlStaffAction');
    expect(login).not.toContain('CONTROL_PLANE_ACCESS_KEY');
    expect(login).toContain('requireControlStaffForMutation');
  });
});

describe('direct server-action denial contract', () => {
  const files = [
    'app/actions/control-businesses.ts',
    'app/actions/control-support.ts',
    'app/actions/control-scale.ts',
    'app/actions/control-auth.ts',
  ];

  it('guards every exported mutation except personal login', () => {
    for (const file of files) {
      const source = readFileSync(join(process.cwd(), file), 'utf8');
      const exports = [...source.matchAll(/export async function (\w+)/g)].map((match) => match[1]);
      for (const name of exports) {
        if (name === 'loginControlStaffAction') continue;
        expect(source, `${file} ${name}`).toContain('requireControlStaffForMutation');
      }
    }
  });

  it('does not leave a requireControlStaff write path in action modules', () => {
    for (const file of files) {
      const source = readFileSync(join(process.cwd(), file), 'utf8');
      expect(source).not.toMatch(/await requireControlStaff\(/);
    }
  });
});
