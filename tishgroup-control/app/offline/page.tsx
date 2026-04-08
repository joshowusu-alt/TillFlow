export const dynamic = 'force-static';

export default function OfflinePage() {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-5xl items-center justify-center px-4 py-10 sm:px-6 lg:px-8">
      <div className="panel w-full max-w-2xl p-8 sm:p-10">
        <div className="eyebrow">Offline mode</div>
        <h1 className="page-title mt-4 font-[var(--font-display)] text-control-ink">Tish Group Control is installed, but this section needs a live connection.</h1>
        <p className="mt-5 max-w-xl text-base leading-8 text-black/64">
          You can still open the app from your home screen, but portfolio and billing data are fetched live. Reconnect to continue working.
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-black/8 bg-white/85 p-4">
            <div className="eyebrow">What still works</div>
            <p className="mt-2 text-sm leading-6 text-black/64">The installed app shell opens fast and remains available from the home screen.</p>
          </div>
          <div className="rounded-2xl border border-black/8 bg-white/85 p-4">
            <div className="eyebrow">What needs network</div>
            <p className="mt-2 text-sm leading-6 text-black/64">Business health, collections queues, and revenue views still require the live database.</p>
          </div>
        </div>
      </div>
    </div>
  );
}