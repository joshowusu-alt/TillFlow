/**
 * Intentional app-entry launch flags.
 * Set only by /launch (LaunchRedirector). Cleared by protected-shell
 * LaunchSessionCompletion. Never set for ordinary route loads, saves, or refreshes.
 */
export const LAUNCHING_SESSION_KEY = 'tillflow:launching';
export const LAUNCH_SPLASH_SEEN_KEY = 'tillflow:launchSplashSeen';

/** True only during the PWA/app-open handoff from /launch until the protected shell completes. */
export function isIntentionalLaunchSession(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return (
      window.sessionStorage.getItem(LAUNCHING_SESSION_KEY) === '1' &&
      window.sessionStorage.getItem(LAUNCH_SPLASH_SEEN_KEY) !== '1'
    );
  } catch {
    return false;
  }
}
