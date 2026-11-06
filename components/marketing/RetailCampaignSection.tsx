import Image from 'next/image';
import Link from 'next/link';

const moments = [
  { image: 'retail-partner', alt: 'TillFlow promotional artwork showing a trader using a phone at a fabric stall', title: 'Your shop. A clearer picture.', body: 'Find products, record cash and MoMo payments, and keep a record you can return to.', href: '/demo/try-sale', action: 'Try a sale' },
  { image: 'every-sale', alt: 'TillFlow promotional artwork showing a retailer using a digital checkout', title: 'Every sale has a place.', body: 'Follow a sale from product selection to payment and receipt, using fictional products.', href: '/demo/inventory', action: 'Explore stock' },
  { image: 'understand-profit', alt: 'TillFlow promotional artwork showing a shopkeeper reviewing records with a calculator', title: 'Busy should be measurable.', body: 'See sales less product costs, then expenses. Understand why money received and profit are different.', href: '/demo/reports', action: 'Understand profit' },
];
export default function RetailCampaignSection() {
  return <section id="retail" className="px-4 py-10 sm:px-6 sm:py-16">
    <div className="mx-auto max-w-6xl">
      <p className="text-xs font-bold uppercase tracking-widest text-accent">Made for Ghanaian retail</p>
      <h2 className="mt-3 max-w-2xl text-3xl font-bold text-ink sm:text-4xl">Less piecing records together.<br />More understanding your business.</h2>
      <div className="mt-8 grid gap-6 md:grid-cols-3">{moments.map(m => <article key={m.image} className="overflow-hidden rounded-3xl border border-slate-200 bg-white">
        <Image src={`/marketing/${m.image}.webp`} alt={m.alt} width={640} height={800} sizes="(max-width: 767px) 100vw, 33vw" className="h-auto w-full" />
        <div className="p-5"><h3 className="text-xl font-bold text-ink">{m.title}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{m.body}</p><Link href={m.href} className="mt-3 inline-flex min-h-11 items-center font-semibold text-accent underline underline-offset-4">{m.action} →</Link></div>
      </article>)}</div>
      <div className="mt-10 grid items-center gap-6 rounded-3xl bg-slate-950 p-5 text-white sm:p-8 md:grid-cols-[1fr_280px]">
        <div><p className="text-xs font-semibold uppercase tracking-widest text-teal-300">28-second introduction</p><h3 className="mt-3 text-2xl font-bold">Where did the money go?</h3><p className="mt-3 max-w-lg leading-7 text-slate-200">Manual records make it hard to follow the day. Explore how TillFlow connects sales, stock and money in one place.</p><p className="mt-3 text-sm text-slate-300">Silent promotional introduction with English captions. Playback starts only when you choose.</p><Link href="/demo" className="mt-4 inline-flex min-h-11 items-center font-bold text-teal-300 underline">Explore the working demo →</Link></div>
        <video controls playsInline preload="none" poster="/marketing/challenges-poster.webp" aria-label="TillFlow promotional introduction: retail recordkeeping challenges" className="mx-auto aspect-[9/16] w-full max-w-[280px] rounded-2xl">
          <source src="/marketing/retail-challenges.mp4" type="video/mp4" />
          <track kind="captions" src="/marketing/retail-challenges.en.vtt" srcLang="en" label="English" default />Your browser does not support video. <a href="/marketing/retail-challenges.mp4">Download the introduction</a>.
        </video>
      </div>
      <details className="mt-4 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700"><summary className="min-h-11 cursor-pointer font-semibold">Read the video description</summary><p className="mt-2 leading-6">An exercise book illustrates sales, cash and stock that are hard to follow. TillFlow screens show a sample checkout, a recorded sale, stock alerts and business reports. The closing screen offers a seven-day trial and WhatsApp contact at +233 54 701 6160. These are promotional product illustrations, not customer results.</p></details>
      <p className="mt-3 text-xs text-slate-500">Promotional illustrations supplied by TillFlow. People pictured are not presented as customer testimonials.</p>
    </div>
  </section>;
}
