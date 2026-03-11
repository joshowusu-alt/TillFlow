/**
 * Reusable error banner that reads the `?error=` query param.
 * Drop this into any page with a server-action form.
 */

export default function FormError({ error }: { error?: string }) {
  if (!error) return null;
  let message = error;
  try {
    message = decodeURIComponent(error);
  } catch {
    message = error;
  }

  return (
    <div className="mb-4 flex items-start gap-3 rounded-2xl border border-red-200/80 bg-gradient-to-r from-red-50 to-white px-4 py-4 text-sm text-red-700 shadow-[0_8px_24px_rgba(220,38,38,0.08)]" role="alert">
      <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-red-100 text-red-500">
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008z" />
        </svg>
      </div>
      <div>
        <div className="font-semibold text-red-800">Couldn’t complete that action</div>
        <div className="mt-1 leading-relaxed">{message}</div>
      </div>
    </div>
  );
}
