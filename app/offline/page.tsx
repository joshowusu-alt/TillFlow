'use client';

export default function OfflinePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-6">
      <div className="text-center">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-amber-100">
          <svg
            className="h-10 w-10 text-amber-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a5 5 0 01-1.414-7.072m0 0L9.879 5.636m-2.829 2.829L3 5"
            />
          </svg>
        </div>
        <h1 className="mt-6 text-2xl font-bold text-slate-800">You're Offline</h1>
        <p className="mt-2 text-slate-600">
          No internet connection detected. Some features may be unavailable.
        </p>
        <div className="mt-8 rounded-xl border border-slate-200 bg-white p-4 text-left">
          <h2 className="font-semibold text-slate-800">What you can do:</h2>
          <ul className="mt-2 space-y-2 text-sm text-slate-600">
            <li className="flex items-center gap-2">
              <svg className="h-4 w-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              View cached product data
            </li>
            <li className="flex items-center gap-2">
              <svg className="h-4 w-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Your cart is saved locally
            </li>
            <li className="flex items-center gap-2">
              <svg className="h-4 w-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              Sales require internet to complete
            </li>
          </ul>
        </div>
        <button
          onClick={() => window.location.reload()}
          className="mt-6 rounded-xl bg-accent px-6 py-3 font-semibold text-white hover:bg-blue-900"
        >
          Try Again
        </button>
      </div>
    </div>
  );
}
