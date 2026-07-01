'use client';

import { useEffect } from 'react';
import { markTillflowPerformance } from '@/lib/performance/client-performance-marks';

function removeInitialSplash() {
  const el = document.getElementById('tillflow-initial-splash');
  if (!el) return;

  markTillflowPerformance('tillflow.launch.splash.remove.started');
  el.style.transition = 'opacity 0.18s ease';
  el.style.opacity = '0';
  window.setTimeout(() => {
    el.remove();
    markTillflowPerformance('tillflow.launch.splash.removed');
  }, 220);
}

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
        // Mount this only inside real page content so the app shell cannot clear the splash early.
        window.sessionStorage.setItem('tillflow:launchSplashSeen', '1');
        window.sessionStorage.removeItem('tillflow:launching');
      } catch {
        // Storage can be unavailable in private modes; the visual cleanup still matters.
      }
      removeInitialSplash();
    };

    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        completionTimer = window.setTimeout(completeLaunch, 480);
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
