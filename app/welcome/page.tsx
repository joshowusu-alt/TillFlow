import Link from 'next/link';

const features = [
  {
    icon: (
      <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5z" />
      </svg>
    ),
    title: 'Lightning-Fast POS',
    desc: 'Scan barcodes, process payments, and print receipts in seconds. Keyboard shortcuts make every sale effortless.',
  },
  {
    icon: (
      <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
      </svg>
    ),
    title: 'Real-Time Inventory',
    desc: 'Track stock across units - pieces, cartons, crates. Get low-stock alerts and never run out of your best sellers.',
  },
  {
    icon: (
      <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
      </svg>
    ),
    title: 'Works Offline',
    desc: 'No internet? No problem. Make sales offline and everything syncs automatically when you reconnect.',
  },
  {
    icon: (
      <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
      </svg>
    ),
    title: 'Full Accounting',
    desc: 'Double-entry bookkeeping built in. Income statements, balance sheets, and cashflow reports - all automatic.',
  },
  {
    icon: (
      <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
      </svg>
    ),
    title: 'Multi-Role Access',
    desc: 'Owner, Manager, and Cashier roles with granular permissions. Everyone sees only what they need.',
  },
  {
    icon: (
      <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3" />
      </svg>
    ),
    title: 'Install as App',
    desc: 'Install on any device - phone, tablet, or desktop. Full-screen, fast, and works just like a native app.',
  },
];

const stats = [
  { value: '21+', label: 'Demo Products' },
  { value: '22+', label: 'Currencies' },
  { value: '<2s', label: 'Per Transaction' },
  { value: '100%', label: 'Offline Ready' },
];

export default function WelcomePage() {
  return (
    <div className="min-h-screen overflow-hidden">
      {/* Navigation */}
      <nav className="fixed top-0 z-50 w-full border-b border-white/10 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2.5">
            <img src="/icon.svg" alt="" className="h-9 w-9 rounded-xl" />
            <span className="text-xl font-bold font-display">
              <span className="text-accent">Till</span>
              <span className="text-gray-800">Flow</span>
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="rounded-xl px-4 py-2 text-sm font-semibold text-black/60 transition hover:text-black"
            >
              Sign In
            </Link>
            <Link
              href="/register"
              className="rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-accent/25 transition hover:bg-accent/80 hover:shadow-accent/40"
            >
              Start Free
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 px-6">
        {/* Background decoration */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-40 -right-40 h-[600px] w-[600px] rounded-full bg-blue-100/50 blur-3xl" />
          <div className="absolute -bottom-40 -left-40 h-[500px] w-[500px] rounded-full bg-accentSoft/40 blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-6xl">
          <div className="mx-auto max-w-3xl text-center">
            {/* Badge */}
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accentSoft px-4 py-1.5 text-sm font-medium text-accent">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-500" />
              </span>
              Trusted by businesses across Africa
            </div>

            <h1 className="text-5xl font-bold font-display tracking-tight text-gray-900 sm:text-6xl lg:text-7xl">
              Run Your Store{' '}
              <span className="bg-gradient-to-r from-accent to-accent/80 bg-clip-text text-transparent">
                Like a Pro
              </span>
            </h1>
            <p className="mt-6 text-lg leading-relaxed text-black/60 sm:text-xl">
              The all-in-one POS system that handles sales, inventory, and accounting
              — even when the internet goes down. Set up in under 5 minutes.
            </p>

            {/* CTAs */}
            <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
              <Link
                href="/register?mode=demo"
                className="group flex items-center gap-2 rounded-2xl bg-gradient-to-r from-accent to-accent/80 px-8 py-4 text-base font-bold text-white shadow-xl shadow-accent/25 transition-all hover:shadow-2xl hover:shadow-accent/30 hover:-translate-y-0.5"
              >
                <svg className="h-5 w-5 transition-transform group-hover:scale-110" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
                </svg>
                Try Live Demo
              </Link>
              <Link
                href="/register"
                className="flex items-center gap-2 rounded-2xl border-2 border-black/10 bg-white px-8 py-4 text-base font-bold text-gray-800 shadow-lg transition-all hover:border-accent/20 hover:shadow-xl hover:-translate-y-0.5"
              >
                Create My Business
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                </svg>
              </Link>
            </div>

            {/* Social Proof */}
            <div className="mt-12 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm text-black/40">
              <span className="flex items-center gap-1.5">
                <svg className="h-4 w-4 text-blue-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" /></svg>
                No credit card required
              </span>
              <span className="flex items-center gap-1.5">
                <svg className="h-4 w-4 text-blue-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" /></svg>
                Setup in 5 minutes
              </span>
              <span className="flex items-center gap-1.5">
                <svg className="h-4 w-4 text-blue-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" /></svg>
                Works offline
              </span>
            </div>
          </div>

          {/* Product Preview */}
          <div className="mt-16 rounded-3xl border border-black/5 bg-white/70 p-3 shadow-2xl shadow-black/10 backdrop-blur-sm sm:p-4">
            <div className="overflow-hidden rounded-2xl border border-black/5 bg-gradient-to-br from-gray-50 to-white">
              {/* Simulated POS Interface */}
              <div className="px-6 py-4 border-b border-black/5 flex items-center justify-between bg-white">
                <div className="flex items-center gap-3">
                  <div className="h-3 w-3 rounded-full bg-blue-400" />
                  <span className="text-sm font-semibold text-black/70">Point of Sale</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="rounded-lg bg-accentSoft px-3 py-1 text-xs font-semibold text-accent">Online</div>
                  <div className="rounded-lg bg-black/5 px-3 py-1 text-xs font-medium text-black/40">Till 1</div>
                </div>
              </div>
              <div className="grid lg:grid-cols-[1fr_300px] gap-4 p-6">
                {/* Cart Area */}
                <div className="space-y-3">
                  <div className="flex items-center gap-3 rounded-xl border border-black/5 bg-white p-3">
                    <div className="rounded-lg bg-black/5 p-2">
                      <svg className="h-4 w-4 text-black/30" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5z" />
                      </svg>
                    </div>
                    <span className="text-sm text-black/30 font-mono">Scan barcode or search...</span>
                  </div>
                  {/* Demo cart items */}
                  {[
                    { name: 'Coca-Cola 500ml', qty: 3, price: '3.60', unit: 'bottles' },
                    { name: 'Milo 400g', qty: 1, price: '5.50', unit: 'tin' },
                    { name: 'Indomie Noodles', qty: 6, price: '4.00', unit: 'packs', promo: 'Buy 5 Get 1 Free!' },
                  ].map((item, i) => (
                    <div key={i} className="flex items-center gap-3 rounded-xl border border-black/5 bg-white p-3.5">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accentSoft text-xs font-bold text-accent">{i + 1}</div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold truncate">{item.name}</div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-black/40">{item.qty} {item.unit}</span>
                          {item.promo && <span className="text-[10px] font-medium text-accent bg-accentSoft px-1.5 py-0.5 rounded-full">{item.promo}</span>}
                        </div>
                      </div>
                      <div className="text-sm font-bold">{item.price}</div>
                    </div>
                  ))}
                </div>
                {/* Summary Sidebar */}
                <div className="space-y-3">
                  <div className="rounded-2xl border border-black/5 bg-white p-5 space-y-3">
                    <div className="text-xs font-semibold uppercase tracking-widest text-black/30">Summary</div>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between"><span className="text-black/50">Items</span><span className="font-semibold">3</span></div>
                      <div className="flex justify-between"><span className="text-black/50">Subtotal</span><span className="font-semibold">14.30</span></div>
                      <div className="flex justify-between text-accent"><span>Promo discount</span><span className="font-semibold">-0.80</span></div>
                    </div>
                    <div className="border-t border-black/5 pt-3 flex justify-between items-center">
                      <span className="text-lg font-semibold">Total</span>
                      <span className="text-2xl font-bold">13.50</span>
                    </div>
                  </div>
                  <div className="rounded-2xl bg-gradient-to-br from-accent to-accent/80 p-5 text-center text-white shadow-lg">
                    <div className="text-[10px] font-medium uppercase tracking-[0.3em] opacity-80">Change Due</div>
                    <div className="mt-1 text-3xl font-bold">6.50</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="relative py-16 px-6">
        <div className="mx-auto max-w-4xl">
          <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
            {stats.map((s) => (
              <div key={s.label} className="text-center">
                <div className="text-3xl font-bold font-display text-accent">{s.value}</div>
                <div className="mt-1 text-sm text-black/50">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="relative py-20 px-6">
        <div className="mx-auto max-w-6xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold font-display sm:text-4xl">
              Everything Your Store Needs
            </h2>
            <p className="mt-4 text-lg text-black/50">
              From your first sale to your annual balance sheet - one system handles it all.
            </p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <div
                key={f.title}
                className="group rounded-2xl border border-black/5 bg-white/80 p-6 shadow-sm transition-all hover:shadow-lg hover:-translate-y-1 hover:border-accent/20"
              >
                <div className="mb-4 inline-flex rounded-xl bg-accentSoft p-3 text-accent transition-colors group-hover:bg-accent/20">
                  {f.icon}
                </div>
                <h3 className="text-lg font-semibold font-display">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-black/50">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="relative py-20 px-6 bg-gradient-to-b from-transparent to-accentSoft/50">
        <div className="mx-auto max-w-4xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold font-display sm:text-4xl">Up and Running in 3 Steps</h2>
            <p className="mt-4 text-lg text-black/50">No hardware, no installation CD, no technician needed.</p>
          </div>
          <div className="grid gap-8 md:grid-cols-3">
            {[
              { step: '01', title: 'Create Account', desc: 'Enter your business name, currency, and go. Takes 30 seconds.', color: 'from-accent to-accent/80' },
              { step: '02', title: 'Add Products', desc: 'Type or scan your products. Set prices, units, and categories.', color: 'from-accent/80 to-accent' },
              { step: '03', title: 'Start Selling', desc: 'Open the POS, scan items, collect payment. That simple.', color: 'from-accent to-accent/80' },
            ].map((s) => (
              <div key={s.step} className="text-center">
                <div className={`mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${s.color} text-xl font-bold text-white shadow-lg`}>
                  {s.step}
                </div>
                <h3 className="text-lg font-semibold font-display">{s.title}</h3>
                <p className="mt-2 text-sm text-black/50">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="relative py-24 px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold font-display sm:text-4xl">
            Ready to Transform Your Business?
          </h2>
          <p className="mt-4 text-lg text-black/50">
            Join businesses across Africa using TillFlow to simplify their operations.
            Start with a free demo or create your business today.
          </p>
          <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Link
              href="/register?mode=demo"
              className="rounded-2xl bg-gradient-to-r from-accent to-accent/80 px-8 py-4 text-base font-bold text-white shadow-xl shadow-accent/25 transition-all hover:shadow-2xl hover:-translate-y-0.5"
            >
              Try Live Demo
            </Link>
            <Link
              href="/register"
              className="rounded-2xl border-2 border-black/10 bg-white px-8 py-4 text-base font-bold transition-all hover:border-accent/20 hover:shadow-xl hover:-translate-y-0.5"
            >
              Create My Business
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-black/5 px-6 py-8">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div className="flex items-center gap-2">
            <img src="/icon.svg" alt="" className="h-6 w-6 rounded-lg" />
            <span className="text-sm font-semibold font-display">
              <span className="text-accent">Till</span>
              <span className="text-gray-800">Flow</span>
            </span>
          </div>
          <p className="text-xs text-black/30">Sales made simple.</p>
        </div>
      </footer>
    </div>
  );
}
