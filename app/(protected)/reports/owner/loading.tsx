export default function OwnerIntelligenceLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 w-64 rounded-lg bg-border" />
      <div className="h-4 w-48 rounded bg-border" />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="card p-6 flex flex-col items-center gap-3">
          <div className="h-24 w-24 rounded-full bg-border" />
          <div className="h-4 w-20 rounded bg-border" />
          <div className="h-3 w-32 rounded bg-border" />
          <div className="h-3 w-full rounded bg-border" />
          <div className="h-3 w-4/5 rounded bg-border" />
        </div>
        <div className="card p-6 lg:col-span-2 space-y-3">
          <div className="h-5 w-40 rounded bg-border" />
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-lg border border-border p-3 space-y-2">
              <div className="h-4 w-3/4 rounded bg-border" />
              <div className="h-3 w-full rounded bg-border" />
              <div className="h-3 w-2/3 rounded bg-border" />
            </div>
          ))}
        </div>
      </div>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="card p-6 space-y-3">
            <div className="h-5 w-32 rounded bg-border" />
            <div className="h-4 w-full rounded bg-border" />
            <div className="h-4 w-full rounded bg-border" />
            <div className="h-4 w-3/4 rounded bg-border" />
          </div>
        ))}
      </div>
    </div>
  );
}
