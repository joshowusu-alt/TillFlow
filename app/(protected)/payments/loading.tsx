export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 w-48 rounded-xl bg-black/5" />
      <div className="h-4 w-64 rounded bg-black/5" />
      <div className="card p-6 space-y-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-12 rounded-xl bg-black/5" />
        ))}
      </div>
    </div>
  );
}
