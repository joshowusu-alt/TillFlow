export default function StorefrontLoading() {
  return (
    <div className="min-h-screen animate-pulse bg-white">
      <div className="h-36 bg-slate-200" />
      <div className="sticky top-0 z-20 flex gap-2 border-b bg-white px-4 py-3">
        <div className="h-9 flex-1 rounded-lg bg-slate-100" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-7 w-20 rounded-full bg-slate-100" />
        ))}
      </div>
      <div className="mx-auto max-w-screen-lg px-4 pt-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-52 rounded-xl bg-slate-100" />
          ))}
        </div>
      </div>
    </div>
  );
}
