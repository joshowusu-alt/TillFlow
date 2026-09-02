/**
 * Light checklist-shaped fallback for incomplete onboarding / “Ready to sell”.
 * Matches ReadinessJourney layout (centred title, primary CTA, stage rows) —
 * not the completed-home dark control-centre shell.
 */
export default function ChecklistReadinessSkeleton() {
  return (
    <div
      className="bg-gradient-to-br from-accentSoft via-white to-paper"
      role="status"
      aria-live="polite"
      aria-label="Preparing setup checklist"
    >
      <div className="mx-auto max-w-xl animate-pulse px-4 py-8 pb-4 sm:py-10">
        <div className="mb-6 space-y-2 text-center">
          <div className="mx-auto h-2.5 w-24 rounded bg-accent/15" />
          <div className="mx-auto h-8 w-48 max-w-[80%] rounded-xl bg-black/5" />
          <div className="mx-auto h-4 w-64 max-w-full rounded bg-black/5" />
        </div>

        <div className="h-12 w-full rounded-2xl bg-accent/15" />
        <div className="mx-auto mt-3 h-3 w-56 max-w-full rounded bg-black/5" />

        <div className="mt-8 space-y-2">
          <div className="mb-1 h-2.5 w-16 rounded bg-black/5" />
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-xl border border-black/5 bg-white/80 px-3 py-2.5 shadow-sm"
            >
              <div className="h-6 w-6 flex-shrink-0 rounded-full bg-black/5" />
              <div className="h-3.5 flex-1 rounded bg-black/5" />
              <div className="h-2.5 w-10 rounded bg-black/5" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
