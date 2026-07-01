/**
 * Cold-boot launch handoff timings (Trust Breakers T2b).
 * Keep redirect delay stable; completion hold is shell-driven after auth.
 */
export const LAUNCH_REDIRECT_DELAY_MS = 160;

/** Brief paint hold after protected shell mounts before fading the pre-hydration splash. */
export const LAUNCH_COMPLETION_HOLD_MS = 120;

/** DOM removal delay after splash fade starts. */
export const LAUNCH_SPLASH_FADE_MS = 160;

/** CSS opacity transition duration for splash removal. */
export const LAUNCH_SPLASH_TRANSITION_MS = 180;
