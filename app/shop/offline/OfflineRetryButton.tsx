'use client';

export default function OfflineRetryButton() {
  return (
    <button
      type="button"
      onClick={() => window.location.reload()}
      className="mt-6 inline-flex h-11 items-center rounded-2xl bg-accent px-6 text-sm font-semibold text-white shadow-sm transition hover:opacity-90"
    >
      Try again
    </button>
  );
}
