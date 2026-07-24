import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

describe('Owner-facing business language', () => {
  const skeleton = read('app/(protected)/onboarding/OwnerReadinessSkeleton.tsx');
  const activationSteps = read('lib/activation-steps.ts');
  const weeklyDigest = read('app/(protected)/reports/weekly-digest/page.tsx');
  const reorderSuggestions = read('app/(protected)/reports/reorder-suggestions/page.tsx');
  const settingsPage = read('app/(protected)/settings/page.tsx');
  const categoryPicker = read('components/onboarding/BusinessCategoryPicker.tsx');

  it('uses business wording on the owner readiness skeleton', () => {
    expect(skeleton).toContain('Preparing owner home');
    expect(skeleton).not.toContain('Today in your shop');
    expect(skeleton).not.toContain('your shop');
  });

  it('uses business wording in activation guidance', () => {
    expect(activationSteps).toContain('Add your business name and type');
    expect(activationSteps).toContain('Tell us about your business');
    expect(activationSteps).not.toContain('your shop name');
    expect(activationSteps).not.toContain('kind of shop you run');
  });

  it('uses business setup wording on owner report empty states', () => {
    expect(weeklyDigest).toContain('Complete your business setup');
    expect(reorderSuggestions).toContain('Complete your business setup');
    expect(weeklyDigest).not.toContain('your shop setup');
    expect(reorderSuggestions).not.toContain('your shop setup');
  });

  it('uses business wording in settings and category labels', () => {
    expect(settingsPage).toContain('day-to-day business use');
    expect(settingsPage).toContain('Provisions business');
    expect(settingsPage).not.toContain('live shop use');
    expect(categoryPicker).toContain("PROVISION: 'Provisions business'");
    expect(categoryPicker).not.toContain('Provision shop');
  });
});
