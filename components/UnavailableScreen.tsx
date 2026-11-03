'use client';

export default function UnavailableScreen({ database = false, retry }: { database?: boolean; retry?: () => void }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-5 py-10">
      <section className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 text-center shadow-sm sm:p-8" aria-labelledby="unavailable-title">
        <div className="text-xl font-bold tracking-tight text-blue-700">TillFlow</div>
        <div className="mx-auto mt-7 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-700" aria-hidden="true">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 2m6-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        </div>
        <h1 id="unavailable-title" className="mt-5 text-2xl font-semibold leading-tight text-slate-900">{database ? 'TillFlow is temporarily unavailable.' : 'Something went wrong.'}</h1>
        <p className="mt-4 text-sm leading-6 text-slate-600">{database ? "Your data is safe. We're working on it. Please try again in a few minutes." : 'Please try again in a few minutes. If the problem continues, contact us for help with your business.'}</p>
        <button type="button" onClick={() => retry ? retry() : window.location.reload()} className="mt-7 min-h-12 w-full rounded-xl bg-blue-700 px-4 py-3 font-semibold text-white hover:bg-blue-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700">Try again</button>
        <a href="https://wa.me/233547016160" className="mt-3 inline-flex min-h-12 w-full items-center justify-center rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700">WhatsApp support</a>
      </section>
    </main>
  );
}
