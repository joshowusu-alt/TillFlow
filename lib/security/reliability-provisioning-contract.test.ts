import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

function projectBlock(config: string, name: string) {
  const start = config.indexOf(`name: '${name}'`);
  expect(start).toBeGreaterThan(-1);
  const next = config.indexOf("name: '", start + 1);
  return config.slice(start, next === -1 ? undefined : next);
}

const FINANCIAL_ACTIONS = [
  'Create product',
  'Complete Sale',
  'Open Shift float',
  'Save Opening Capital',
  'Confirm Import',
  'expense',
  'refund',
];

describe('reliability provisioning Playwright contract', () => {
  it('pins retries 0 and timeout 180000 on reliability-provisioning', () => {
    const config = read('playwright.config.ts');
    const project = projectBlock(config, 'reliability-provisioning');
    expect(project).toMatch(/testMatch:\s*\/reliability-provisioning\\.spec\\.ts\//);
    expect(project).toMatch(/retries:\s*0/);
    expect(project).toMatch(/timeout:\s*180_000/);
    expect(project).not.toMatch(/retries:\s*[1-9]/);
    expect(config).toMatch(/workers:\s*1/);
  });

  it('keeps the spec Preview-only with deploy-sha login and Till 3', () => {
    const spec = read('playwright/reliability-provisioning.spec.ts');
    expect(spec).toContain('/api/qa/deploy-sha');
    expect(spec).toMatch(/ensurePreviewQaOwner|login/);
    expect(spec).toContain('Till 3');
    expect(spec).toContain('shouldAddNamedTill');
    expect(spec).toContain('shouldRunReliabilityJourney');
    expect(spec).toContain('isProductionPlaywrightTarget');
    expect(spec).toContain('assertPreviewQaOwnerTarget');
    expect(spec).toContain('completeOnboardingBusinessType');
    expect(spec).toContain('waitForOwnerSession');
    expect(spec).toContain('existing-login');
    expect(spec).toContain('PLAYWRIGHT_OWNER_EMAIL');
    expect(spec).not.toMatch(/reliability-\$\{stamp\}@example\.com/);
  });

  it('forbids financial writes and Production hosts in the provisioning spec', () => {
    const spec = read('playwright/reliability-provisioning.spec.ts');
    const project = projectBlock(read('playwright.config.ts'), 'reliability-provisioning');
    for (const action of FINANCIAL_ACTIONS) {
      expect(spec, `provisioning spec must not contain ${action}`).not.toContain(action);
      expect(project, `provisioning project must not contain ${action}`).not.toContain(action);
    }
    expect(spec).not.toMatch(/https:\/\/(www\.)?tillflow\.app/);
    expect(project).not.toMatch(/https:\/\/(www\.)?tillflow\.app/);
    expect(spec).not.toContain('reliabilitySalesAllowed');
    expect(spec).not.toContain('/api/qa/reliability-snapshot');
  });
});
