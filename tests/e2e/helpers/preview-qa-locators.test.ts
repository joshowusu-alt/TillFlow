import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  RELIABILITY_ACTION_TIMEOUT_MS,
  RELIABILITY_NAVIGATION_TIMEOUT_MS,
  classifyResponsiveHit,
} from './preview-qa-locators';

const root = join(__dirname, '..', '..', '..');
const source = (rel: string) => readFileSync(join(root, rel), 'utf8');

describe('Reliability unique-visible locators', () => {
  it('bounds action and navigation timeouts well below the 480s test budget', () => {
    expect(RELIABILITY_ACTION_TIMEOUT_MS).toBeGreaterThan(0);
    expect(RELIABILITY_ACTION_TIMEOUT_MS).toBeLessThanOrEqual(15_000);
    expect(RELIABILITY_NAVIGATION_TIMEOUT_MS).toBeGreaterThan(0);
    expect(RELIABILITY_NAVIGATION_TIMEOUT_MS).toBeLessThanOrEqual(30_000);
    expect(RELIABILITY_ACTION_TIMEOUT_MS).toBeLessThan(480_000);
  });

  it('classifies hidden mobile copy + .first() as the opening-stock hang', () => {
    expect(
      classifyResponsiveHit({ hiddenCopy: true, visibleCopy: true, usedFirst: true }),
    ).toBe('hidden-first-hang');
    expect(
      classifyResponsiveHit({ hiddenCopy: true, visibleCopy: true, usedFirst: false }),
    ).toBe('unique-visible');
  });

  it('pins journey locators away from hidden .first() selects and 480s inherit', () => {
    const spec = source('playwright/reliability-journey.spec.ts');
    const helper = source('tests/e2e/helpers/preview-qa-locators.ts');
    const config = source('playwright.config.ts');
    expect(helper).toContain('requireExactlyOneVisible');
    expect(helper).toContain('Genuine duplicates — do not pick .first()');
    expect(spec).toContain('requireExactlyOneVisible');
    expect(spec).toContain('till3OpenSelect');
    expect(spec).not.toMatch(/locator\(['"]select['"]\)\.first\(\)/);
    expect(spec).not.toMatch(/locator\(['"]select['"]\)\.filter\(\{ hasText: PRODUCT_NAME \}\)\.first\(\)/);
    expect(spec).not.toMatch(/getByText\(\s*PRODUCT_NAME\s*\)\.first\(\)/);
    expect(config).toMatch(/name: 'reliability-journey'[\s\S]*?actionTimeout:\s*8_000/);
    expect(config).toMatch(/name: 'reliability-journey'[\s\S]*?navigationTimeout:\s*15_000/);
    expect(config).toMatch(/name: 'reliability-journey'[\s\S]*?retries:\s*0/);
    expect(config).toMatch(/name: 'reliability-provisioning'[\s\S]*?actionTimeout:\s*8_000/);
    expect(config).not.toMatch(/test\.setTimeout\(\s*(?:[5-9]\d{5,}|[1-9]\d{6,})/);
  });

  it('covers desktop and mobile dual-render on opening-stock, receipts, POS complete, shifts', () => {
    const opening = source('app/(protected)/setup/opening-stock/OpeningStockClient.tsx');
    const receipts = source('app/(protected)/payments/customer-receipts/page.tsx');
    const pos = source('app/(protected)/pos/PosClient.tsx');
    const shifts = source('app/(protected)/shifts/ShiftClient.tsx');
    expect(opening).toContain('lg:hidden');
    expect(opening).toContain('hidden space-y-3 md:block');
    expect(opening).toContain('aria-label="Product"');
    expect(opening).toContain('aria-label="Unit"');
    expect(receipts).toContain('ResponsiveDataTable');
    expect(receipts).toContain('name="amount"');
    expect(pos).toContain('data-testid="pos-complete-checkout"');
    expect(pos).toContain('data-testid="pos-complete-sheet"');
    expect(pos).toContain('lg:hidden');
    expect(pos).toContain('hidden lg:block');
    expect(shifts).toContain('lg:hidden');
    expect(shifts).toContain('hidden lg:block');
    expect(shifts).toContain('aria-label="Till"');
  });
});
