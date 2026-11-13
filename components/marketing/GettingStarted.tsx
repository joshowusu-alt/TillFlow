import Link from 'next/link';
export default function GettingStarted() {
  return <section id="getting-started" className="px-4 py-10 sm:px-6">
    <div className="mx-auto max-w-6xl">
      <p className="text-xs font-bold uppercase tracking-widest text-accent">Start with one working till</p>
      <h2 className="mt-3 text-3xl font-bold text-ink sm:text-4xl">A clear first day. Room to grow.</h2>
      <ol className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[
        ['Explore first', 'Try a fictional sale and follow the money in the public demo.'],
        ['Choose your setup', 'Compare plans and confirm the staff, devices and workflows you need.'],
        ['Set up your shop', 'Create your account, add your products, selling prices, costs and opening stock.'],
        ['Check your first sale', 'Follow the receipt, stock movement and owner view with help from TillFlow.'],
      ].map(([title,body],i)=><li key={title} className="rounded-2xl border border-slate-200 bg-white p-5"><span className="text-sm font-bold text-accent">0{i+1}</span><h3 className="mt-3 font-bold text-ink">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{body}</p></li>)}</ol>
      <div className="mt-8 grid gap-3 md:grid-cols-2">{[
        ['Can I sell when the internet drops?', 'TillFlow supports offline POS selling. Set up and prepare the selling device online first, then keep that device available until its sales have synced. Ask us to walk you through the offline workflow.'],
        ['Does money received mean profit?', 'No. Cash and MoMo collections can include earlier credit sales. Profit compares sales with the cost of goods sold and recorded expenses. Complete product costs matter.'],
        ['Do I need barcodes on every product?', 'You can search products by name. TillFlow also supports barcode scanning and generating internal barcodes with printable labels.'],
        ['Which plan includes an online shop?', 'Pro includes the storefront. Growth offers it as a separate GH₵200 monthly add-on. Starter does not include it.'],
      ].map(([q,a])=><details key={q} className="rounded-2xl border border-slate-200 bg-white p-4"><summary className="min-h-11 cursor-pointer font-semibold text-ink">{q}</summary><p className="mt-2 text-sm leading-6 text-slate-600">{a}</p></details>)}</div>
      <Link href="/demo/try-sale" className="mt-5 inline-flex min-h-11 items-center font-bold text-accent underline">Try a sale before setting up →</Link>
    </div>
  </section>;
}
