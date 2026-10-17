import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

describe('onboarding mutation freshness', () => {
  it('revalidates setup after the business profile is saved', () => {
    const onboarding = read('app/actions/onboarding.ts');
    const save = onboarding.slice(onboarding.indexOf('export async function updateOnboardingBusinessProfile'));
    expect(save).toContain("revalidatePath('/onboarding')");
    expect(save).toContain("revalidateTag(`readiness-${business.id}`)");
  });

  it('revalidates the product list before the created redirect', () => {
    const products = read('app/actions/products.ts');
    const create = products.slice(
      products.indexOf('export async function createProductAction'),
      products.indexOf('export async function updateProductAction'),
    );
    expect(create.indexOf("revalidatePath('/products')")).toBeGreaterThan(-1);
    expect(create.indexOf("revalidatePath('/products')")).toBeLessThan(create.indexOf('redirect(`/products?${createdQuery}`)'));
    expect(create).toContain("revalidatePath('/onboarding')");
    expect(create).toContain("created=1");
  });

  it('confirms a created product on the list page and labels the real unit', () => {
    const page = read('app/(protected)/products/page.tsx');
    expect(page).toContain('role="status"');
    expect(page).toContain('data-testid="product-created-banner"');
    expect(page).toContain('formatCatalogueUnitLabel');
    expect(page).toContain('listSelectableUnits');
    expect(page).not.toContain('conversionToBase + 2');
  });

  it('advances setup in the client without waiting for a stale refresh', () => {
    const journey = read('components/ReadinessJourney.tsx');
    expect(journey).toContain('handleBusinessProfileSaved');
    expect(journey).toContain('pendingBusinessProfileRef');
    expect(journey).toContain('computeOnboardingJourney');
    expect(journey).toContain('role="status"');
  });
});
