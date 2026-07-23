/**
 * Compact owner-home fallback while readiness data streams in.
 * Matches the control-centre shape (hero metrics + Open POS + attention) to limit layout shift.
 */
export default function OwnerReadinessSkeleton() {
  return (
    <div
      className="bg-[#f0f2f5] px-0 pb-4 lg:px-6 lg:pb-8"
      role="status"
      aria-live="polite"
      aria-label="Preparing owner home"
    >
      <div className="lg:mx-auto lg:max-w-[90rem]">
        <div className="animate-pulse bg-slate-900 px-4 pb-5 pt-6 sm:px-6 lg:mt-4 lg:rounded-[1.25rem] lg:px-8 lg:py-7">
          <div className="h-3 w-28 rounded bg-white/10" />
          <div className="mt-3 h-8 w-56 max-w-[70%] rounded-xl bg-white/15" />
          <div className="mt-3 h-4 w-48 max-w-[80%] rounded bg-white/10" />
          <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <div className="col-span-2 min-h-[4.5rem] rounded-2xl bg-white/10 sm:col-span-1 sm:min-h-[6.5rem]" />
            <div className="min-h-[4rem] rounded-2xl bg-white/10 sm:min-h-[6.5rem]" />
            <div className="min-h-[4rem] rounded-2xl bg-white/10 sm:min-h-[6.5rem]" />
          </div>
        </div>

        <div className="mx-auto max-w-5xl animate-pulse space-y-4 px-4 py-5 sm:px-6 lg:max-w-none lg:px-8">
          <div className="min-h-14 rounded-2xl bg-white shadow-sm" />
          <div className="min-h-[4.5rem] rounded-2xl bg-white shadow-sm" />
          <div className="min-h-[8rem] rounded-2xl bg-white shadow-sm" />
        </div>
      </div>
    </div>
  );
}
