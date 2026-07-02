import path from 'node:path';

export const AUTH_DIR = path.resolve(process.cwd(), 'playwright', '.auth');

export function authStatePath(role: 'owner' | 'cashier' | 'manager') {
  return path.join(AUTH_DIR, `${role}.json`);
}
