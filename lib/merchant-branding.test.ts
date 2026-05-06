import { describe, expect, it } from 'vitest';
import {
  deriveMerchantInitials,
  getMerchantCompactBrandGuidance,
  resolveMerchantBrandPresentation,
  isSquareLikeAspectRatio,
  isCompactFriendlyAspectRatio,
  isHeroFriendlyAspectRatio,
  shouldPreferInitialsFallback,
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
    expect(result.wasFallbackUsed).toBe(true);
    expect(result.reason).toContain('Primary logo withheld');
  });

  it('uses the square logo on compact surfaces when available', () => {
    const result = resolveMerchantBrandPresentation(
      { ...baseProfile, brandSquareLogoUrl: 'https://cdn.example.com/square.png' },
      'compact-chip',
    );

    expect(result.kind).toBe('image');
    expect(result.source).toBe('square-logo');
    expect(result.imageUrl).toBe('https://cdn.example.com/square.png');
    expect(result.wasFallbackUsed).toBe(false);
  });

  it('uses the primary logo in the storefront hero by default', () => {
    const result = resolveMerchantBrandPresentation(baseProfile, 'storefront-hero');

    expect(result.kind).toBe('image');
    expect(result.source).toBe('primary-logo');
    expect(result.imageUrl).toBe('https://cdn.example.com/primary.png');
    expect(result.wasFallbackUsed).toBe(false);
  });

  it('uses premium initials tile in storefront hero when no logo exists', () => {
    const result = resolveMerchantBrandPresentation(
      { ...baseProfile, logoUrl: null },
      'storefront-hero',
    );

    expect(result.kind).toBe('initials');
    expect(result.wasFallbackUsed).toBe(true);
    expect(result.reason).toContain('No logo available');
  });

  it('always populates the reason field', () => {
    const surfaces: Array<import('./merchant-branding').MerchantBrandSurface> = [
      'admin-shell',
      'compact-chip',
      'storefront-hero',
      'receipt',
      'admin-sidebar',
      'desktop-nav',
      'mobile-nav',
      'storefront-compact',
    ];
    for (const surface of surfaces) {
      const result = resolveMerchantBrandPresentation(baseProfile, surface);
      expect(typeof result.reason).toBe('string');
      expect(result.reason.length).toBeGreaterThan(0);
    }
  });
});

describe('getMerchantCompactBrandGuidance', () => {
  it('explains the smart fallback when no compact asset exists', () => {
    expect(getMerchantCompactBrandGuidance(baseProfile)).toContain('reserved for larger surfaces');
  });

  it('returns null when a dedicated compact asset is available', () => {
    const result = getMerchantCompactBrandGuidance({
      ...baseProfile,
      brandSquareLogoUrl: 'https://cdn.example.com/square.png',
    });
    expect(result).toBeNull();
  });
});

describe('Phase 3 — asset suitability helpers', () => {
  describe('isSquareLikeAspectRatio', () => {
    it('accepts exactly 1:1', () => expect(isSquareLikeAspectRatio(1)).toBe(true));
    it('accepts slightly wide (1.2:1)', () => expect(isSquareLikeAspectRatio(1.2)).toBe(true));
    it('accepts slightly tall (0.8:1)', () => expect(isSquareLikeAspectRatio(0.8)).toBe(true));
    it('rejects a wide banner (3:1)', () => expect(isSquareLikeAspectRatio(3)).toBe(false));
    it('rejects a portrait crop (0.4:1)', () => expect(isSquareLikeAspectRatio(0.4)).toBe(false));
  });

  describe('isCompactFriendlyAspectRatio', () => {
    it('accepts 2:1 wide mark', () => expect(isCompactFriendlyAspectRatio(2)).toBe(true));
    it('accepts 1:1 square', () => expect(isCompactFriendlyAspectRatio(1)).toBe(true));
    it('rejects extremely wide banner (5:1)', () => expect(isCompactFriendlyAspectRatio(5)).toBe(false));
    it('rejects very tall portrait (0.3:1)', () => expect(isCompactFriendlyAspectRatio(0.3)).toBe(false));
  });

  describe('isHeroFriendlyAspectRatio', () => {
    it('accepts standard wide logo (4:1)', () => expect(isHeroFriendlyAspectRatio(4)).toBe(true));
    it('accepts square (1:1)', () => expect(isHeroFriendlyAspectRatio(1)).toBe(true));
    it('rejects extreme banner (8:1)', () => expect(isHeroFriendlyAspectRatio(8)).toBe(false));
  });

  describe('shouldPreferInitialsFallback', () => {
    it('returns true when imageUrl is null', () => {
      expect(shouldPreferInitialsFallback(null, null, 'admin-shell')).toBe(true);
    });

    it('returns false when no aspect ratio data is available', () => {
      expect(shouldPreferInitialsFallback('https://cdn.example.com/logo.png', null, 'admin-shell')).toBe(false);
    });

    it('returns true for a compact surface with a wide banner (3:1)', () => {
      expect(shouldPreferInitialsFallback('https://cdn.example.com/banner.png', 3, 'admin-shell')).toBe(true);
    });

    it('returns false for a compact surface with a square asset (1:1)', () => {
      expect(shouldPreferInitialsFallback('https://cdn.example.com/icon.png', 1, 'compact-chip')).toBe(false);
    });

    it('returns false for a hero surface with a standard wide logo (3:1)', () => {
      expect(shouldPreferInitialsFallback('https://cdn.example.com/logo.png', 3, 'storefront-hero')).toBe(false);
    });

    it('returns true for a hero surface with an extreme banner (8:1)', () => {
      expect(shouldPreferInitialsFallback('https://cdn.example.com/banner.png', 8, 'storefront-hero')).toBe(true);
    });
  });
});
