'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  HOME_RESUME_STALE_MS,
  useRouterRefreshOnVisibility,
} from '@/hooks/useRouterRefreshOnVisibility';
import { markTillflowPerformance } from '@/lib/performance/client-performance-marks';

/**
 * Client refresh + launch mark for completed Owner Home streaming shell.
 * Does not refresh on mount; resumes use HOME_RESUME_STALE_MS with pageshow/visibility dedupe.
 */
export default function OwnerHomeRefresh() {
  const router = useRouter();

  useEffect(() => {
    markTillflowPerformance('tillflow.launch.protected-content.mounted');
  }, []);

  useRouterRefreshOnVisibility(router, {
    enabled: true,
    staleThresholdMs: HOME_RESUME_STALE_MS,
    refreshOnMount: false,
  });

  return null;
}
