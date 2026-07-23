/**
 * Cold-boot launch handoff timings (Trust Breakers T2b).
 * Redirect immediately once the launch route is ready — no artificial timer.
 */
export const LAUNCH_REDIRECT_DELAY_MS = 0;

/** Brief paint hold after protected shell mounts before fading the pre-hydration splash. */
export const LAUNCH_COMPLETION_HOLD_MS = 120;

/** CSS opacity transition duration for splash removal. */
export const LAUNCH_SPLASH_TRANSITION_MS = 180;

/** DOM removal delay after splash fade starts (must be >= transition duration). */
export const LAUNCH_SPLASH_FADE_MS = LAUNCH_SPLASH_TRANSITION_MS;
