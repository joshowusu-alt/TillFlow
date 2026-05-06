import { describe, expect, it } from 'vitest';
import {
  deriveMerchantInitials,
  getMerchantCompactBrandGuidance,
  resolveMerchantBrandPresentation,
  type MerchantBrandProfile,
} from './merchant-branding';

const baseProfile: MerchantBrandProfile = {
  businessName: 'El-Shaddai Supermarket',
  logoUrl: 'https://cdn.example.com/primary.png',
  brandCompactLogoUrl: null,
  brandSquareLogoUrl: null,
  brandInitials: null,
  brandPrimaryColor: '#1d4ed8',
  brandCompactMode: 'AUTO',
  brandLogoBackground: 'AUTO',
};

describe('deriveMerchantInitials', () => {
  it('uses custom initials when provided', () => {
    expect(deriveMerchantInitials('El-Shaddai Supermarket', ' tf ')).toBe('TF');
  });

  it('derives initials from the business name when no override exists', () => {
    expect(deriveMerchantInitials('El-Shaddai Supermarket')).toBe('ES');
  });
});

describe('resolveMerchantBrandPresentation', () => {
  it('uses initials for compact surfaces when only the primary logo exists', () => {
    const result = resolveMerchantBrandPresentation(baseProfile, 'admin-shell');

    expect(result.kind).toBe('initials');
    expect(result.initials).toBe('ES');
    expect(result.reason).toContain('Primary logos stay on larger surfaces');
  });

  it('uses the square logo on compact surfaces when available', () => {
    const result = resolveMerchantBrandPresentation(
      { ...baseProfile, brandSquareLogoUrl: 'https://cdn.example.com/square.png' },
      'compact-chip',
    );

    expect(result.kind).toBe('image');
    expect(result.source).toBe('square-logo');
    expect(result.imageUrl).toBe('https://cdn.example.com/square.png');
  });

  it('uses the primary logo in the storefront hero by default', () => {
    const result = resolveMerchantBrandPresentation(baseProfile, 'storefront-hero');

    expect(result.kind).toBe('image');
    expect(result.source).toBe('primary-logo');
    expect(result.imageUrl).toBe('https://cdn.example.com/primary.png');
  });
});

describe('getMerchantCompactBrandGuidance', () => {
  it('explains the smart fallback when no compact asset exists', () => {
    expect(getMerchantCompactBrandGuidance(baseProfile)).toContain('TillFlow will use initials');
  });
});
