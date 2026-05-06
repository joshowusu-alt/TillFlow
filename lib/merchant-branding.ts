import { getContrastForeground, normalizeBrandColor, resolvePrimaryBrandColor } from '@/lib/storefront-branding';

export const BRAND_COMPACT_MODES = ['AUTO', 'INITIALS', 'LOGO'] as const;
export type BrandCompactMode = (typeof BRAND_COMPACT_MODES)[number];

export const BRAND_LOGO_BACKGROUNDS = [
  'AUTO',
  'NEUTRAL',     // kept for backward compat — behaves like WHITE_TILE
  'TRANSPARENT',
  'SOFT_TILE',
  'WHITE_TILE',
  'TINTED_TILE',
  'OUTLINE_TILE',
] as const;
export type BrandLogoBackground = (typeof BRAND_LOGO_BACKGROUNDS)[number];

export type MerchantBrandSurface =
  | 'admin-shell'
  | 'admin-sidebar'
  | 'compact-chip'
  | 'storefront-hero'
  | 'storefront-compact'
  | 'receipt'
  | 'desktop-nav'
  | 'mobile-nav';

/** Surfaces where primary logos must not leak through in AUTO mode. */
export const COMPACT_SURFACES = new Set<MerchantBrandSurface>([
  'admin-shell',
  'admin-sidebar',
  'compact-chip',
  'storefront-compact',
  'desktop-nav',
  'mobile-nav',
]);

export type MerchantBrandProfile = {
  businessName: string;
  logoUrl: string | null;
  /** Pixel dimensions of the primary logo, if stored at upload time. */
  logoWidth?: number | null;
  logoHeight?: number | null;
  brandCompactLogoUrl: string | null;
  brandCompactLogoWidth?: number | null;
  brandCompactLogoHeight?: number | null;
  brandSquareLogoUrl: string | null;
  brandSquareLogoWidth?: number | null;
  brandSquareLogoHeight?: number | null;
  storefrontLogoUrl?: string | null;
  receiptLogoUrl?: string | null;
  brandInitials?: string | null;
  brandPrimaryColor?: string | null;
  storefrontPrimaryColor?: string | null;
  brandCompactMode?: string | null;
  brandLogoBackground?: string | null;
  storefrontTagline?: string | null;
};

export type FrameTone = 'neutral' | 'transparent' | 'brand' | 'soft' | 'tinted' | 'outline';

export type MerchantBrandPresentation = {
  kind: 'image' | 'initials';
  imageUrl: string | null;
  initials: string;
  primaryColor: string;
  foregroundColor: string;
  frameTone: FrameTone;
  source:
    | 'primary-logo'
    | 'compact-logo'
    | 'square-logo'
    | 'storefront-override'
    | 'receipt-override'
    | 'initials';
  /** Human-readable explanation of the rendering decision. Always populated. */
  reason: string;
  /** True when the first-choice asset was withheld and TillFlow fell back to a safer option. */
  wasFallbackUsed: boolean;
};

export function normalizeBrandCompactMode(value: string | null | undefined): BrandCompactMode {
  return BRAND_COMPACT_MODES.includes((value ?? '').toUpperCase() as BrandCompactMode)
    ? ((value ?? '').toUpperCase() as BrandCompactMode)
    : 'AUTO';
}

export function normalizeBrandLogoBackground(value: string | null | undefined): BrandLogoBackground {
  return BRAND_LOGO_BACKGROUNDS.includes((value ?? '').toUpperCase() as BrandLogoBackground)
    ? ((value ?? '').toUpperCase() as BrandLogoBackground)
    : 'AUTO';
}

function sanitizeInitials(value: string | null | undefined) {
  const cleaned = (value ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 3);
  return cleaned || null;
}

export function deriveMerchantInitials(name: string, override?: string | null) {
  const custom = sanitizeInitials(override);
  if (custom) return custom;

  const words = name
    .split(/\s+/)
    .map((word) => word.replace(/[^A-Za-z0-9]/g, ''))
    .filter(Boolean);

  if (words.length === 0) return 'TF';
  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }

  return words
    .slice(0, 2)
    .map((word) => word[0]!.toUpperCase())
    .join('');
}

export function resolveMerchantBrandPrimaryColor(profile: MerchantBrandProfile) {
  return resolvePrimaryBrandColor(profile.brandPrimaryColor ?? profile.storefrontPrimaryColor);
}

export function getMerchantCompactBrandGuidance(profile: MerchantBrandProfile): string | null {
  const compactMode = normalizeBrandCompactMode(profile.brandCompactMode);
  if (compactMode === 'INITIALS') {
    return 'Compact strategy is set to always use initials. The admin header, navigation chips, and compact identity areas will all show your initials tile.';
  }
  if (profile.brandSquareLogoUrl || profile.brandCompactLogoUrl) {
    // Dedicated compact assets are available — no guidance needed.
    return null;
  }
  if (compactMode === 'LOGO') {
    return 'Your primary logo is permitted in compact contexts. For the cleanest result on chips and headers, upload a dedicated compact or square logo instead.';
  }
  if (profile.logoUrl) {
    return 'Your primary logo is reserved for larger surfaces. TillFlow will use your initials tile in compact areas — upload a square or compact logo to show a brand mark in chips and headers.';
  }
  return 'Upload a primary logo for the storefront and larger surfaces. TillFlow will use your initials tile until a logo is added.';
}

function resolveFrameTone(
  background: BrandLogoBackground,
  surface: MerchantBrandSurface,
  kind: 'image' | 'initials',
): FrameTone {
  if (kind === 'initials') return 'brand';
  switch (background) {
    case 'NEUTRAL':
    case 'WHITE_TILE':
      return 'neutral';
    case 'TRANSPARENT':
      return 'transparent';
    case 'SOFT_TILE':
      return 'soft';
    case 'TINTED_TILE':
      return 'tinted';
    case 'OUTLINE_TILE':
      return 'outline';
    case 'AUTO':
    default:
      // Neutral white frame is the safest default across all surfaces:
      // it prevents logos from looking pasted against dark/branded backgrounds.
      return 'neutral';
  }
}

export function resolveMerchantBrandPresentation(
  profile: MerchantBrandProfile,
  surface: MerchantBrandSurface,
): MerchantBrandPresentation {
  const initials = deriveMerchantInitials(profile.businessName, profile.brandInitials);
  const compactMode = normalizeBrandCompactMode(profile.brandCompactMode);
  const background = normalizeBrandLogoBackground(profile.brandLogoBackground);
  const primaryColor = resolveMerchantBrandPrimaryColor(profile);
  const foregroundColor = getContrastForeground(primaryColor);

  const build = (
    kind: MerchantBrandPresentation['kind'],
    source: MerchantBrandPresentation['source'],
    imageUrl: string | null,
    reason: string,
    wasFallbackUsed = false,
  ): MerchantBrandPresentation => ({
    kind,
    source,
    imageUrl,
    initials,
    primaryColor,
    foregroundColor,
    frameTone: resolveFrameTone(background, surface, kind),
    reason,
    wasFallbackUsed,
  });

  // Compute aspect ratio for each slot from stored dimensions.
  const primaryAspect = aspectRatioFromDimensions(profile.logoWidth, profile.logoHeight);
  const compactAspect = aspectRatioFromDimensions(profile.brandCompactLogoWidth, profile.brandCompactLogoHeight);
  const squareAspect  = aspectRatioFromDimensions(profile.brandSquareLogoWidth,  profile.brandSquareLogoHeight);

  if (surface === 'storefront-hero') {
    if (profile.storefrontLogoUrl)
      return build('image', 'storefront-override', profile.storefrontLogoUrl, 'Storefront-specific logo used for the hero.', false);
    if (profile.logoUrl && !shouldPreferInitialsFallback(profile.logoUrl, primaryAspect, surface))
      return build('image', 'primary-logo', profile.logoUrl, 'Primary logo used for storefront hero.', false);
    if (profile.brandCompactLogoUrl && !shouldPreferInitialsFallback(profile.brandCompactLogoUrl, compactAspect, surface))
      return build('image', 'compact-logo', profile.brandCompactLogoUrl, 'Compact logo used — no primary logo uploaded yet.', Boolean(profile.logoUrl));
    if (profile.brandSquareLogoUrl && !shouldPreferInitialsFallback(profile.brandSquareLogoUrl, squareAspect, surface))
      return build('image', 'square-logo', profile.brandSquareLogoUrl, 'Square logo used — no primary logo available.', Boolean(profile.logoUrl));
    return build(
      'initials',
      'initials',
      null,
      profile.logoUrl
        ? 'Primary logo withheld — aspect ratio is unsuitable for the hero. Upload a better-proportioned logo.'
        : 'No logo available — TillFlow is showing a premium initials tile. Upload a primary logo for the storefront hero.',
      true,
    );
  }

  if (surface === 'receipt') {
    if (profile.receiptLogoUrl)
      return build('image', 'receipt-override', profile.receiptLogoUrl, 'Receipt-specific logo used.', false);
    if (profile.brandCompactLogoUrl && !shouldPreferInitialsFallback(profile.brandCompactLogoUrl, compactAspect, surface))
      return build('image', 'compact-logo', profile.brandCompactLogoUrl, 'Compact logo used for receipt — optimised for small print clarity.', false);
    if (profile.brandSquareLogoUrl && !shouldPreferInitialsFallback(profile.brandSquareLogoUrl, squareAspect, surface))
      return build('image', 'square-logo', profile.brandSquareLogoUrl, 'Square logo used for receipt clarity.', false);
    if (profile.logoUrl && !shouldPreferInitialsFallback(profile.logoUrl, primaryAspect, surface))
      return build('image', 'primary-logo', profile.logoUrl, 'Primary logo is the best available option for this receipt.', false);
    return build(
      'initials',
      'initials',
      null,
      'No logo available — TillFlow is showing a premium initials tile.',
      true,
    );
  }

  if (compactMode === 'INITIALS') {
    return build('initials', 'initials', null, 'Compact surface strategy is set to always use initials.', false);
  }
  if (profile.brandSquareLogoUrl && !shouldPreferInitialsFallback(profile.brandSquareLogoUrl, squareAspect, surface)) {
    return build('image', 'square-logo', profile.brandSquareLogoUrl, 'Square logo used — best choice for compact surfaces.', false);
  }
  if (profile.brandCompactLogoUrl && !shouldPreferInitialsFallback(profile.brandCompactLogoUrl, compactAspect, surface)) {
    return build('image', 'compact-logo', profile.brandCompactLogoUrl, 'Compact logo used — optimised for chips and compact shells.', false);
  }
  if (compactMode === 'LOGO' && profile.logoUrl && !shouldPreferInitialsFallback(profile.logoUrl, primaryAspect, surface)) {
    return build(
      'image',
      'primary-logo',
      profile.logoUrl,
      'Primary logo used in compact context — add a square or compact logo for the best result.',
      true,
    );
  }
  return build(
    'initials',
    'initials',
    null,
    profile.logoUrl
      ? 'Primary logo withheld from compact surface. Add a compact or square logo, or change compact strategy to \'Use logo\'.'
      : 'TillFlow uses a premium initials tile until a logo is uploaded.',
    Boolean(profile.logoUrl),
  );
}

export function normalizeMerchantBrandInitials(value: string | null | undefined) {
  return sanitizeInitials(value);
}

export function normalizeMerchantBrandPrimaryColor(value: string | null | undefined) {
  return normalizeBrandColor(value);
}

// ---------------------------------------------------------------------------
// Phase 3 — Asset suitability gates
//
// These helpers evaluate whether an asset's aspect ratio (width ÷ height) makes
// it suitable for a given class of surface. Use them when image dimensions are
// available (e.g. after upload or from stored metadata).
//
// The merchantBranding engine already enforces suitability via dedicated upload
// slots (square / compact / primary). These utilities provide an additional layer
// of validation that can be wired to upload metadata or client-side naturalWidth /
// naturalHeight values.
// ---------------------------------------------------------------------------

/**
 * True when the aspect ratio (w ÷ h) is square-like — within ±25% of 1 : 1.
 * Square-like assets are safe for chip-sized surfaces:
 * admin-shell, compact-chip, mobile-nav, desktop-nav.
 */
export function isSquareLikeAspectRatio(aspectRatio: number): boolean {
  return aspectRatio >= 0.75 && aspectRatio <= 1.33;
}

/**
 * True when the asset's proportions are compact-friendly — not so wide that it
 * becomes illegible or cropped in a narrow horizontal slot.
 * Roughly covers aspect ratios from 0.5 : 1 up to 4 : 1.
 */
export function isCompactFriendlyAspectRatio(aspectRatio: number): boolean {
  return aspectRatio >= 0.5 && aspectRatio <= 4.0;
}

/**
 * True when the asset is suitable for a large hero or card surface.
 * Very narrow or very tall logos are excluded because they produce awkward
 * presentation in hero-width containers.
 */
export function isHeroFriendlyAspectRatio(aspectRatio: number): boolean {
  return aspectRatio >= 0.25 && aspectRatio <= 6.0;
}

/**
 * Derive an aspect ratio from natural image dimensions.
 * Returns null when dimensions are unavailable or zero.
 */
export function aspectRatioFromDimensions(
  width: number | null | undefined,
  height: number | null | undefined,
): number | null {
  if (!width || !height || height === 0) return null;
  return width / height;
}

/**
 * Returns true when TillFlow should prefer the premium initials tile over the
 * provided URL, given the surface in question.
 *
 * This is intentionally conservative: the engine withholds a logo only when the
 * aspect ratio data is present AND clearly wrong for the surface. If no metadata
 * is stored, apply the existing slot-based waterfall instead.
 */
export function shouldPreferInitialsFallback(
  imageUrl: string | null | undefined,
  aspectRatio: number | null | undefined,
  surface: MerchantBrandSurface,
): boolean {
  // No URL → always fall back.
  if (!imageUrl) return true;
  // No metadata → trust the slot — do not penalise merchants without stored dimensions.
  if (aspectRatio == null) return false;

  if (COMPACT_SURFACES.has(surface)) {
    // Compact surfaces must be square-like; reject anything dramatically off-square.
    return !isSquareLikeAspectRatio(aspectRatio);
  }
  if (surface === 'storefront-hero' || surface === 'receipt') {
    return !isHeroFriendlyAspectRatio(aspectRatio);
  }
  return false;
}
