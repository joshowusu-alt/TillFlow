import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  PRODUCT_CREATE_FAULTY_DETAIL_PATH,
  PRODUCT_CREATE_HASH,
  PRODUCT_CREATE_HREF,
  PRODUCT_CREATE_PATHNAME,
  PRODUCT_NOT_FOUND_COPY,
  isExactProductCreateDestination,
  isFaultyProductCreateDetailPath,
  resolveAppRouterHref,
} from './product-create-href';

describe('product-create destination', () => {
  it('keeps the canonical href as /products#product-create, not a detail id', () => {
    expect(PRODUCT_CREATE_HREF).toBe('/products#product-create');
    expect(isExactProductCreateDestination(PRODUCT_CREATE_HREF)).toBe(true);
    expect(isFaultyProductCreateDetailPath(PRODUCT_CREATE_HREF)).toBe(false);
    expect(PRODUCT_CREATE_FAULTY_DETAIL_PATH).toBe('/products/product-create');
    expect(isFaultyProductCreateDetailPath('https://preview.example/products/product-create')).toBe(
      true,
    );
    expect(isExactProductCreateDestination('https://preview.example/products/product-create')).toBe(
      false,
    );
  });

  it('shows how App Router URL resolution can turn the hash into [id]=product-create', () => {
    const fromOnboarding = resolveAppRouterHref(
      PRODUCT_CREATE_HREF,
      'https://preview.example/onboarding#products',
    );
    expect(fromOnboarding.pathname).toBe(PRODUCT_CREATE_PATHNAME);
    expect(fromOnboarding.hash).toBe(`#${PRODUCT_CREATE_HASH}`);

    const hashTreatedAsRelativeId = resolveAppRouterHref(
      PRODUCT_CREATE_HASH,
      'https://preview.example/products/',
    );
    expect(hashTreatedAsRelativeId.pathname).toBe(PRODUCT_CREATE_FAULTY_DETAIL_PATH);
  });

  it('pins the onboarding control to a native hash anchor, not next/link', () => {
    const readiness = readFileSync(join(process.cwd(), 'components/ReadinessJourney.tsx'), 'utf8');
    expect(readiness).toContain('ONBOARDING_ADD_PRODUCT_MANUALLY_NAME');
    expect(readiness).toContain('href={PRODUCT_CREATE_HREF}');
    expect(readiness).toContain('data-testid={ONBOARDING_ADD_PRODUCT_MANUALLY_TESTID}');
    expect(readiness).toMatch(/<a[\s\S]*href=\{PRODUCT_CREATE_HREF\}[\s\S]*\{ONBOARDING_ADD_PRODUCT_MANUALLY_NAME\}/);
    expect(readiness).not.toContain('href="/products#product-create"');
    expect(readiness).not.toContain('<Link href="/products#product-create"');
    expect(readiness).not.toContain("<Link href={'/products#product-create'}");
  });

  it('keeps established-business Add product as a same-page hash anchor', () => {
    const products = readFileSync(join(process.cwd(), 'app/(protected)/products/page.tsx'), 'utf8');
    expect(products).toContain('href="#product-create"');
    expect(products).toContain('Add product');
    expect(products).not.toContain('href="/products/product-create"');
  });

  it('does not let /products/product-create render Product not found', () => {
    const alias = readFileSync(
      join(process.cwd(), 'app/(protected)/products/product-create/page.tsx'),
      'utf8',
    );
    const detail = readFileSync(join(process.cwd(), 'app/(protected)/products/[id]/page.tsx'), 'utf8');
    expect(alias).toContain('PRODUCT_CREATE_HREF');
    expect(alias).toContain('location.replace');
    expect(alias).not.toContain(PRODUCT_NOT_FOUND_COPY);
    expect(detail).toContain(PRODUCT_NOT_FOUND_COPY);
  });
});
