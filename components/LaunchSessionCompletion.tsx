'use client';

import { useEffect } from 'react';
import { markTillflowPerformance } from '@/lib/performance/client-performance-marks';
import { LAUNCH_COMPLETION_HOLD_MS } from '@/lib/performance/launch-handoff-timing';

export default function LaunchSessionCompletion() {
  useEffect(() => {
    let secondFrame = 0;
    let completionTimer: number | null = null;

    try {
      if (window.sessionStorage.getItem('tillflow:launching') !== '1') {
        return;
      }
    } catch {
      return;
    }

    markTillflowPerformance('tillflow.launch.completion.mounted');

    const completeLaunch = () => {
      try {
        // Mount inside the protected shell so launch flags clear once auth/layout is ready,
        // not after the full readiness body finishes loading.
        window.sessionStorage.setItem('tillflow:launchSplashSeen', '1');
        window.sessionStorage.removeItem('tillflow:launching');
      } catch {
        // Storage can be unavailable in private modes; the visual cleanup still matters.
      }
      markTillflowPerformance('tillflow.launch.handoff.completed');
    };

    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        completionTimer = window.setTimeout(completeLaunch, LAUNCH_COMPLETION_HOLD_MS);
      });
    });

    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
      if (completionTimer) {
        window.clearTimeout(completionTimer);
      }
    };
  }, []);

  return null;
}
