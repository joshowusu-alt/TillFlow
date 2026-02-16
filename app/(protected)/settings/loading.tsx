export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 w-48 rounded-xl bg-black/5" />
      <div className="h-4 w-64 rounded bg-black/5" />
      <div className="card p-6 space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-10 rounded-xl bg-black/5" />
          ))}
        </div>
        <div className="h-10 w-28 rounded-xl bg-black/5" />
      </div>
    </div>
  );
}
