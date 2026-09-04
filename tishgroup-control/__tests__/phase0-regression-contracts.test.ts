import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const loginPage = readFileSync(join(__dirname, '../app/login/page.tsx'), 'utf8');
const authAction = readFileSync(join(__dirname, '../app/actions/control-auth.ts'), 'utf8');
const packageJson = readFileSync(join(__dirname, '../package.json'), 'utf8');
const controlData = readFileSync(join(__dirname, '../lib/control-data.ts'), 'utf8');

describe('Phase 0 regression contracts', () => {
  it('shared-key auth cannot return from login', () => {
    expect(authAction).not.toContain('CONTROL_PLANE_ACCESS_KEY');
    expect(loginPage).not.toMatch(/shared access key/i);
    expect(loginPage).not.toContain('CONTROL_PLANE_ACCESS_KEY');
  });

  it('unknown role cannot gain write access via ACCOUNT_MANAGER fallback', () => {
    const controlAuth = readFileSync(join(__dirname, '../lib/control-auth.ts'), 'utf8');
    expect(controlAuth).not.toMatch(/default:\s*return 'ACCOUNT_MANAGER'/);
  });

  it('unknown status cannot become paid', () => {
    const mutations = readFileSync(join(__dirname, '../lib/commercial-mutations.ts'), 'utf8');
    expect(mutations).toContain('parseStoredStatusForMutation');
    const businesses = readFileSync(join(__dirname, '../app/actions/control-businesses.ts'), 'utf8');
    expect(businesses).not.toMatch(/default:\s*return 'PAID_ACTIVE'/);
  });

  it('mock portfolio cannot return in runtime', () => {
    expect(controlData).not.toContain("id: 'adom-mart'");
    expect(controlData).not.toContain('export const managedBusinesses');
  });

  it('build-time DDL cannot return', () => {
    expect(packageJson).not.toContain('ensure-control-schema');
  });

  it('internal notes cannot leak through appendBillingEntry Control headings', () => {
    const businesses = readFileSync(join(__dirname, '../app/actions/control-businesses.ts'), 'utf8');
    expect(businesses).not.toContain('Control note added');
    expect(businesses).not.toContain('Control payment recorded');
  });
});
