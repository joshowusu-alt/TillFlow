/**
 * Storefront branding helpers.
 *
 * Branding is intentionally limited: logo, primary colour, accent colour,
 * tagline. The storefront's overall layout, typography, semantic status
 * colours (warning / danger / success), and structure remain fixed.
 *
 * Plan tiering:
 *   Growth: logo + primary colour
 *   Pro: + accent colour + tagline
 */

const HEX_PATTERN = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
export const DEFAULT_STOREFRONT_PRIMARY = '#2563eb';
const ACCIDENTAL_CYAN_DEFAULTS = new Set(['#01f7ff', '#06b6d4', '#0ea5e9', '#22d3ee']);

export function normalizeBrandColor(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!HEX_PATTERN.test(trimmed)) return null;
  return trimmed.toLowerCase();
}

export function resolvePrimaryBrandColor(value: string | null | undefined): string {
  const normalized = normalizeBrandColor(value);
  if (!normalized || ACCIDENTAL_CYAN_DEFAULTS.has(normalized)) {
    return DEFAULT_STOREFRONT_PRIMARY;
  }
  return normalized;
}

/** Compute a contrast-safe foreground colour (black or white) against `hex`. */
export function getContrastForeground(hex: string | null | undefined): string {
  const normalized = normalizeBrandColor(hex);
  if (!normalized) return '#ffffff';
  const expanded =
    normalized.length === 4
      ? `#${normalized[1]}${normalized[1]}${normalized[2]}${normalized[2]}${normalized[3]}${normalized[3]}`
      : normalized;
  const r = parseInt(expanded.slice(1, 3), 16);
  const g = parseInt(expanded.slice(3, 5), 16);
  const b = parseInt(expanded.slice(5, 7), 16);
  // Relative luminance per WCAG.
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.5 ? '#0f172a' : '#ffffff';
}

export type StorefrontBranding = {
  logoUrl: string | null;
  primaryColor: string | null;
  accentColor: string | null;
  tagline: string | null;
};

export function resolveBrandStyles(branding: StorefrontBranding): {
  cssVars: Record<string, string>;
  hasPrimary: boolean;
  hasAccent: boolean;
} {
  const primary = resolvePrimaryBrandColor(branding.primaryColor);
  const accent = normalizeBrandColor(branding.accentColor);
  const cssVars: Record<string, string> = {};
  cssVars['--brand-primary'] = primary;
  cssVars['--brand-primary-foreground'] = getContrastForeground(primary);
  if (accent) {
    cssVars['--brand-accent'] = accent;
    cssVars['--brand-accent-foreground'] = getContrastForeground(accent);
  }
  return {
    cssVars,
    hasPrimary: true,
    hasAccent: Boolean(accent),
  };
}
