'use client';

import { useEffect, useState } from 'react';
import AppLaunchLoading from '@/components/AppLaunchLoading';

function isActiveLaunchHandoff() {
  try {
    return (
      window.sessionStorage.getItem('tillflow:launching') === '1' &&
      window.sessionStorage.getItem('tillflow:launchSplashSeen') !== '1'
    );
  } catch {
    return false;
  }
}

/**
 * Root route loading. During an active launch handoff the inline
 * #tillflow-initial-splash already covers the screen — avoid stacking
 * another fullscreen launch layer on top.
 */
export default function RootLaunchLoading() {
  const [showLaunchLoading, setShowLaunchLoading] = useState<boolean | null>(null);

  useEffect(() => {
    setShowLaunchLoading(!isActiveLaunchHandoff());
  }, []);

  if (showLaunchLoading !== true) {
    return null;
  }

  return <AppLaunchLoading mode="launch" shell="fullscreen" />;
}
