export default function EffectiveStoreBanner({
  storeName,
  actionLabel,
}: {
  storeName: string;
  actionLabel?: string;
}) {
  return (
    <div
      className="rounded-xl border border-accent/20 bg-accent/5 px-3 py-2 text-sm text-ink"
      data-effective-store={storeName}
    >
      <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">
        Recording in
      </span>
      <div className="font-semibold">{storeName}</div>
      {actionLabel ? <div className="mt-0.5 text-xs text-black/60">{actionLabel}</div> : null}
    </div>
  );
}
