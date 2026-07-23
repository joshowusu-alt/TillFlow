'use client';

import AppLaunchLoading from '@/components/AppLaunchLoading';
import {
  LAUNCH_GENERIC_DETAIL,
  LAUNCH_GENERIC_MESSAGE,
} from '@/lib/launch/business-identity';

/** Generic fallback copy — RootLaunchLoading personalises when a safe name exists. */
export const ROOT_COLD_START_MESSAGE = LAUNCH_GENERIC_MESSAGE;
export const ROOT_COLD_START_DETAIL = LAUNCH_GENERIC_DETAIL;

/**
 * Root route loading. Uses the shared launch-copy contract so a safe cached
 * business name stays visible across `/launch` → `/onboarding` (no generic regression).
 */
export default function RootLaunchLoading() {
  return (
    <AppLaunchLoading
      mode="launch"
      shell="fullscreen"
    />
  );
}
