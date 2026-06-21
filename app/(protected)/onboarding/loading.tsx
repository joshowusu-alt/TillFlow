export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 w-56 rounded-xl bg-black/5" />
      <div className="card p-6 space-y-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-16 rounded-2xl bg-black/5" />
        ))}
      </div>
    </div>
  );
}
