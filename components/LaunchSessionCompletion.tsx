'use client';

import { useEffect } from 'react';
import { markTillflowPerformance } from '@/lib/performance/client-performance-marks';
import {
  LAUNCH_COMPLETION_HOLD_MS,
  LAUNCH_SPLASH_FADE_MS,
  LAUNCH_SPLASH_TRANSITION_MS,
} from '@/lib/performance/launch-handoff-timing';

function removeInitialSplash() {
  const el = document.getElementById('tillflow-initial-splash');
  if (!el) return;

  markTillflowPerformance('tillflow.launch.splash.remove.started');

  // Freeze the entry slide animation so the fade does not compete with transform.
  el.style.animation = 'none';
  el.style.transform = 'none';
  // Keep full-screen fixed coverage through the entire opacity fade.
  el.style.position = 'fixed';
  el.style.inset = '0';
  el.style.width = '100%';
  el.style.height = '100%';
  el.style.pointerEvents = 'none';

  el.style.transition = `opacity ${LAUNCH_SPLASH_TRANSITION_MS / 1000}s ease`;
  el.style.opacity = '0';
  window.setTimeout(() => {
    el.remove();
    markTillflowPerformance('tillflow.launch.splash.removed');
  }, LAUNCH_SPLASH_FADE_MS);
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
        // Mount inside the protected shell so splash clears once auth/layout is ready,
        // not after the full readiness body finishes loading.
        window.sessionStorage.setItem('tillflow:launchSplashSeen', '1');
        window.sessionStorage.removeItem('tillflow:launching');
      } catch {
        // Storage can be unavailable in private modes; the visual cleanup still matters.
      }
      removeInitialSplash();
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
