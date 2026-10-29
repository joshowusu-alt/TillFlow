'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';
import UnavailableScreen from '@/components/UnavailableScreen';
import { isDatabaseUnavailable } from '@/lib/database-unavailable';

export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { Sentry.captureException(error); }, [error]);
  // Next.js redacts server exceptions; the protected layout classifies failures before serialization.
  return <UnavailableScreen database={isDatabaseUnavailable(error)} retry={reset} />;
}
