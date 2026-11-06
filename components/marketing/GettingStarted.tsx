export default function GettingStarted() {
  return <section id="getting-started" aria-label="Common questions" className="px-4 py-10 sm:px-6">
    <div className="mx-auto max-w-6xl">
      <h2 className="text-2xl font-bold text-ink sm:text-3xl">Before you start</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">Choose a plan, add your products and opening stock, then check your first sale with TillFlow’s help.</p>
      <div className="mt-4 grid gap-3 md:grid-cols-2">{[
        ['Can I sell when the internet drops?', 'TillFlow supports offline POS selling. Set up and prepare the selling device online first, then keep that device available until its sales have synced. Ask us to walk you through the offline workflow.'],
        ['Does money received mean profit?', 'No. Cash and MoMo collections can include earlier credit sales. Profit compares sales with the cost of goods sold and recorded expenses. Complete product costs matter.'],
        ['Do I need barcodes on every product?', 'You can search products by name. TillFlow also supports barcode scanning and generating internal barcodes with printable labels.'],
        ['Which plan includes an online shop?', 'Pro includes the storefront. Growth offers it as a separate GH₵200 monthly add-on. Starter does not include it.'],
      ].map(([q,a])=><details key={q} className="rounded-2xl border border-slate-200 bg-white p-4"><summary className="min-h-11 cursor-pointer font-semibold text-ink">{q}</summary><p className="mt-2 text-sm leading-6 text-slate-600">{a}</p></details>)}</div>

    </div>
  </section>;
}
