'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { markTillflowPerformance } from '@/lib/performance/client-performance-marks';
import { LAUNCH_REDIRECT_DELAY_MS } from '@/lib/performance/launch-handoff-timing';
import { getLaunchCopy } from '@/lib/launch/business-identity';

export default function LaunchRedirector() {
  const router = useRouter();
  const initialCopy = getLaunchCopy();
  const [message, setMessage] = useState(initialCopy.message);
  const [detail, setDetail] = useState(initialCopy.detail);

  useEffect(() => {
    markTillflowPerformance('tillflow.launch.mounted');

    try {
      window.sessionStorage.setItem('tillflow:launching', '1');
      window.sessionStorage.removeItem('tillflow:launchSplashSeen');

      const copy = getLaunchCopy();
      setMessage(copy.message);
      setDetail(copy.detail);
    } catch {
      const copy = getLaunchCopy(null);
      setMessage(copy.message);
      setDetail(copy.detail);
    }

    let timeoutId: number | null = null;
    let firstFrame = 0;
    let secondFrame = 0;
    let cancelled = false;

    const startRedirect = () => {
      if (cancelled) return;
      markTillflowPerformance('tillflow.launch.redirect.started');
      router.replace('/onboarding');
    };

    firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        markTillflowPerformance('tillflow.launch.redirect.scheduled');
        if (LAUNCH_REDIRECT_DELAY_MS > 0) {
          timeoutId = window.setTimeout(startRedirect, LAUNCH_REDIRECT_DELAY_MS);
        } else {
          startRedirect();
        }
      });
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [router]);

  return (
    <>
      <p
        id="tillflow-launch-message"
        className="mt-6 text-sm font-semibold text-slate-700"
        suppressHydrationWarning
      >
        {message}
      </p>
      <p
        id="tillflow-launch-detail"
        className="mt-1 text-xs text-slate-500"
        suppressHydrationWarning
      >
        {detail}
      </p>
    </>
  );
}
