'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { markTillflowPerformance } from '@/lib/performance/client-performance-marks';
import { LAUNCH_REDIRECT_DELAY_MS } from '@/lib/performance/launch-handoff-timing';

const LAST_BUSINESS_NAME_KEY = 'tillflow:lastBusinessName';
const FALLBACK_MESSAGE = 'Opening your business workspace...';
const FALLBACK_DETAIL = 'Getting sales, stock, and cash ready.';

function getLaunchMessage(name: string | null) {
  const cleanName = name?.trim();
  return cleanName ? `Opening ${cleanName}...` : FALLBACK_MESSAGE;
}

export default function LaunchRedirector() {
  const router = useRouter();
  const [message, setMessage] = useState(FALLBACK_MESSAGE);
  const [detail, setDetail] = useState(FALLBACK_DETAIL);

  useEffect(() => {
    markTillflowPerformance('tillflow.launch.mounted');

    try {
      window.sessionStorage.setItem('tillflow:launching', '1');
      window.sessionStorage.removeItem('tillflow:launchSplashSeen');

      const businessName = window.localStorage.getItem(LAST_BUSINESS_NAME_KEY);
      const cleanName = businessName?.trim();
      setMessage(getLaunchMessage(cleanName ?? null));
      setDetail(
        cleanName
          ? "Getting today's sales, stock, and cash ready."
          : FALLBACK_DETAIL
      );
    } catch {
      setMessage(FALLBACK_MESSAGE);
      setDetail(FALLBACK_DETAIL);
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
      >
        {message}
      </p>
      <p
        id="tillflow-launch-detail"
        className="mt-1 text-xs text-slate-500"
      >
        {detail}
      </p>
    </>
  );
}
