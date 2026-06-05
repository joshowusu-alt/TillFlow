import Link from 'next/link';
import WelcomePricingPreview, { type WelcomePlanPreview } from '@/components/WelcomePricingPreview';
import BookDemoActions from '@/components/marketing/BookDemoActions';
import { Logo } from '@/components/Logo';
import { PLAN_MONTHLY_PRICES, ADDON_ONLINE_STOREFRONT_MONTHLY } from '@/lib/plan-pricing';

const features = [
  {
    icon: (
      <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5z" />
      </svg>
    ),
    title: 'Fast Point of Sale',
    desc: 'Scan barcodes, add items, collect cash or MoMo, and print receipts — without slowing the queue.',
  },
  {
    icon: (
      <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
      </svg>
    ),
    title: 'Real-Time Stock',
    desc: 'Track every product across pieces, packs and cartons. See what sold and what needs restocking.',
  },
  {
    icon: (
      <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
      </svg>
    ),
    title: 'Works Offline',
    desc: 'Keep selling through unstable internet, then sync automatically when the connection returns.',
  },
  {
    icon: (
      <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
      </svg>
    ),
    title: 'Owner Reports',
    desc: 'See revenue, gross profit, expenses and cash position clearly every day — no end-of-day guesswork.',
  },
  {
    icon: (
      <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
      </svg>
    ),
    title: 'Staff Access Control',
    desc: 'Owner, manager, and cashier roles that keep the business running without losing control.',
  },
  {
    icon: (
      <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3" />
      </svg>
    ),
    title: 'Installs as App',
    desc: 'Install on phone, tablet, or desktop for a fast full-screen experience that feels native.',
  },
];

const businessTypes = [
  'Supermarkets',
  'Mini marts',
  'Provision shops',
  'Pharmacies',
  'Beauty supply stores',
  'Wholesale counters',
];

const ownerOutcomes = [
  {
    title: 'Sell through busy hours without slowing the queue',
    desc: 'Fast checkout and clean till flow keep staff moving when the counter gets busy.',
  },
  {
    title: 'Track stock the way the shelf actually works',
    desc: 'Mixed units stay manageable without forcing the team into awkward workarounds.',
  },
  {
    title: 'See the business clearly at closing time',
    desc: 'Sales, margins, expenses, and cash position stay visible without end-of-day guesswork.',
  },
];

const testimonials = [
  {
    title: 'Offline selling stayed calm',
    quote:
      'The network went off. TillFlow did not. We sold normally, and once the network was back everything synced on its own without any issues.',
  },
  {
    title: 'Closing business became easier',
    quote:
      'TillFlow helps in closing business easily. We have shifts, we see what is expected to be there, and we close with comments for any positive or negative variance which the owner sees.',
  },
  {
    title: 'Profit visibility improved decision-making',
    quote:
      'We have seen profitable products more clearly. It was difficult to keep track as the business grew to over 1,000 products, but TillFlow has been a rock where sound decisions have been made.',
  },
];

const planPreview: WelcomePlanPreview[] = [
  {
    name: 'Starter',
    monthlyPrice: PLAN_MONTHLY_PRICES.STARTER,
    note: 'Lean single-store start',
    bullets: [
      'POS, products, customers, and inventory basics',
      'Offline-ready selling with receipts and simple setup',
      'Best for businesses starting with one branch and a lean team',
    ],
  },
  {
    name: 'Growth',
    monthlyPrice: PLAN_MONTHLY_PRICES.GROWTH,
    note: 'Best fit for most stores',
    featured: true,
    bullets: [
      'Everything in Starter, plus stronger controls and reporting',
      'Margins, accounting visibility, reorder support, and owner insight',
      'Best for serious supermarkets that want tighter operational discipline',
    ],
    addon: {
      name: 'Add online store',
      monthlyPrice: ADDON_ONLINE_STOREFRONT_MONTHLY,
      description: 'Public online storefront with mobile-money checkout for pickup orders. Speak to TillFlow to enable.',
    },
  },
  {
    name: 'Pro',
    monthlyPrice: PLAN_MONTHLY_PRICES.PRO,
    note: 'Multi-branch + executive control',
    bullets: [
      'Multi-branch operations with stock transfers between stores',
      'Owner dashboard, audit log, and cashflow forecast for executive oversight',
      'Online storefront with mobile-money checkout — included by default',
      'Best for operators running multiple stores or selling beyond the counter',
    ],
  },
];

export default function WelcomePage() {
  return (
    <div className="min-h-screen overflow-x-hidden">
      {/* Navigation — safe-area aware */}
      <nav
        className="fixed top-0 z-50 w-full border-b border-white/10 bg-white/90 backdrop-blur-xl"
        style={{ paddingTop: 'max(16px, env(safe-area-inset-top, 0px))' }}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-2.5 sm:px-6 sm:py-3.5">
          <div className="flex items-center gap-2">
            <Logo variant="mark" size={32} className="h-8 w-8 rounded-xl sm:h-9 sm:w-9" ariaHidden />
            <span className="text-lg font-bold font-display sm:text-xl">
              <span className="text-accent">Till</span>
              <span className="text-gray-800">Flow</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="inline-flex items-center rounded-xl px-3 py-2 text-sm font-semibold text-black/60 transition hover:text-black sm:px-4 sm:py-2.5"
            >
              Sign In
            </Link>
            <Link
              href="/register"
              className="inline-flex items-center rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-accent/25 transition hover:bg-accent/80 hover:shadow-accent/40 sm:px-5 sm:py-2.5"
            >
              Start Free
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative px-4 pb-16 pt-[calc(8.25rem+env(safe-area-inset-top,0px))] sm:px-6 sm:pt-32 sm:pb-20">
        {/* Background decoration */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-40 -right-40 h-[600px] w-[600px] rounded-full bg-blue-100/50 blur-3xl" />
          <div className="absolute -bottom-40 -left-40 h-[500px] w-[500px] rounded-full bg-accentSoft/40 blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-6xl">
          <div className="mx-auto max-w-3xl text-center">
            {/* Ghana-first badge */}
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accentSoft px-4 py-1.5 text-sm font-medium text-accent">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-500" />
              </span>
              For supermarkets, minimarts and provision businesses in Ghana
            </div>

            <h1 className="text-4xl font-bold font-display tracking-tight text-gray-900 sm:text-5xl lg:text-6xl">
              Sell fast. Track stock.{' '}
              <span className="bg-gradient-to-r from-accent to-accent/80 bg-clip-text text-transparent">
                Know your money.
              </span>
            </h1>
            <p className="mt-6 text-lg leading-relaxed text-black/60">
              TillFlow helps product-based businesses sell, track stock, manage cash and MoMo payments, follow up
              debtors and suppliers, and see owner reports clearly — even when the internet is unreliable.
            </p>

            {/* CTAs */}
            <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
              <Link
                href="/demo"
                className="group flex items-center gap-2 rounded-2xl bg-gradient-to-r from-accent to-accent/80 px-8 py-4 text-base font-bold text-white shadow-xl shadow-accent/25 transition-all hover:shadow-2xl hover:shadow-accent/30 hover:-translate-y-0.5"
              >
                <svg className="h-5 w-5 transition-transform group-hover:scale-110" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
                </svg>
                See live demo
              </Link>
              <BookDemoActions layout="hero" />
              <Link
                href="/register"
                className="flex items-center gap-2 rounded-2xl border-2 border-black/10 bg-white px-8 py-4 text-base font-bold text-gray-800 shadow-lg transition-all hover:border-accent/20 hover:shadow-xl hover:-translate-y-0.5"
              >
                Start 7-day trial
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                </svg>
              </Link>
            </div>
            <p className="mt-4 max-w-lg text-center text-sm text-black/50">
              Explore a sample business and see how TillFlow tracks sales, stock, payments and reports — no signup required.
            </p>

            <div className="mt-4">
              <a
                href="#pricing"
                className="inline-flex min-h-11 items-center text-sm text-black/45 underline-offset-4 transition hover:text-black/70 hover:underline"
              >
                View pricing ↓
              </a>
            </div>

            {/* Social proof */}
            <div className="mt-12 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm text-black/40">
              {[
                'Offline-ready selling',
                'Cash, MoMo & credit',
                'Daily owner reports',
                'Built for Ghana',
              ].map((item) => (
                <span key={item} className="flex items-center gap-1.5">
                  <svg className="h-4 w-4 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                  </svg>
                  {item}
                </span>
              ))}
            </div>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-2.5">
              {businessTypes.map((type) => (
                <span
                  key={type}
                  className="rounded-full border border-black/5 bg-white/70 px-3 py-1.5 text-xs font-medium text-black/50 shadow-sm backdrop-blur-sm"
                >
                  {type}
                </span>
              ))}
            </div>
          </div>

          {/* Dashboard Preview — shows key owner metrics */}
          <div className="mt-16 rounded-3xl border border-black/5 bg-white/70 p-3 shadow-2xl shadow-black/10 backdrop-blur-sm sm:p-4">
            <div className="overflow-hidden rounded-2xl border border-black/5">
              {/* Header bar */}
              <div className="flex items-center justify-between bg-gradient-to-r from-accent to-blue-700 px-5 py-3.5 text-white">
                <div>
                  <div className="text-xs font-medium opacity-70">Adom Retail Demo</div>
                  <div className="mt-0.5 text-sm font-bold">Today's Overview</div>
                </div>
                <div className="flex items-center gap-1.5 rounded-full bg-white/20 px-2.5 py-1 text-xs font-semibold">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-400" />
                  Live
                </div>
              </div>

              {/* Key stats */}
              <div className="grid grid-cols-1 divide-y divide-black/5 bg-white sm:grid-cols-3 sm:divide-x sm:divide-y-0">
                <div className="p-3 sm:p-4">
                  <div className="text-[10px] font-medium text-black/40 sm:text-xs">Revenue Today</div>
                  <div className="mt-1 whitespace-nowrap font-bold tabular-nums text-accent" style={{ fontSize: 'clamp(1.25rem, 5.5vw, 1.5rem)' }}>GH₵4,280</div>
                  <div className="mt-0.5 text-[10px] text-success sm:text-xs">↑ 12% vs yesterday</div>
                </div>
                <div className="p-3 sm:p-4">
                  <div className="text-[10px] font-medium text-black/40 sm:text-xs">Gross Profit</div>
                  <div className="mt-1 whitespace-nowrap font-bold tabular-nums text-success" style={{ fontSize: 'clamp(1.25rem, 5.5vw, 1.5rem)' }}>GH₵980</div>
                  <div className="mt-0.5 text-[10px] text-black/40 sm:text-xs">24% margin</div>
                </div>
                <div className="p-3 sm:p-4">
                  <div className="text-[10px] font-medium text-black/40 sm:text-xs">MoMo Collected</div>
                  <div className="mt-1 whitespace-nowrap font-bold tabular-nums text-amber-600" style={{ fontSize: 'clamp(1.25rem, 5.5vw, 1.5rem)' }}>GH₵1,640</div>
                  <div className="mt-0.5 text-[10px] text-black/40 sm:text-xs">38% of revenue</div>
                </div>
              </div>

              {/* Low stock alert */}
              <div className="flex items-start gap-2 border-t border-black/5 bg-amber-50 px-4 py-2.5">
                <span className="mt-0.5 shrink-0 text-amber-500">⚠</span>
                <span className="text-xs font-medium text-amber-800">
                  3 products low on stock — Milo 400g, Indomie Noodles, Nescafé 200g
                </span>
              </div>

              {/* Payment mix */}
              <div className="border-t border-black/5 bg-white p-4">
                <div className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-black/35">How money came in</div>
                <div className="space-y-2">
                  {[
                    { label: 'Cash',   pct: 58, color: '#059669', amount: 'GH₵2,482' },
                    { label: 'MoMo',   pct: 38, color: '#f59e0b', amount: 'GH₵1,626' },
                    { label: 'Credit', pct: 4,  color: '#3b82f6', amount: 'GH₵172' },
                  ].map((r) => (
                    <div key={r.label} className="flex items-center gap-2 text-xs">
                      <span className="w-12 text-black/50">{r.label}</span>
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-black/5">
                        <div className="h-full rounded-full" style={{ width: `${r.pct}%`, background: r.color }} />
                      </div>
                      <span className="w-7 text-right text-black/40">{r.pct}%</span>
                      <span className="w-20 whitespace-nowrap text-right tabular-nums font-medium text-black/60">{r.amount}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="relative px-6 pb-6">
        <div className="mx-auto max-w-6xl rounded-[2rem] border border-black/5 bg-gradient-to-br from-white/85 to-accentSoft/55 p-6 shadow-sm backdrop-blur-sm sm:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-black/5 bg-white/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-black/45">
                Pilot retailer feedback
              </div>
              <h2 className="mt-4 text-3xl font-bold font-display text-gray-900 sm:text-4xl">
                Feedback from a live business using TillFlow.
              </h2>
              <p className="mt-3 text-base leading-7 text-black/55">
                From day-to-day operations — offline selling, shift closing and product profitability.
              </p>
            </div>
            <div className="rounded-2xl border border-black/5 bg-white/80 px-4 py-3 text-left text-sm text-black/50 shadow-sm">
              From offline selling to shift closing and product profitability, the value is showing up in day-to-day decisions.
            </div>
          </div>

          <div className="mt-8 grid gap-4 lg:grid-cols-3">
            {testimonials.map((testimonial) => (
              <div
                key={testimonial.title}
                className="rounded-2xl border border-black/5 bg-white/85 p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-black/35">Pilot feedback</div>
                <h3 className="mt-3 text-xl font-semibold font-display leading-8 text-gray-900">{testimonial.title}</h3>
                <div className="mt-4 rounded-2xl bg-accentSoft/70 px-4 py-4 text-sm leading-7 text-black/60">
                  &ldquo;{testimonial.quote}&rdquo;
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="relative bg-gradient-to-b from-transparent to-accentSoft/50 px-6 py-20">
        <div className="mx-auto max-w-4xl">
          <div className="mb-16 text-center">
            <h2 className="text-3xl font-bold font-display sm:text-4xl">Up and Running in 3 Steps</h2>
            <p className="mt-4 text-lg text-black/50">No hardware, no installation CD, no technician needed.</p>
          </div>
          <div className="grid gap-8 md:grid-cols-3">
            {[
              { step: '01', title: 'Create Account', desc: 'Enter your business name, local currency, and go. Takes about 30 seconds.', color: 'from-accent to-accent/80' },
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

      {/* Owner Outcomes */}
      <section className="relative px-6 py-6">
        <div className="mx-auto max-w-6xl rounded-[2rem] border border-black/5 bg-white/75 p-6 shadow-sm backdrop-blur-sm sm:p-8">
          <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-accent/15 bg-accentSoft px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-accent">
                Built for real retail rhythm
              </div>
              <h2 className="mt-4 text-3xl font-bold font-display text-gray-900 sm:text-4xl">
                Clean for staff. Serious where the owner feels the pressure.
              </h2>
              <p className="mt-4 max-w-lg text-base leading-7 text-black/55">
                This is where TillFlow earns its place: unstable internet, mixed-unit stock, fast tills, and the need to close the day with real visibility instead of guesswork.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              {ownerOutcomes.map((item) => (
                <div
                  key={item.title}
                  className="rounded-2xl border border-black/5 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
                >
                  <div className="mb-3 h-2 w-12 rounded-full bg-gradient-to-r from-accent to-blue-400" />
                  <h3 className="text-base font-semibold font-display text-gray-900">{item.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-black/50">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="relative px-6 pb-10 pt-20">
        <div className="mx-auto max-w-6xl">
          <div className="mb-16 text-center">
            <h2 className="text-3xl font-bold font-display sm:text-4xl">
              One system for sales, stock and owner control.
            </h2>
            <p className="mt-4 text-lg text-black/50">
              From the first sale to the closing numbers, TillFlow keeps the business moving.
            </p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <div
                key={f.title}
                className="group rounded-2xl border border-black/5 bg-white/80 p-6 shadow-sm transition-all hover:border-accent/20 hover:-translate-y-1 hover:shadow-lg"
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

      {/* Pricing */}
      <section id="pricing" className="relative scroll-mt-24 px-6 pb-24 pt-10">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold font-display sm:text-4xl">
            Pick the setup that matches how your business runs today.
          </h2>
          <p className="mt-4 text-lg text-black/50">
            Start with Starter, move into Growth when reporting and control matter more, and step into Pro for multi-branch operations and executive oversight. The online store is included on Pro and available on Growth as an add-on.
          </p>
          <WelcomePricingPreview plans={planPreview} />
          <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Link
              href="/demo"
              className="rounded-2xl bg-gradient-to-r from-accent to-accent/80 px-8 py-4 text-base font-bold text-white shadow-xl shadow-accent/25 transition-all hover:shadow-2xl hover:-translate-y-0.5"
            >
              See live demo
            </Link>
            <Link
              href="/register"
              className="rounded-2xl border-2 border-black/10 bg-white px-8 py-4 text-base font-bold transition-all hover:border-accent/20 hover:shadow-xl hover:-translate-y-0.5"
            >
              Start 7-day trial
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-black/5 px-6 py-10">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-2">
              <Logo variant="mark" size={24} className="mt-0.5 h-6 w-6 rounded-lg" ariaHidden />
              <div>
                <span className="text-sm font-semibold font-display">
                  <span className="text-accent">Till</span>
                  <span className="text-gray-800">Flow</span>
                </span>
                <p className="mt-1 text-xs leading-5 text-black/45">
                  Cloud-based · Works on phone, tablet and desktop · Built for Ghanaian businesses
                </p>
                <p className="mt-2 text-[11px] text-black/35">© 2026 Tish Group. All rights reserved.</p>
              </div>
            </div>
            <div className="flex flex-col gap-3 sm:items-end">
              <div className="flex flex-wrap gap-2">
                <BookDemoActions layout="compact" />
                <Link href="/demo" className="inline-flex items-center rounded-xl border border-black/10 px-4 py-2.5 text-sm font-semibold text-black/70 transition hover:border-accent/25 hover:text-accent">
                  See live demo
                </Link>
              </div>
              <p className="text-xs text-black/35">Sales made simple.</p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
