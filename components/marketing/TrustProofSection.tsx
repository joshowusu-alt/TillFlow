/** Confirmed operational facts only. No attributed quotes or unverified outcomes. */
export default function TrustProofSection() {
  return (
    <section id="stories" className="scroll-mt-32 px-4 py-8 sm:px-6">
      <div className="mx-auto grid max-w-6xl gap-6 rounded-3xl border border-blue-100 bg-white p-6 sm:p-8 md:grid-cols-2">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-accent">In everyday use</p>
          <h2 className="mt-3 text-3xl font-bold text-ink">Built around a real shop’s working day.</h2>
        </div>
        <div className="space-y-3 text-base leading-7 text-slate-600">
          <p><strong className="text-ink">EL-SHADDAI Supermarket</strong> uses TillFlow for sales, barcode scanning, receipt printing, offline POS, stock and financial management.</p>
          <p className="text-sm">EL-SHADDAI receives complimentary Pro access.</p>
        </div>
      </div>
    </section>
  );
}
