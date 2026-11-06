import Link from 'next/link';

const previews = [
  { title: 'Record every sale', body: 'Find a product, take cash or MoMo, and issue a receipt.', href: '/demo/try-sale', action: 'Try a sale' },
  { title: 'Control your stock', body: 'See stock levels, low-stock alerts and supplier balances.', href: '/demo/inventory', action: 'Explore stock' },
  { title: 'Understand your money', body: 'Follow expected cash, sales, product costs and profit.', href: '/demo/reports', action: 'See reports' },
] as const;

/** One concise route into the working demo; detailed walkthroughs live there. */
export default function HomepageDemo() {
  return (
    <section id="product-proof" className="scroll-mt-32 px-4 py-6 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-6xl">
        <h2 className="text-3xl font-bold font-display text-ink sm:text-4xl">See TillFlow in action.</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">Try the working demo with fictional data. No account needed.</p>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {previews.map(preview => (
            <article key={preview.href} className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
              <h3 className="text-lg font-bold text-ink">{preview.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">{preview.body}</p>
              <Link href={preview.href} className="mt-2 inline-flex min-h-11 items-center font-semibold text-accent underline underline-offset-4">{preview.action} →</Link>
            </article>
          ))}
        </div>
        <details className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
          <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-ink">Watch the 28-second introduction</summary>
          <div className="mt-4 grid items-start gap-5 sm:grid-cols-[1fr_200px]">
            <div>
              <p className="text-sm leading-6 text-slate-600">A silent promotional introduction with English captions. Playback starts only when you choose.</p>
              <h3 className="mt-4 font-semibold text-ink">Video description</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">An exercise book illustrates records that are hard to follow. TillFlow screens show checkout, a recorded sale, stock alerts and reports. The closing screen offers a seven-day trial and WhatsApp contact at +233 54 701 6160. These are promotional illustrations, not customer results.</p>
            </div>
            <video controls playsInline preload="none" poster="/marketing/challenges-poster.webp" aria-label="TillFlow promotional introduction" className="mx-auto aspect-[9/16] w-full max-w-[200px] rounded-xl">
              <source src="/marketing/retail-challenges.mp4" type="video/mp4" />
              <track kind="captions" src="/marketing/retail-challenges.en.vtt" srcLang="en" label="English" default />
              Your browser does not support video. <a href="/marketing/retail-challenges.mp4">Download the introduction</a>.
            </video>
          </div>
        </details>
      </div>
    </section>
  );
}
