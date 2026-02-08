'use client';

import { useEffect } from 'react';

export default function Error({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Application error:', error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-black/10 bg-white p-8 text-center shadow-lg">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-rose-100">
          <svg
            className="h-8 w-8 text-rose-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>
        <h2 className="mt-4 text-xl font-display font-semibold text-black">
          Something went wrong
        </h2>
        <p className="mt-2 text-sm text-black/60">
          {error.message || 'An unexpected error occurred. Please try again.'}
        </p>
        {error.digest && (
          <p className="mt-2 text-xs text-black/40">Error ID: {error.digest}</p>
        )}
        <div className="mt-6 flex flex-col gap-3">
          <button onClick={reset} className="btn-primary w-full">
            Try again
          </button>
          <a href="/pos" className="btn-ghost w-full">
            Go to POS
          </a>
          <a href="/reports/dashboard" className="btn-ghost w-full">
            Go to Dashboard
          </a>
        </div>
      </div>
    </div>
  );
}
