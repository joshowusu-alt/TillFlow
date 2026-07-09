'use client';

import AppLaunchLoading from '@/components/AppLaunchLoading';

export const ROOT_COLD_START_MESSAGE = 'Opening your business...';
export const ROOT_COLD_START_DETAIL = 'Checking your session and sync status';

/**
 * Root route loading. Renders branded cold-start feedback on the first paint
 * (server and client) so authenticated cold opens never show a blank shell.
 */
export default function RootLaunchLoading() {
  return (
    <AppLaunchLoading
      mode="launch"
      shell="fullscreen"
      message={ROOT_COLD_START_MESSAGE}
      detail={ROOT_COLD_START_DETAIL}
    />
  );
}
