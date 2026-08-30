import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

describe('reliability CI governance contract', () => {
  it('pins TZ=Africa/Accra on CI, postgres-smoke, and authenticated-qa', () => {
    expect(read('.github/workflows/ci.yml')).toContain('TZ: Africa/Accra');
    expect(read('.github/workflows/postgres-smoke.yml')).toContain('TZ: Africa/Accra');
    expect(read('.github/workflows/authenticated-qa.yml')).toContain('TZ: Africa/Accra');
  });

  it('keeps production authenticated QA from completing sales', () => {
    const qa = read('.github/workflows/authenticated-qa.yml');
    expect(qa).toContain("PLAYWRIGHT_ALLOW_QA_SALE: 'false'");
    expect(qa).toContain('https://www.tillflow.app');
    expect(qa).not.toMatch(/PLAYWRIGHT_ALLOW_QA_SALE:\s*'true'/);
  });

  it('does not make coverage a required CI gate', () => {
    const ci = read('.github/workflows/ci.yml');
    expect(ci).not.toMatch(/npm run test:coverage/);
    expect(ci).toContain('name: unit');
    expect(ci).toContain('name: pos-safety');
    expect(read('docs/reliability/CI_GOVERNANCE.md')).toContain('coverage is not a required gate');
  });

  it('filters postgres-smoke onto POS money and offline paths', () => {
    const smoke = read('.github/workflows/postgres-smoke.yml');
    for (const path of [
      'lib/services/sales.ts',
      'lib/services/shifts.ts',
      'lib/services/cash-drawer.ts',
      'lib/services/returns.ts',
      'lib/services/payments.ts',
      'lib/services/expensePayments.ts',
      'lib/services/purchases.ts',
      'app/api/offline/**',
      'prisma/**',
    ]) {
      expect(smoke).toContain(`'${path}'`);
    }
    expect(smoke).toContain('lib/services/checkout-shift-cashdrawer-rtx.test.ts');
    expect(smoke).toContain('lib/services/payments-concurrency.test.ts');
    expect(smoke).toContain('lib/services/purchases-concurrency.test.ts');
    expect(smoke).toContain('lib/services/sales.test.ts');
  });

  it('keeps the reliability Playwright journey opt-in and off Production', () => {
    const spec = read('playwright/reliability-journey.spec.ts');
    const env = read('tests/e2e/helpers/env.ts');
    const config = read('playwright.config.ts');
    expect(config).toContain("name: 'reliability-journey'");
    expect(config).toMatch(/reliability-journey\\.spec\\.ts/);
    expect(spec).toContain('shouldRunReliabilityJourney');
    expect(spec).toContain('reliabilitySalesAllowed');
    expect(spec).toContain('/api/qa/deploy-sha');
    expect(spec).toContain('LATE_OFFLINE');
    expect(spec).toContain('Product catalogue');
    expect(spec).toContain('Import complete!');
    expect(spec).toContain('Opening capital recorded!');
    expect(spec).not.toMatch(/test\.skip\(\s*!reliabilitySalesAllowed\(\)/);
    expect(spec).not.toMatch(/if \(!captured\?\.shiftId \|\| !captured\.tillId\) return;/);
    expect(spec).not.toContain('imported|Import complete|products');
    expect(spec).not.toContain('Opening stock|capital|saved|Inventory');
    expect(env).toContain("process.env.RELIABILITY_E2E === '1'");
    expect(env).toContain('www.tillflow.app');
    expect(env).toContain('isProductionPlaywrightTarget');
  });

  it('keeps Preview deploy-sha and identity snapshot off Production', () => {
    const sha = read('app/api/qa/deploy-sha/route.ts');
    const snap = read('app/api/qa/reliability-snapshot/route.ts');
    expect(sha).toContain("process.env.VERCEL_ENV === 'production'");
    expect(sha).toContain("return NextResponse.json({ error: 'not_available' }, { status: 404 })");
    expect(snap).toContain('deployedSha');
    expect(snap).toContain("process.env.VERCEL_ENV === 'production'");
  });

  it('documents sqlite CI build vs Preview Postgres build:vercel', () => {
    const gov = read('docs/reliability/CI_GOVERNANCE.md');
    expect(gov).toMatch(/sqlite/i);
    expect(gov).toContain('build:vercel');
    expect(gov).toMatch(/Preview/i);
    expect(read('vercel.json')).toContain('npm run build:vercel');
    expect(read('package.json')).toContain(
      'prisma generate --schema=prisma/schema.postgres.prisma',
    );
  });
});
