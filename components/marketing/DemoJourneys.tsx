import Link from 'next/link';
import BookDemoActions from './BookDemoActions';
const journeys = [
  { href: '/demo/try-sale', title: 'Complete a sale', text: 'Search or scan a product, choose payment, check change and view a practice receipt. This practice sale stays in your browser and does not change the sample reports.' },
  { href: '/demo/dashboard', title: 'Understand the day’s money', text: 'Compare cash, MoMo and credit sales. Then open Reports to follow cash collections and payments through to closing cash.' },
  { href: '/demo/inventory', title: 'Control stock', text: 'Find low-stock products. Compare opening stock, purchases and sales before deciding what to reorder.' },
  { href: '/demo/reports', title: 'Understand profit', text: 'Sales less the cost of products sold gives gross profit. Subtract recorded expenses to see net profit. Buying stock is different from selling it.' },
];
export default function DemoJourneys() {
  return <section aria-label="Guided demo journeys" className="rounded-3xl border border-blue-100 bg-white p-5 sm:p-7">
    <p className="text-xs font-bold uppercase tracking-widest text-accent">Four things to try</p>
    <h2 className="mt-2 text-2xl font-bold text-ink">Follow a shop’s working day.</h2>
    <p className="mt-2 text-sm text-slate-600">Fictional demonstration only. These journeys never write to a customer account.</p>
    <ol className="mt-5 grid gap-3 sm:grid-cols-2">{journeys.map((j,i) => <li key={j.href} className="rounded-2xl bg-slate-50 p-4">
      <Link href={j.href} className="inline-flex min-h-11 items-center text-base font-bold text-accent underline underline-offset-4">{i+1}. {j.title} →</Link><p className="mt-1 text-sm leading-6 text-slate-600">{j.text}</p>
    </li>)}</ol>
    <div className="mt-5 flex flex-wrap items-center gap-3"><Link href="/register" className="btn-primary">Start your own shop</Link><BookDemoActions layout="compact" /></div>
  </section>;
}
