'use client';

import { useState } from 'react';
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
 * authenticated route transitions render nothing so nested route skeletons can show.
 */
export default function RootLaunchLoading() {
  const [intentionalLaunch] = useState(isIntentionalLaunchSession);

  if (!intentionalLaunch) {
    return null;
  }

  return (
    <AppLaunchLoading
      mode="launch"
      shell="fullscreen"
    />
  );
}
