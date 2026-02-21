export default function BalanceSheetLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 w-48 rounded bg-black/10" />
      <div className="grid gap-4 md:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 rounded-xl bg-black/5" />
        ))}
      </div>
      <div className="h-14 w-72 rounded-xl bg-black/5" />
      <div className="grid gap-6 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-48 rounded-xl bg-black/5" />
        ))}
      </div>
    </div>
  );
}
