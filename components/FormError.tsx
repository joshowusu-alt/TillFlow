/**
 * Reusable error banner that reads the `?error=` query param.
 * Drop this into any page with a server-action form.
 */

export default function FormError({ error }: { error?: string }) {
  if (!error) return null;
  return (
    <div className="rounded-xl border border-rose/30 bg-rose/10 px-4 py-3 text-sm text-rose">
      {decodeURIComponent(error)}
    </div>
  );
}
