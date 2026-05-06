import { getContrastForeground, normalizeBrandColor, resolvePrimaryBrandColor } from '@/lib/storefront-branding';

export const BRAND_COMPACT_MODES = ['AUTO', 'INITIALS', 'LOGO'] as const;
export type BrandCompactMode = (typeof BRAND_COMPACT_MODES)[number];

export const BRAND_LOGO_BACKGROUNDS = ['AUTO', 'NEUTRAL', 'TRANSPARENT'] as const;
export type BrandLogoBackground = (typeof BRAND_LOGO_BACKGROUNDS)[number];

export type MerchantBrandSurface =
  | 'admin-shell'
  | 'compact-chip'
  | 'storefront-hero'
  | 'receipt';

export type MerchantBrandProfile = {
  businessName: string;
  logoUrl: string | null;
  brandCompactLogoUrl: string | null;
  brandSquareLogoUrl: string | null;
  storefrontLogoUrl?: string | null;
  receiptLogoUrl?: string | null;
  brandInitials?: string | null;
  brandPrimaryColor?: string | null;
  storefrontPrimaryColor?: string | null;
  brandCompactMode?: string | null;
  brandLogoBackground?: string | null;
  storefrontTagline?: string | null;
};

export type MerchantBrandPresentation = {
  kind: 'image' | 'initials';
  imageUrl: string | null;
  initials: string;
  primaryColor: string;
  foregroundColor: string;
  frameTone: 'neutral' | 'transparent' | 'brand';
  source:
    | 'primary-logo'
    | 'compact-logo'
    | 'square-logo'
    | 'storefront-override'
    | 'receipt-override'
    | 'initials';
  reason: string | null;
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

export function getMerchantCompactBrandGuidance(profile: MerchantBrandProfile) {
  const compactMode = normalizeBrandCompactMode(profile.brandCompactMode);
  if (compactMode === 'INITIALS') {
    return 'TillFlow will always use your initials on compact surfaces.';
  }
  if (profile.brandSquareLogoUrl || profile.brandCompactLogoUrl) {
    return null;
  }
  if (compactMode === 'LOGO') {
    return 'TillFlow will try to use your uploaded logo in compact surfaces. Add a compact or square logo for the cleanest result.';
  }
  if (profile.logoUrl) {
    return 'TillFlow will use initials on compact surfaces until you add a compact or square logo, or choose “Use uploaded logo” for compact views.';
  }
  return 'Add a primary logo for large surfaces. TillFlow will use your initials in the meantime.';
}

function resolveFrameTone(
  background: BrandLogoBackground,
  surface: MerchantBrandSurface,
  kind: 'image' | 'initials',
): MerchantBrandPresentation['frameTone'] {
  if (kind === 'initials') return 'brand';
  if (background === 'NEUTRAL') return 'neutral';
  if (background === 'TRANSPARENT') return 'transparent';
  return surface === 'receipt' ? 'transparent' : 'neutral';
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
    reason: string | null = null,
  ): MerchantBrandPresentation => ({
    kind,
    source,
    imageUrl,
    initials,
    primaryColor,
    foregroundColor,
    frameTone: resolveFrameTone(background, surface, kind),
    reason,
  });

  if (surface === 'storefront-hero') {
    if (profile.storefrontLogoUrl) return build('image', 'storefront-override', profile.storefrontLogoUrl);
    if (profile.logoUrl) return build('image', 'primary-logo', profile.logoUrl);
    if (profile.brandCompactLogoUrl) return build('image', 'compact-logo', profile.brandCompactLogoUrl);
    if (profile.brandSquareLogoUrl) return build('image', 'square-logo', profile.brandSquareLogoUrl);
    return build('initials', 'initials', null, 'No uploaded logo is available for the storefront hero.');
  }

  if (surface === 'receipt') {
    if (profile.receiptLogoUrl) return build('image', 'receipt-override', profile.receiptLogoUrl);
    if (profile.brandCompactLogoUrl) return build('image', 'compact-logo', profile.brandCompactLogoUrl);
    if (profile.brandSquareLogoUrl) return build('image', 'square-logo', profile.brandSquareLogoUrl);
    if (profile.logoUrl) return build('image', 'primary-logo', profile.logoUrl);
    return build('initials', 'initials', null, 'Receipt surfaces fall back to initials when no readable logo is available.');
  }

  if (compactMode === 'INITIALS') {
    return build('initials', 'initials', null, 'Compact views are set to always use initials.');
  }
  if (profile.brandSquareLogoUrl) return build('image', 'square-logo', profile.brandSquareLogoUrl);
  if (profile.brandCompactLogoUrl) return build('image', 'compact-logo', profile.brandCompactLogoUrl);
  if (compactMode === 'LOGO' && profile.logoUrl) {
    return build('image', 'primary-logo', profile.logoUrl, 'Compact views are allowed to use the uploaded logo.');
  }
  return build(
    'initials',
    'initials',
    null,
    profile.logoUrl
      ? 'Primary logos stay on larger surfaces unless a compact asset is provided.'
      : 'TillFlow uses initials until a logo is added.',
  );
}

export function normalizeMerchantBrandInitials(value: string | null | undefined) {
  return sanitizeInitials(value);
}

export function normalizeMerchantBrandPrimaryColor(value: string | null | undefined) {
  return normalizeBrandColor(value);
}
