import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  PRODUCT_CREATE_FAULTY_DETAIL_PATH,
  PRODUCT_CREATE_HREF,
  isExactProductCreateDestination,
} from '../../../lib/products/product-create-href';
import { assertExactProductCreateUrl } from './preview-qa-onboarding-manual';

const root = join(__dirname, '..', '..', '..');

function source(rel: string) {
  return readFileSync(join(root, rel), 'utf8');
}

describe('onboarding manual helper', () => {
  it('accepts only /products#product-create and rejects the [id] not-found path', () => {
    expect(() => assertExactProductCreateUrl(PRODUCT_CREATE_HREF)).not.toThrow();
    expect(isExactProductCreateDestination('https://preview.example/products#product-create')).toBe(
      true,
    );
    expect(() => assertExactProductCreateUrl(PRODUCT_CREATE_FAULTY_DETAIL_PATH)).toThrow(
      PRODUCT_CREATE_FAULTY_DETAIL_PATH,
    );
    expect(() => assertExactProductCreateUrl('/products')).toThrow('hash=(none)');
  });

  it('pins the hosted gate to a physical button click with no silent hash fallback', () => {
    const helper = source('tests/e2e/helpers/preview-qa-onboarding-manual.ts');
    const spec = source('playwright/reliability-onboarding-manual.spec.ts');
    expect(helper).toContain('clickOnboardingAddProductManually');
    expect(helper).toContain('requireOnboardingAddProductManually');
    expect(helper).toContain('Direct /products#product-create is not valid evidence');
    expect(helper).toContain('PRODUCT_NOT_FOUND_COPY');
    expect(spec).toContain('clickOnboardingAddProductManually');
    expect(spec).toContain('proveDirectProductCreateHashSeparately');
    expect(spec).not.toContain('runManualProductEntryGate');
    expect(source('tests/e2e/helpers/preview-qa-manual-entry.ts')).toContain(
      'Direct /products#product-create is not valid evidence',
    );
  });
});
