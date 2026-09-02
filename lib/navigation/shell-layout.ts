/**
 * App-shell layout contract. One mode at a time — CSS and Playwright share this.
 *
 * Tailwind `lg` is 1024px. Below that the bottom tab bar is the primary menu.
 * Compact phone landscape is a short landscape viewport that is still below `lg`.
 * Short desktop (≥1024 × ≤500) keeps header Sign out; it is not phone-compact.
 */

export const SHELL_LG_PX = 1024;
export const SHELL_COMPACT_LANDSCAPE_MAX_HEIGHT_PX = 500;
export const SHELL_MIN_TOUCH_TARGET_PX = 44;

export const SHELL_COMPACT_LANDSCAPE_MQ =
  `(orientation: landscape) and (max-height: ${SHELL_COMPACT_LANDSCAPE_MAX_HEIGHT_PX}px) and (max-width: ${SHELL_LG_PX - 1}px)`;

export const SHELL_PHONE_KEYBOARD_MQ =
  `(orientation: portrait) and (max-height: ${SHELL_COMPACT_LANDSCAPE_MAX_HEIGHT_PX}px) and (max-width: 767px)`;

export const SHELL_DESKTOP_SHORT_MQ =
  `(orientation: landscape) and (max-height: ${SHELL_COMPACT_LANDSCAPE_MAX_HEIGHT_PX}px) and (min-width: ${SHELL_LG_PX}px)`;

export type ShellMode =
  | 'phone-portrait'
  | 'phone-landscape-compact'
  | 'phone-keyboard'
  | 'tablet'
  | 'desktop-short'
  | 'desktop';

export function classifyShellLayout(input: {
  width: number;
  height: number;
  /** When omitted, landscape is inferred from width > height. */
  orientation?: 'portrait' | 'landscape';
}): ShellMode {
  const orientation =
    input.orientation ?? (input.width >= input.height ? 'landscape' : 'portrait');
  const isLandscape = orientation === 'landscape';
  const isShort = input.height <= SHELL_COMPACT_LANDSCAPE_MAX_HEIGHT_PX;

  if (input.width >= SHELL_LG_PX) {
    return isLandscape && isShort ? 'desktop-short' : 'desktop';
  }
  if (isLandscape && isShort) return 'phone-landscape-compact';
  if (!isLandscape && isShort && input.width < 768) return 'phone-keyboard';
  if (input.width >= 768) return 'tablet';
  return 'phone-portrait';
}

/** Bottom tabs exist below `lg`. POS hides them in the component. */
export function shellUsesBottomTabs(mode: ShellMode, isPosRoute: boolean): boolean {
  if (isPosRoute) return false;
  return mode !== 'desktop' && mode !== 'desktop-short';
}

/** Header hamburger is POS-only below `lg`. Non-POS uses More, not a second menu. */
export function shellShowsHeaderHamburger(mode: ShellMode, isPosRoute: boolean): boolean {
  if (!isPosRoute) return false;
  return mode !== 'desktop' && mode !== 'desktop-short';
}

/**
 * Header Sign out: tablet and desktop. Compact phone landscape uses More.
 * Narrow portrait phones also use More (header is too tight for a second control).
 */
export function shellShowsHeaderSignOut(mode: ShellMode): boolean {
  return mode !== 'phone-landscape-compact' && mode !== 'phone-portrait' && mode !== 'phone-keyboard';
}

export function shellShowsMoreDrawerSignOut(mode: ShellMode, isPosRoute: boolean): boolean {
  return shellUsesBottomTabs(mode, isPosRoute) || isPosRoute;
}
