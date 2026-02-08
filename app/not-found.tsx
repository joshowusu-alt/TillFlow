import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-black/10 bg-white p-8 text-center shadow-lg">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-black/5">
          <svg
            className="h-8 w-8 text-black/40"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>
        <h2 className="mt-4 text-xl font-display font-semibold text-black">
          Page not found
        </h2>
        <p className="mt-2 text-sm text-black/60">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <div className="mt-6 flex flex-col gap-3">
          <Link href="/pos" className="btn-primary w-full inline-flex items-center justify-center">
            Go to POS
          </Link>
          <Link href="/reports/dashboard" className="btn-ghost w-full inline-flex items-center justify-center">
            Go to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
