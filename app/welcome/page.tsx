import Link from 'next/link';
import WelcomePricingPreview, { type WelcomePlanPreview } from '@/components/WelcomePricingPreview';
import ProductScreenshotFrame from '@/components/marketing/ProductScreenshotFrame';
import { FreeTrialLink, HeroCTAGroup, LiveDemoButton, WhatsAppDemoButton } from '@/components/marketing/WelcomeCTA';
import { Logo } from '@/components/Logo';
import { PLAN_MONTHLY_PRICES, ADDON_ONLINE_STOREFRONT_MONTHLY } from '@/lib/plan-pricing';
import {
  BUSINESS_TYPES,
  FEATURE_GRID,
  GHANA_REALITY_BULLETS,
  HOW_IT_WORKS,
  PRODUCT_PROOF,
  ROLE_CARDS,
  TESTIMONIALS,
  TRUST_BADGES,
  WELCOME_SUBHEADLINE,
} from '@/lib/marketing/welcome-content';

const planPreview: WelcomePlanPreview[] = [
  {
    name: 'Starter',
    monthlyPrice: PLAN_MONTHLY_PRICES.STARTER,
    note: 'For a small single-branch business starting clean.',
    bullets: [
      'POS, products, customers and inventory basics',
      'Offline-ready selling with receipts and simple setup',
      'Best when you want a lean start at one branch',
    ],
  },
  {
    name: 'Growth',
    monthlyPrice: PLAN_MONTHLY_PRICES.GROWTH,
    note: 'Best for most owner-led retail businesses.',
    featured: true,
    bullets: [
      'Everything in Starter, plus stronger controls and reporting',
      'Margins, accounting visibility, reorder support and owner insight',
      'Best when reports, margins and tighter control matter',
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
    note: 'For larger or multi-branch businesses that need more control.',
    bullets: [
      'Multi-branch operations with stock transfers between stores',
      'Owner dashboard, audit log and cashflow forecast',
      'Online storefront with mobile-money checkout included',
    ],
  },
];

const NAV_LINKS = [
  { href: '#product-proof', label: 'Features' },
  { href: '#how-it-works', label: 'How it works' },
  { href: '#pricing', label: 'Pricing' },
] as const;

export default function WelcomePage() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-paper">
      {/* Trust strip */}
      <div className="border-b border-black/5 bg-slate-900 text-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-4 gap-y-1 px-4 py-2 text-center text-[11px] font-medium text-white/85 sm:justify-between sm:text-left sm:text-xs">
          <span>Built for Ghanaian retail</span>
          <span className="hidden sm:inline">Works on phone, tablet and laptop</span>
          <span>WhatsApp demo available</span>
        </div>
      </div>

      {/* Navigation */}
      <header
        className="sticky top-0 z-50 border-b border-black/5 bg-white/95 backdrop-blur-xl"
        style={{ paddingTop: 'max(0px, env(safe-area-inset-top, 0px))' }}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2.5 sm:px-6 sm:py-3">
          <Logo variant="lockup" size={28} alt="TillFlow" />
          <nav className="hidden items-center gap-5 md:flex" aria-label="Primary">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="text-sm font-semibold text-black/55 transition hover:text-accent"
              >
                {link.label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="hidden rounded-xl px-3 py-2 text-sm font-semibold text-black/60 transition hover:text-black sm:inline-flex"
            >
              Sign in
            </Link>
            <WhatsAppDemoButton size="nav" className="hidden sm:inline-flex" />
            <Link
              href="/login"
              className="inline-flex rounded-xl px-3 py-2 text-sm font-semibold text-black/60 sm:hidden"
            >
              Sign in
            </Link>
            <WhatsAppDemoButton size="nav" className="sm:hidden" />
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative px-4 pb-12 pt-8 sm:px-6 sm:pb-16 sm:pt-12">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-32 right-0 h-80 w-80 rounded-full bg-blue-100/60 blur-3xl" />
          <div className="absolute bottom-0 left-0 h-64 w-64 rounded-full bg-accentSoft/50 blur-3xl" />
        </div>

        <div className="relative mx-auto grid max-w-6xl items-center gap-8 lg:grid-cols-2 lg:gap-12">
          <div className="max-w-xl">
            <div className="mb-4 inline-flex rounded-full border border-accent/20 bg-accentSoft px-3 py-1 text-xs font-semibold text-accent">
              Built for Ghanaian retail
            </div>
            <h1 className="text-3xl font-bold font-display tracking-tight text-gray-900 sm:text-4xl lg:text-5xl">
              Sell fast. Track stock.{' '}
              <span className="bg-gradient-to-r from-accent to-blue-700 bg-clip-text text-transparent">
                Know your money.
              </span>
            </h1>
            <p className="mt-4 text-base leading-relaxed text-black/60 sm:text-lg">{WELCOME_SUBHEADLINE}</p>

            <HeroCTAGroup className="mt-6" />
            <p className="mt-3 text-sm text-black/50">
              <FreeTrialLink /> · No signup required for the live demo
            </p>

            <div className="mt-6 flex flex-wrap gap-x-4 gap-y-2 text-xs text-black/45 sm:text-sm">
              {TRUST_BADGES.map((item) => (
                <span key={item} className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  {item}
                </span>
              ))}
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-lg lg:max-w-none">
            <div className="grid gap-3 sm:grid-cols-[1fr_1.15fr]">
              <ProductScreenshotFrame
                src="/marketing/pos-checkout.png"
                alt="TillFlow POS checkout with cart, payment methods and change due"
                priority
                label="POS checkout"
                className="sm:mt-8"
                imageClassName="object-[center_12%] object-cover"
              />
              <ProductScreenshotFrame
                src="/marketing/owner-dashboard.png"
                alt="TillFlow owner command center with revenue and expected cash"
                priority
                label="Owner view"
                imageClassName="object-top object-cover"
              />
            </div>
          </div>
        </div>

        <div className="relative mx-auto mt-8 flex max-w-6xl flex-wrap gap-2">
          {BUSINESS_TYPES.map((type) => (
            <span
              key={type}
              className="rounded-full border border-black/5 bg-white/80 px-3 py-1.5 text-xs font-medium text-black/50 shadow-sm"
            >
              {type}
            </span>
          ))}
        </div>
      </section>

      {/* Product proof */}
      <section id="product-proof" className="scroll-mt-24 px-4 py-12 sm:px-6 sm:py-16">
        <div className="mx-auto max-w-6xl">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Product proof</p>
            <h2 className="mt-3 text-3xl font-bold font-display text-gray-900 sm:text-4xl">
              See the counter, the stockroom and the owner view.
            </h2>
            <p className="mt-3 text-base leading-relaxed text-black/55">
              One system for the counter, the stockroom and the owner.
            </p>
          </div>

          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {PRODUCT_PROOF.map((item) => (
              <div key={item.title} className="flex flex-col">
                <ProductScreenshotFrame
                  src={item.image}
                  alt={item.alt}
                  label={item.title}
                  imageClassName={item.imageClassName ?? 'object-top object-cover'}
                />
                <p className="mt-3 text-sm leading-relaxed text-black/55">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Ghana retail reality */}
      <section className="px-4 py-12 sm:px-6 sm:py-16">
        <div className="mx-auto max-w-6xl overflow-hidden rounded-[2rem] border border-black/5 bg-white shadow-sm">
          <div className="grid lg:grid-cols-2">
            <div className="relative min-h-[220px] bg-gradient-to-br from-amber-100 via-orange-50 to-emerald-50 lg:min-h-[420px]">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.55),transparent_55%)]" />
              <div className="relative flex h-full flex-col justify-end p-6 sm:p-8">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-black/45">Ghana retail reality</p>
                <p className="mt-2 max-w-sm text-2xl font-bold font-display leading-tight text-gray-900">
                  Built for Ghanaian retail reality.
                </p>
                <p className="mt-2 text-sm text-black/55">
                  Practical for counters, stockrooms, tills and owners — not generic foreign SaaS.
                </p>
              </div>
            </div>
            <div className="p-6 sm:p-8 lg:p-10">
              <ul className="grid gap-3 sm:grid-cols-2">
                {GHANA_REALITY_BULLETS.map((bullet) => (
                  <li key={bullet} className="flex items-start gap-2 text-sm text-black/60">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                    {bullet}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Pilot feedback */}
      <section className="px-4 pb-6 sm:px-6">
        <div className="mx-auto max-w-6xl rounded-[2rem] border border-black/5 bg-gradient-to-br from-white to-accentSoft/40 p-6 sm:p-8">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-black/45">Live pilot feedback</p>
            <h2 className="mt-3 text-3xl font-bold font-display text-gray-900 sm:text-4xl">
              Real feedback from a Ghana retail pilot.
            </h2>
            <p className="mt-3 text-sm text-black/55">Business name withheld for privacy.</p>
          </div>
          <div className="mt-8 grid gap-4 lg:grid-cols-3">
            {TESTIMONIALS.map((item) => (
              <div key={item.title} className="rounded-2xl border border-black/5 bg-white/90 p-5 shadow-sm">
                <h3 className="text-lg font-semibold font-display text-gray-900">{item.title}</h3>
                <p className="mt-3 text-sm leading-7 text-black/60">&ldquo;{item.quote}&rdquo;</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Role confidence */}
      <section className="px-4 py-12 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-3xl font-bold font-display text-gray-900 sm:text-4xl">
            Clean for cashiers. Controlled for managers. Clear for owners.
          </h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {ROLE_CARDS.map((card) => (
              <div key={card.role} className="rounded-2xl border border-black/5 bg-white p-5 shadow-sm">
                <h3 className="text-lg font-semibold font-display text-accent">{card.role}</h3>
                <ul className="mt-4 space-y-2">
                  {card.items.map((item) => (
                    <li key={item} className="flex items-start gap-2 text-sm text-black/55">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="scroll-mt-24 bg-accentSoft/35 px-4 py-12 sm:px-6 sm:py-16">
        <div className="mx-auto max-w-6xl text-center">
          <h2 className="text-3xl font-bold font-display sm:text-4xl">Up and running in four steps</h2>
          <p className="mt-3 text-black/50">No hardware, no installation CD, no technician needed.</p>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {HOW_IT_WORKS.map((step) => (
              <div key={step.step} className="rounded-2xl border border-black/5 bg-white p-5 shadow-sm">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-accent text-sm font-bold text-white">
                  {step.step}
                </div>
                <h3 className="mt-4 font-semibold font-display">{step.title}</h3>
                <p className="mt-2 text-sm text-black/50">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="px-4 py-12 sm:px-6 sm:py-16">
        <div className="mx-auto max-w-6xl">
          <div className="text-center">
            <h2 className="text-3xl font-bold font-display sm:text-4xl">
              One system from first sale to closing numbers.
            </h2>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURE_GRID.map((feature) => (
              <div key={feature.title} className="rounded-2xl border border-black/5 bg-white p-5 shadow-sm">
                <h3 className="font-semibold font-display text-gray-900">{feature.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-black/50">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="scroll-mt-24 px-4 pb-16 pt-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold font-display sm:text-4xl">
            Pick the setup that matches how your business runs today.
          </h2>
          <WelcomePricingPreview plans={planPreview} />
          <p className="mt-6 text-sm text-black/55">Need help choosing?</p>
          <div className="mt-3 flex justify-center">
            <WhatsAppDemoButton size="sm" />
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="border-y border-black/5 bg-slate-900 px-4 py-12 text-white sm:px-6 sm:py-16">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-3xl font-bold font-display sm:text-4xl">Ready to see TillFlow in action?</h2>
          <p className="mt-3 text-white/70">Book a WhatsApp walkthrough or explore the live demo first.</p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <WhatsAppDemoButton />
            <LiveDemoButton className="border-white/20 bg-white/10 text-white hover:border-white/30 hover:bg-white/15" />
          </div>
          <p className="mt-4 text-sm text-white/55">
            <Link href="/register" className="underline-offset-4 hover:underline">
              Start free trial
            </Link>
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-4 py-10 sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <Logo variant="lockup" size={22} alt="TillFlow" />
            <p className="mt-2 text-xs leading-5 text-black/45">
              Built for Ghanaian retail · Works on phone, tablet and laptop
            </p>
            <p className="mt-2 text-[11px] text-black/35">© 2026 Tish Group. All rights reserved.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <WhatsAppDemoButton size="sm" />
            <LiveDemoButton size="sm" />
          </div>
        </div>
      </footer>
    </div>
  );
}
