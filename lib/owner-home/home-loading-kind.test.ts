import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homeLoadingKindFromFacts } from './home-loading-kind';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

describe('Owner Home loading kind', () => {
  it('treats first sale or completedAt as established and never uses product counts', () => {
    expect(homeLoadingKindFromFacts({ onboardingCompletedAt: new Date(), hasFirstSale: false })).toBe(
      'established',
    );
    expect(homeLoadingKindFromFacts({ onboardingCompletedAt: null, hasFirstSale: true })).toBe('established');
    expect(homeLoadingKindFromFacts({ onboardingCompletedAt: null, hasFirstSale: false })).toBe('checklist');
    expect(read('lib/owner-home/home-loading-kind.ts')).not.toContain('product.count');
    expect(read('app/(protected)/loading.tsx')).toContain('isOnboardingPath');
    expect(read('app/(protected)/onboarding/HomeInstantLoading.tsx')).toContain('getOwnerHomeLoadingKind');
  });
});
