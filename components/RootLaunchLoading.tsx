'use client';

import { useState } from 'react';
import ProtectedRouteLoading from '@/components/ProtectedRouteLoading';
import AppLaunchLoading from '@/components/AppLaunchLoading';
import {
  LAUNCH_GENERIC_DETAIL,
  LAUNCH_GENERIC_MESSAGE,
} from '@/lib/launch/business-identity';
import { isIntentionalLaunchSession } from '@/lib/launch/launch-session';

/** Generic fallback copy — RootLaunchLoading personalises when a safe name exists. */
export const ROOT_COLD_START_MESSAGE = LAUNCH_GENERIC_MESSAGE;
export const ROOT_COLD_START_DETAIL = LAUNCH_GENERIC_DETAIL;

/**
 * Root Instant Loading UI.
 * Fullscreen TillFlow launch branding is gated to an intentional /launch session
 * (`tillflow:launching`). Ordinary hard refreshes, post-save redirects, and
 * authenticated root waits use a neutral skeleton instead of an empty screen.
 */
export default function RootLaunchLoading() {
  const [intentionalLaunch] = useState(isIntentionalLaunchSession);

  if (!intentionalLaunch) {
    return <div className="min-h-screen bg-paper px-4 py-6 sm:px-6"><ProtectedRouteLoading /></div>;
  }

  return (
    <AppLaunchLoading
      mode="launch"
      shell="fullscreen"
    />
  );
}
