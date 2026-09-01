import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

const PROVISIONING_PROJECT = 'reliability-provisioning';
const PUBLIC_API_PREFIXES = [
  '/api/health',
  '/api/icon',
  '/api/storefront',
  '/api/uploads',
  '/api/payments/momo/webhook/mtn',
  '/api/notifications/webhook/meta',
] as const;
const ALLOWED_QA_ROUTES = ['deploy-sha', 'reliability-snapshot'] as const;

/** UI / write labels the provisioning-only project must never perform. */
const FORBIDDEN_PROVISIONING_FINANCIAL_ACTIONS = [
  { name: 'Create product', pattern: /Create product/i },
  { name: 'Complete Sale', pattern: /Complete Sale/i },
  { name: 'Open Shift with float', pattern: /Open Shift/i },
  { name: 'opening capital', pattern: /opening capital/i },
  { name: 'import confirm', pattern: /Import complete!?|import confirm/i },
  { name: 'refund', pattern: /Process Return|Confirm Return|cash refund|\brefund\b/i },
  { name: 'expense', pattern: /Record expense|Save expense|Add expense|\/expenses\b/i },
] as const;

function extractBalancedObject(source: string, nameLiteralIndex: number): string {
  let start = nameLiteralIndex;
  while (start > 0 && source[start] !== '{') start -= 1;
  if (source[start] !== '{') {
    throw new Error('Could not find opening brace for Playwright project object.');
  }
  let depth = 0;
  for (let end = start; end < source.length; end += 1) {
    const ch = source[end];
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, end + 1);
    }
  }
  throw new Error('Unbalanced Playwright project object.');
}

function extractPlaywrightProject(config: string, name: string): string {
  const nameRe = new RegExp(`name:\\s*['"]${name}['"]`);
  const match = nameRe.exec(config);
  if (!match || match.index === undefined) {
    throw new Error(`Playwright project '${name}' is missing from playwright.config.ts`);
  }
  return extractBalancedObject(config, match.index);
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

function extractPublicPaths(middlewareSource: string): string[] {
  const block = middlewareSource.match(/const PUBLIC_PATHS = \[([\s\S]*?)\];/);
  if (!block) throw new Error('PUBLIC_PATHS array is missing from middleware.ts');
  return [...block[1].matchAll(/['"](\/[^'"]+)['"]/g)].map((m) => m[1]);
}

function listQaRouteDirs(): string[] {
  const qaRoot = join(root, 'app', 'api', 'qa');
  if (!existsSync(qaRoot)) return [];
  return readdirSync(qaRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function resolveReliabilitySpecRel(project: string, projectName: string): string {
  const testDir = project.match(/testDir:\s*['"]([^'"]+)['"]/)?.[1] ?? './playwright';
  const regexMatch = project.match(/testMatch:\s*\/([^/]+)\//);
  const stringMatch = project.match(/testMatch:\s*['"]([^'"]+)['"]/);
  const raw = regexMatch?.[1] ?? stringMatch?.[1];
  if (!raw) {
    throw new Error(`Playwright project '${projectName}' has no testMatch`);
  }
  const fileName = raw
    .replace(/\\\./g, '.')
    .replace(/^\*\*\//, '')
    .replace(/\\/g, '')
    .split('/')
    .pop();
  if (!fileName) {
    throw new Error(`Could not resolve spec filename from testMatch '${raw}'`);
  }
  const candidates = [
    join(testDir, fileName).replace(/\\/g, '/'),
    `playwright/${fileName}`,
    `tests/e2e/${fileName}`,
  ];
  const hit = candidates.find((rel) => existsSync(join(root, rel)));
  if (!hit) {
    throw new Error(
      `${projectName} spec '${fileName}' is missing (looked in ${candidates.join(', ')})`,
    );
  }
  return hit;
}

function resolveProvisioningSpecRel(project: string): string {
  return resolveReliabilitySpecRel(project, PROVISIONING_PROJECT);
}

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
    expect(spec).toContain('ensurePreviewQaOwner');
    expect(spec).toContain('assertMobilePhase9Prereqs');
    expect(spec).toContain("mode: 'serial'");
    expect(spec).toContain('phase9Setup.till3Ready');
    expect(config).toMatch(/name: 'reliability-journey'[\s\S]*?retries:\s*0/);
    expect(read('tests/e2e/helpers/preview-qa-owner.ts')).toContain('fillReactInput');
    expect(read('tests/e2e/helpers/preview-qa-owner.ts')).toContain('diagnoseDisabledRegisterAdvance');
    expect(spec).not.toContain('reliability-${stamp}@example.com');
    expect(spec).not.toContain('Pass1234!');
    expect(spec).toContain('reliabilitySalesAllowed');
    expect(spec).toContain('/api/qa/deploy-sha');
    expect(spec).toContain('LATE_OFFLINE');
    expect(spec).toContain('enterManualImportRoute');
    expect(spec).toContain('ensureQaOpeningStock');
    expect(read('tests/e2e/helpers/preview-qa-catalogue.ts')).toContain('Product catalogue');
    expect(read('tests/e2e/helpers/preview-qa-catalogue.ts')).toContain('Import complete!');
    expect(read('tests/e2e/helpers/preview-qa-catalogue.ts')).toContain('Opening capital recorded!');
    expect(spec).not.toMatch(/test\.skip\(\s*!reliabilitySalesAllowed\(\)/);
    expect(spec).not.toMatch(/if \(!captured\?\.shiftId \|\| !captured\.tillId\) return;/);
    expect(spec).not.toContain('imported|Import complete|products');
    expect(spec).toContain('Process Return');
    expect(spec).toContain('Confirm Return');
    expect(spec).toContain('CUSTOMER_CHANGED_MIND');
    expect(env).toContain("process.env.RELIABILITY_E2E === '1'");
    expect(env).toContain('www.tillflow.app');
    expect(env).toContain('isProductionPlaywrightTarget');
  });

  it('asserts QA products via a unique table row or table link, never getByText().first()', () => {
    const spec = read('playwright/reliability-journey.spec.ts');
    const helper = read('tests/e2e/helpers/preview-qa-product.ts');
    const config = read('playwright.config.ts');
    expect(spec).toContain('ensureSellableQaProduct');
    expect(spec).toContain('ensureImportedQaProduct');
    expect(spec).toContain('RELIABILITY_SELLABLE_PRODUCT');
    expect(spec).not.toContain('/products#product-create');
    expect(spec).not.toMatch(/getByRole\('heading',\s*\{\s*name:\s*'Add product'/);
    expect(helper).toContain("sku: 'REL-SKU-1'");
    expect(helper).toContain("barcode: 'RELSKU1'");
    expect(helper).toContain("getByRole('table')");
    expect(helper).toContain("getByRole('row')");
    expect(helper).toContain("getByRole('link'");
    expect(helper).toContain('exact: true');
    expect(helper).toContain('Genuine duplicates — do not pick a visible one');
    expect(helper).not.toMatch(/getByText\([^;\n]*\)\.first\(\)/);
    expect(spec).not.toMatch(/getByText\(\s*PRODUCT_NAME\s*\)\.first\(\)/);
    expect(spec).not.toMatch(/getByText\(\s*IMPORT_PRODUCT_NAME[^)]*\)\.first\(\)/);
    expect(config).toMatch(/name: 'reliability-journey'[\s\S]*?retries:\s*0/);
    expect(spec).toContain('assertMobilePhase9Prereqs');
    expect(config).toMatch(/name: 'reliability-provisioning'[\s\S]*?retries:\s*0/);
  });

  it('bounds reliability action/navigation timeouts and forbids hidden .first() selects', () => {
    const spec = read('playwright/reliability-journey.spec.ts');
    const locators = read('tests/e2e/helpers/preview-qa-locators.ts');
    const config = read('playwright.config.ts');
    const journey = extractPlaywrightProject(config, 'reliability-journey');
    const provisioning = extractPlaywrightProject(config, PROVISIONING_PROJECT);
    expect(locators).toContain('RELIABILITY_ACTION_TIMEOUT_MS = 8_000');
    expect(locators).toContain('RELIABILITY_NAVIGATION_TIMEOUT_MS = 15_000');
    expect(locators).toContain('requireExactlyOneVisible');
    expect(journey).toMatch(/actionTimeout:\s*8_000/);
    expect(journey).toMatch(/navigationTimeout:\s*15_000/);
    expect(journey).toMatch(/retries:\s*0/);
    expect(provisioning).toMatch(/actionTimeout:\s*8_000/);
    expect(provisioning).toMatch(/retries:\s*0/);
    expect(provisioning).toMatch(/timeout:\s*180_000/);
    expect(spec).toContain('till3OpenSelect');
    expect(spec).toContain('closeTill3Shift');
    expect(spec).toContain('enterManualImportRoute');
    expect(read('tests/e2e/helpers/preview-qa-catalogue.ts')).toContain('What are you importing?');
    expect(read('tests/e2e/helpers/preview-qa-catalogue.ts')).toContain('No products yet.');
    expect(spec).toContain('pos-complete-checkout');
    expect(spec).toContain('#pos-till-select');
    expect(spec).not.toMatch(/locator\(['"]select['"]\)\.first\(\)/);
    expect(spec).not.toMatch(/locator\(['"]select['"]\)\.filter\(\{\s*hasText:\s*PRODUCT_NAME/);
    expect(spec).not.toContain('test.setTimeout(600_000)');
  });

  it('injects Vercel Preview bypass headers fail-closed and never hardcodes the secret', () => {
    const config = read('playwright.config.ts');
    const helper = read('tests/e2e/helpers/vercel-preview-bypass.ts');
    expect(config).toContain('resolveVercelPreviewBypass');
    expect(config).toContain('env: process.env');
    expect(config).toContain('extraHTTPHeaders');
    expect(config).toContain("disableCapturingArtifacts ? 'off'");
    expect(helper).toContain('x-vercel-protection-bypass');
    expect(helper).toContain('x-vercel-set-bypass-cookie');
    expect(helper).toContain('env.VERCEL_AUTOMATION_BYPASS_SECRET');
    expect(helper).toContain('tillflow.app');
    expect(helper).toContain('www.tillflow.app');
    expect(helper).toContain('.vercel.app');
    expect(helper).toContain('PLAYWRIGHT_ALLOW_LOCAL_BYPASS');
    expect(helper).not.toMatch(
      /x-vercel-protection-bypass['"]\s*:\s*['"][A-Za-z0-9_-]{12,}/,
    );
    expect(helper).not.toContain('console.log');
  });

  it('provisions a dedicated Preview QA owner idempotently and never hardcodes credentials', () => {
    const spec = read('playwright/reliability-journey.spec.ts');
    const helper = read('tests/e2e/helpers/preview-qa-owner.ts');
    const register = read('app/actions/register.ts');
    const config = read('playwright.config.ts');
    expect(spec).toContain('ensurePreviewQaOwner');
    expect(spec).toContain("test('core Till 3 POS flow on mobile viewport'");
    expect(helper).toContain('PLAYWRIGHT_OWNER_EMAIL');
    expect(helper).toContain('PLAYWRIGHT_OWNER_PASSWORD');
    expect(helper).toContain('first-time-provision');
    expect(helper).toContain('existing-login');
    expect(helper).toContain('wrapPreviewQaOwnerFailure');
    expect(helper).toContain('PREVIEW_QA_STAGE_TIMEOUT_MS');
    expect(helper).toContain('PREVIEW_QA_PROBE_TIMEOUT_MS');
    expect(helper).toContain('shouldReadOnboardingPickerValue');
    expect(helper).toContain('shouldAddNamedTill');
    expect(config).toMatch(/name: 'reliability-journey'[\s\S]*?retries:\s*0/);
    expect(helper).toContain('Password was not overwritten');
    expect(helper).toContain('cannot run against Production');
    expect(helper).toContain('RELIABILITY_EXPECTED_SHA');
    expect(helper).not.toMatch(/PLAYWRIGHT_OWNER_PASSWORD\s*=\s*['"][^'"]+['"]/);
    expect(register).toContain('resolveRegisterQaTag');
    expect(config).toContain('PLAYWRIGHT_OWNER_PASSWORD');
  });

  it('keeps Preview deploy-sha and identity snapshot off Production', () => {
    const sha = read('app/api/qa/deploy-sha/route.ts');
    const snap = read('app/api/qa/reliability-snapshot/route.ts');
    const mw = read('middleware.ts');
    expect(sha).toContain("process.env.VERCEL_ENV === 'production'");
    expect(sha).toContain("return NextResponse.json({ error: 'not_available' }, { status: 404 })");
    expect(snap).toContain('deployedSha');
    expect(snap).toContain("process.env.VERCEL_ENV === 'production'");
    expect(snap).toContain('getUser');
    expect(snap).toContain("user.role !== 'OWNER'");
    expect(mw).toContain("pathname === PUBLIC_DEPLOY_SHA_PATH");
    expect(mw).toContain("export const PUBLIC_DEPLOY_SHA_PATH = '/api/qa/deploy-sha'");
    expect(mw).not.toMatch(/pathname\.startsWith\(\s*['"]\/api\/qa/);
    expect(mw).not.toMatch(/startsWith\(\s*['"]\/api\/qa\/deploy-sha/);
    expect(mw).not.toMatch(/['"]\/api\/qa['"]/);
  });

  it('does not add a new public QA HTTP surface or weaken PUBLIC_PATHS', () => {
    const mw = read('middleware.ts');
    const publicPaths = extractPublicPaths(mw);
    expect(listQaRouteDirs()).toEqual([...ALLOWED_QA_ROUTES]);
    expect(publicPaths.filter((path) => path.startsWith('/api/qa'))).toEqual([]);
    expect(publicPaths.filter((path) => path.startsWith('/api/'))).toEqual([...PUBLIC_API_PREFIXES]);
    expect(mw).toContain("pathname === PUBLIC_DEPLOY_SHA_PATH || PUBLIC_PATHS.some((p) => pathname.startsWith(p))");
    expect(mw).not.toMatch(/PUBLIC_PATHS\.push/);
    expect(mw).not.toMatch(/startsWith\(\s*['"]\/api\/qa/);
  });

  it('redacts Playwright traces, screenshots, and reports when bypass or owner password is present', () => {
    const config = read('playwright.config.ts');
    expect(config).toContain('bypass.disableCapturingArtifacts');
    expect(config).toContain('PLAYWRIGHT_OWNER_PASSWORD');
    expect(config).toContain('disableCapturingArtifacts || Boolean(process.env.PLAYWRIGHT_OWNER_PASSWORD');
    expect(config).toContain("trace: disableCapturingArtifacts ? 'off'");
    expect(config).toContain("screenshot: disableCapturingArtifacts ? 'off'");
    expect(config).toMatch(/reporter:\s*disableCapturingArtifacts/);
    expect(read('tests/e2e/helpers/vercel-preview-bypass.ts')).toContain(
      'disableCapturingArtifacts: true',
    );
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

describe('reliability-provisioning Playwright project contract', () => {
  const config = read('playwright.config.ts');

  it('preserves Preview host/SHA gates and Production denial in shared helpers', () => {
    const env = read('tests/e2e/helpers/env.ts');
    const owner = read('tests/e2e/helpers/preview-qa-owner.ts');
    const bypass = read('tests/e2e/helpers/vercel-preview-bypass.ts');
    expect(env).toContain('isProductionPlaywrightTarget');
    expect(env).toContain('tillflow.app');
    expect(env).toContain('www.tillflow.app');
    expect(owner).toContain('cannot run against Production');
    expect(owner).toContain('RELIABILITY_EXPECTED_SHA');
    expect(owner).toContain('/api/qa/deploy-sha');
    expect(bypass).toContain('isProductionPlaywrightHost');
    expect(bypass).toContain('tillflow.app');
    expect(bypass).toContain('www.tillflow.app');
    expect(bypass).not.toMatch(
      /x-vercel-protection-bypass['"]\s*:\s*['"][A-Za-z0-9_-]{12,}/,
    );
  });

  it('declares a separate provisioning-only project with retries 0 and a 180s ceiling', () => {
    expect(config).toContain(`name: '${PROVISIONING_PROJECT}'`);
    const project = extractPlaywrightProject(config, PROVISIONING_PROJECT);
    expect(project).toMatch(/retries:\s*0\b/);
    expect(project).not.toMatch(/retries:\s*(?:isCi|1|[1-9]\d*)\b/);
    expect(project).toMatch(/timeout:\s*(?:180_000|180000)\b/);
    expect(project).not.toMatch(/timeout:\s*(?:480_000|480000|[2-9]\d{5,})\b/);
    expect(project).not.toMatch(/dependencies:\s*\[[^\]]*reliability-journey/);
    expect(project).not.toMatch(/https:\/\/(?:www\.)?tillflow\.app/);
  });

  it('fails CI if the provisioning spec targets Production or performs financial writes', () => {
    const project = extractPlaywrightProject(config, PROVISIONING_PROJECT);
    const specRel = resolveProvisioningSpecRel(project);
    const spec = read(specRel);
    const scanned = stripComments(`${project}\n${spec}`);

    expect(specRel).toMatch(/reliability-provisioning/);
    expect(scanned).toContain('/api/qa/deploy-sha');
    expect(scanned).toMatch(/RELIABILITY_EXPECTED_SHA|confirmPreviewSha|getIdentity/);
    expect(scanned).toMatch(
      /isProductionPlaywrightTarget|assertPreviewQaOwnerTarget|ensurePreviewQaOwner|cannot run against Production|Production is forbidden/,
    );
    expect(scanned).not.toMatch(/https:\/\/(?:www\.)?tillflow\.app/);
    expect(scanned).not.toMatch(/PLAYWRIGHT_BASE_URL\s*=\s*['"]https:\/\/(?:www\.)?tillflow\.app/);
    expect(scanned).not.toMatch(/baseURL:\s*['"]https:\/\/(?:www\.)?tillflow\.app/);
    expect(scanned).not.toMatch(/goto\(\s*['"]https:\/\/(?:www\.)?tillflow\.app/);
    expect(spec).not.toMatch(/PLAYWRIGHT_OWNER_PASSWORD\s*=\s*['"][^'"]+['"]/);
    expect(spec).not.toMatch(/test\.setTimeout\(\s*(?:480_000|480000|[2-9]\d{5,})\s*\)/);

    for (const action of FORBIDDEN_PROVISIONING_FINANCIAL_ACTIONS) {
      expect(scanned, `provisioning project must not perform ${action.name}`).not.toMatch(
        action.pattern,
      );
    }
  });
});

const CATALOGUE_PROJECT = 'reliability-catalogue';
const FORBIDDEN_CATALOGUE_MONEY_ACTIONS = [
  { name: 'Complete Sale', pattern: /Complete Sale|pos-complete-checkout|pos-complete-sheet/i },
  { name: 'Open Shift', pattern: /Open Shift/i },
  { name: 'refund', pattern: /Process Return|Confirm Return|\brefund\b/i },
  { name: 'expense', pattern: /Record expense|Save expense|Add expense|\/expenses\b/i },
  { name: 'POS', pattern: /goto\(\s*['"]\/pos/ },
] as const;

describe('reliability-catalogue Playwright project contract', () => {
  const config = read('playwright.config.ts');

  it('declares a separate catalogue-only project with retries 0 and a 180s ceiling', () => {
    expect(config).toContain(`name: '${CATALOGUE_PROJECT}'`);
    const project = extractPlaywrightProject(config, CATALOGUE_PROJECT);
    expect(project).toMatch(/retries:\s*0\b/);
    expect(project).not.toMatch(/retries:\s*(?:isCi|1|[1-9]\d*)\b/);
    expect(project).toMatch(/timeout:\s*(?:180_000|180000)\b/);
    expect(project).not.toMatch(/timeout:\s*(?:480_000|480000|[2-9]\d{5,})\b/);
    expect(project).toMatch(/actionTimeout:\s*8_000/);
    expect(project).toMatch(/navigationTimeout:\s*15_000/);
    expect(project).not.toMatch(/dependencies:\s*\[[^\]]*reliability-journey/);
    expect(extractPlaywrightProject(config, PROVISIONING_PROJECT)).toMatch(/retries:\s*0\b/);
  });

  it('exercises the original manual-import route and does not soft-skip on another product', () => {
    const project = extractPlaywrightProject(config, CATALOGUE_PROJECT);
    const specRel = resolveReliabilitySpecRel(project, CATALOGUE_PROJECT);
    const spec = read(specRel);
    const helper = read('tests/e2e/helpers/preview-qa-catalogue.ts');
    const scanned = stripComments(`${spec}\n${helper}`);

    expect(specRel).toMatch(/reliability-catalogue/);
    expect(scanned).toContain('/settings/import-stock');
    expect(scanned).toContain('Product catalogue');
    expect(scanned).toContain('enterManualImportRoute');
    expect(scanned).toContain('ensureImportedQaProduct');
    expect(scanned).toContain('RELIABILITY_IMPORT_PRODUCT');
    expect(scanned).toContain('RELIABILITY_SELLABLE_PRODUCT');
    expect(scanned).toContain('No products yet.');
    expect(scanned).toContain('The file had no product rows. Check the file and try again.');
    expect(scanned).toContain('No ready rows to import.');
    expect(scanned).toContain('import-stock-file-input');
    expect(spec).toContain('enterManualImportRoute');
    expect(spec).not.toMatch(/Download[\s\S]{0,40}template[\s\S]{0,80}\.click\(/);
    expect(spec).not.toMatch(/PLAYWRIGHT_ALLOW_QA_SALE/);
    expect(spec).not.toMatch(/getByRole\('heading',\s*\{\s*name:\s*'Add product'/);
    expect(spec).not.toContain('/products#product-create');
  });

  it('fails CI if the catalogue spec targets Production or writes sales money', () => {
    const project = extractPlaywrightProject(config, CATALOGUE_PROJECT);
    const specRel = resolveReliabilitySpecRel(project, CATALOGUE_PROJECT);
    const spec = read(specRel);
    const scanned = stripComments(`${project}\n${spec}`);

    expect(scanned).toContain('/api/qa/deploy-sha');
    expect(scanned).toMatch(/isProductionPlaywrightTarget|assertPreviewQaOwnerTarget|cannot run against Production/);
    expect(scanned).not.toMatch(/https:\/\/(?:www\.)?tillflow\.app/);
    expect(spec).not.toMatch(/PLAYWRIGHT_OWNER_PASSWORD\s*=\s*['"][^'"]+['"]/);
    expect(spec).not.toMatch(/test\.setTimeout\(\s*(?:480_000|480000|[2-9]\d{5,})\s*\)/);
    expect(spec).toContain('assertCatalogueDidNotWriteMoney');
    expect(spec).toContain('ensureQaOpeningStock');

    for (const action of FORBIDDEN_CATALOGUE_MONEY_ACTIONS) {
      expect(scanned, `catalogue project must not perform ${action.name}`).not.toMatch(action.pattern);
    }
  });
});
