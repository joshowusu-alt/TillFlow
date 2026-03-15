export default function Loading() {
  return (
    <div className="min-h-[70vh] px-4 py-8 sm:px-6">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <div className="mx-auto flex w-full max-w-md items-center gap-4 rounded-[1.75rem] border border-white/70 bg-white/90 px-4 py-4 shadow-soft backdrop-blur animate-pulse">
          <img src="/icon" alt="TillFlow" className="h-14 w-14 rounded-2xl shadow-lg shadow-accent/15" />
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-accent/70">TillFlow POS</div>
            <div className="mt-1 h-4 w-32 rounded-full bg-black/5" />
            <div className="mt-2 h-3 w-48 rounded-full bg-black/5" />
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.9fr)]">
          <div className="space-y-4 animate-pulse">
            <div className="flex items-center justify-between gap-3">
              <div className="h-8 w-32 rounded-xl bg-black/5" />
              <div className="flex gap-2">
                <div className="h-10 w-24 rounded-xl bg-black/5" />
                <div className="h-10 w-24 rounded-xl bg-black/5" />
              </div>
            </div>

            <div className="h-12 rounded-2xl bg-black/5" />

            <div className="flex gap-2 overflow-hidden">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-8 w-20 flex-shrink-0 rounded-full bg-black/5" />
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {[...Array(12)].map((_, i) => (
                <div key={i} className="card space-y-2 p-4">
                  <div className="h-4 w-full rounded bg-black/5" />
                  <div className="h-3 w-16 rounded bg-black/5" />
                  <div className="h-9 w-full rounded-xl bg-black/5" />
                </div>
              ))}
            </div>
          </div>

          <div className="card overflow-hidden border-white/70 bg-white/95 shadow-soft">
            <div className="border-b border-black/5 px-5 py-4">
              <div className="h-3 w-24 rounded-full bg-black/5 animate-pulse" />
              <div className="mt-3 h-8 w-36 rounded-xl bg-black/5 animate-pulse" />
            </div>
            <div className="space-y-4 px-5 py-5 animate-pulse">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="rounded-2xl border border-black/5 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="h-4 w-4/5 rounded bg-black/5" />
                      <div className="h-3 w-1/2 rounded bg-black/5" />
                    </div>
                    <div className="h-8 w-20 rounded-full bg-black/5" />
                  </div>
                </div>
              ))}
            </div>
            <div className="border-t border-black/5 bg-slate-50/90 px-5 py-4">
              <div className="flex items-center justify-between gap-3">
                <div className="space-y-2">
                  <div className="h-3 w-16 rounded bg-black/5 animate-pulse" />
                  <div className="h-6 w-24 rounded bg-black/5 animate-pulse" />
                </div>
                <div className="h-11 w-32 rounded-2xl bg-accent/15 animate-pulse" />
              </div>
            </div>
          </div>
        </div>

        <div className="text-center text-xs font-medium text-black/45">
          Preparing products, prices, and parked sales safely for this device.
        </div>
      </div>
    </div>
  );
}
