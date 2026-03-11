export default function OwnerIntelligenceLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="card space-y-4 rounded-[1.75rem] p-6">
        <div className="h-3 w-32 rounded-full bg-border" />
        <div className="h-8 w-72 rounded-xl bg-border" />
        <div className="h-4 w-[32rem] max-w-full rounded-full bg-border" />
      </div>

      <div className="card flex flex-wrap gap-2 rounded-[1.35rem] p-4">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="h-8 w-32 rounded-full bg-border" />
        ))}
      </div>

      <div className="rounded-[1.8rem] border border-border bg-white/70 p-5 shadow-card">
        <div className="mb-5 space-y-3">
          <div className="h-3 w-40 rounded-full bg-border" />
          <div className="h-7 w-72 rounded-xl bg-border" />
          <div className="h-4 w-[40rem] max-w-full rounded-full bg-border" />
        </div>
        <div className="grid gap-4 xl:grid-cols-[1.25fr_3fr]">
          <div className="rounded-[1.5rem] bg-slate-900/90 p-6">
            <div className="h-3 w-28 rounded-full bg-white/20" />
            <div className="mt-6 h-14 w-28 rounded-xl bg-white/20" />
            <div className="mt-6 space-y-3">
              <div className="h-4 w-full rounded-full bg-white/15" />
              <div className="h-4 w-5/6 rounded-full bg-white/15" />
              <div className="h-4 w-4/5 rounded-full bg-white/15" />
            </div>
            <div className="mt-6 h-10 w-full rounded-xl bg-white/15" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {[1, 2, 3, 4, 5, 6, 7].map((i) => (
              <div key={i} className="rounded-[1.35rem] border border-border bg-white/95 p-5 shadow-card">
                <div className="h-3 w-24 rounded-full bg-border" />
                <div className="mt-4 h-10 w-32 rounded-xl bg-border" />
                <div className="mt-5 h-4 w-full rounded-full bg-border" />
                <div className="mt-2 h-4 w-3/4 rounded-full bg-border" />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-[1.8rem] border border-border bg-white/70 p-5 shadow-card">
        <div className="mb-5 space-y-3">
          <div className="h-3 w-44 rounded-full bg-border" />
          <div className="h-7 w-80 rounded-xl bg-border" />
          <div className="h-4 w-[36rem] max-w-full rounded-full bg-border" />
        </div>
        <div className="grid gap-6 xl:grid-cols-[1.9fr_1fr]">
          <div className="rounded-[1.5rem] border border-border bg-white/95 p-6">
            <div className="h-5 w-48 rounded-full bg-border" />
            <div className="mt-2 h-4 w-72 rounded-full bg-border" />
            <div className="mt-5 space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="rounded-[1.2rem] border border-border p-4">
                  <div className="h-4 w-2/3 rounded-full bg-border" />
                  <div className="mt-3 h-4 w-full rounded-full bg-border" />
                  <div className="mt-2 h-4 w-5/6 rounded-full bg-border" />
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-[1.5rem] bg-slate-900/90 p-6">
            <div className="h-5 w-32 rounded-full bg-white/20" />
            <div className="mt-5 space-y-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-center justify-between gap-3 border-b border-white/10 pb-3">
                  <div className="h-4 w-32 rounded-full bg-white/15" />
                  <div className="h-4 w-24 rounded-full bg-white/20" />
                </div>
              ))}
            </div>
            <div className="mt-5 h-24 rounded-[1rem] bg-white/10" />
          </div>
        </div>
      </div>

      <div className="rounded-[1.8rem] border border-border bg-white/70 p-5 shadow-card">
        <div className="mb-5 space-y-3">
          <div className="h-3 w-36 rounded-full bg-border" />
          <div className="h-7 w-80 rounded-xl bg-border" />
          <div className="h-4 w-[38rem] max-w-full rounded-full bg-border" />
        </div>
        <div className="grid gap-6 xl:grid-cols-2 2xl:grid-cols-[1.25fr_1.1fr_1.65fr]">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-[1.5rem] border border-border bg-white/95 p-6 shadow-card">
              <div className="h-5 w-40 rounded-full bg-border" />
              <div className="mt-2 h-4 w-64 rounded-full bg-border" />
              <div className="mt-5 space-y-3">
                {[1, 2, 3, 4].map((j) => (
                  <div key={j} className="rounded-[1.1rem] border border-border p-4">
                    <div className="h-4 w-2/3 rounded-full bg-border" />
                    <div className="mt-3 h-4 w-full rounded-full bg-border" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="rounded-[1.35rem] border border-border bg-white/95 p-4 shadow-card">
              <div className="h-4 w-28 rounded-full bg-border" />
              <div className="mt-3 h-4 w-full rounded-full bg-border" />
              <div className="mt-2 h-4 w-4/5 rounded-full bg-border" />
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-[1.35rem] border border-border bg-white/90 p-4 shadow-card">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="space-y-2">
            <div className="h-4 w-32 rounded-full bg-border" />
            <div className="h-4 w-80 max-w-full rounded-full bg-border" />
          </div>
          <div className="flex gap-2">
            <div className="h-10 w-32 rounded-xl bg-border" />
            <div className="h-10 w-28 rounded-xl bg-border" />
          </div>
        </div>
      </div>
    </div>
  );
}
