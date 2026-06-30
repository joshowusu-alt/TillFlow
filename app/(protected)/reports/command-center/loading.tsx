export default function CommandCenterLoading() {
  return (
    <div className="space-y-4 animate-pulse" role="status" aria-live="polite" aria-label="Loading page">
      <div className="space-y-2">
        <div className="h-7 w-56 max-w-full rounded-xl bg-black/5" />
        <div className="h-3.5 w-64 max-w-full rounded bg-black/5" />
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-2xl border border-black/5 bg-white px-3 py-2.5">
            <div className="h-2.5 w-14 rounded bg-black/5" />
            <div className="mt-2 h-5 w-16 rounded-lg bg-black/5" />
          </div>
        ))}
      </div>

      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="rounded-2xl border border-black/5 bg-white px-3 py-3 sm:px-4"
          >
            <div className="h-3.5 w-2/5 max-w-[10rem] rounded bg-black/5" />
            <div className="mt-2 h-3 w-full max-w-[18rem] rounded bg-black/5" />
          </div>
        ))}
      </div>
    </div>
  );
}
