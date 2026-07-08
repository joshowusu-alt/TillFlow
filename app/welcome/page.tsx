import Link from 'next/link';
import './welcome-marketing.css';
import WelcomePricingPreview, { type WelcomePlanPreview } from '@/components/WelcomePricingPreview';
import ProductProofSection from '@/components/marketing/ProductProofSection';
import TrustProofSection from '@/components/marketing/TrustProofSection';
import { HeroCTAGroup, LiveDemoButton, WhatsAppDemoButton } from '@/components/marketing/WelcomeCTA';
import HeroProductComposition from '@/components/marketing/visuals/HeroProductComposition';
import { Logo } from '@/components/Logo';
import { PLAN_MONTHLY_PRICES, ADDON_ONLINE_STOREFRONT_MONTHLY } from '@/lib/plan-pricing';
import {
  TRUST_PROOF,
  TRUST_PROOF_THEMES,
  WELCOME_CATEGORY_LINE,
  WELCOME_HEADLINE,
  WELCOME_SUBHEADLINE,
} from '@/lib/marketing/welcome-content';

const planPreview: WelcomePlanPreview[] = [
  {
    name: 'Starter',
    monthlyPrice: PLAN_MONTHLY_PRICES.STARTER,
    note: 'For a small single-branch business starting clean.',
    bullets: ['POS, products and customers', 'Inventory basics and receipts', 'Offline-ready selling'],
  },
  {
    name: 'Growth',
    monthlyPrice: PLAN_MONTHLY_PRICES.GROWTH,
    note: 'Best for most owner-led retail businesses.',
    featured: true,
    bullets: [
      'Stronger controls and reports',
      'Margins, reorder support and owner insight',
      'Best when money visibility matters',
    ],
    addon: {
      name: 'Add online store',
      monthlyPrice: ADDON_ONLINE_STOREFRONT_MONTHLY,
      description:
        'Public online storefront with mobile-money checkout for pickup orders. Speak to TillFlow to enable.',
    },
  },
  {
    name: 'Pro',
    monthlyPrice: PLAN_MONTHLY_PRICES.PRO,
    note: 'For larger or multi-branch businesses that need more control.',
    bullets: ['Multi-branch stock transfers', 'Audit log and cashflow forecast', 'Online storefront included'],
  },
];

const NAV_LINKS = [
  { href: '#product-proof', label: 'Product' },
  { href: '#trust', label: 'Trust' },
  { href: '#pricing', label: 'Pricing' },
] as const;

function EarlyTrustStrip() {
  const featuredQuote = TRUST_PROOF_THEMES.find((theme) => theme.featured) ?? TRUST_PROOF_THEMES[0];

  return (
    <section className="px-4 pb-4 sm:px-6 sm:pb-6">
      <div className="mx-auto grid max-w-6xl gap-3 rounded-[1.4rem] border border-blue-100 bg-white p-4 shadow-card sm:grid-cols-[0.9fr_1.1fr] sm:p-5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-accent">Real retail proof</p>
          <p className="mt-1 text-lg font-display font-bold text-ink">{TRUST_PROOF.business}</p>
          <p className="text-sm text-ink/55">1,000+ products · daily sales · staff shifts · stock and cash control</p>
        </div>
        <blockquote className="rounded-2xl bg-accentSoft/60 p-4">
          <p className="text-sm font-semibold leading-6 text-ink">&ldquo;{featuredQuote.quote}&rdquo;</p>
          <footer className="mt-2 text-xs font-bold text-accent">
            {TRUST_PROOF.person}, {TRUST_PROOF.business}
          </footer>
        </blockquote>
      </div>
    </section>
  );
}

export default function WelcomePage() {
  return (
    <div className="welcome-page min-h-screen overflow-x-hidden bg-paper">
      <header
        className="sticky top-0 z-50 border-b border-border bg-white/95 backdrop-blur-xl"
        style={{ paddingTop: 'max(0px, env(safe-area-inset-top, 0px))' }}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 py-2.5 sm:gap-3 sm:px-6 sm:py-3">
          <Logo variant="lockup" size={26} alt="TillFlow" />
          <nav className="hidden items-center gap-5 md:flex" aria-label="Primary">
            {NAV_LINKS.map((link) => (
              <a key={link.href} href={link.href} className="text-sm font-semibold text-ink/55 transition hover:text-accent">
                {link.label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <Link
              href="/login"
              className="inline-flex whitespace-nowrap rounded-xl px-2.5 py-2 text-xs font-semibold text-ink/60 transition hover:text-ink sm:px-3 sm:text-sm"
            >
              Sign in
            </Link>
            <WhatsAppDemoButton size="nav" />
          </div>
        </div>
      </header>

      <section className="relative px-4 pb-5 pt-5 sm:px-6 sm:pb-8 sm:pt-8">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-40 right-0 h-96 w-96 rounded-full bg-accentSoft blur-3xl" />
          <div className="absolute bottom-0 left-0 h-80 w-80 rounded-full bg-accent/10 blur-3xl" />
        </div>

        <div className="relative mx-auto grid max-w-6xl items-center gap-5 lg:grid-cols-[0.92fr_1.08fr] lg:gap-10">
          <div className="max-w-xl">
            <div className="welcome-hero-copy mb-3 inline-flex items-center gap-1.5 rounded-full border border-accent/20 bg-accentSoft px-3 py-1 text-xs font-semibold text-accent">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              Trusted by EL-SHADDAI Supermarket
            </div>
            <p className="welcome-hero-copy-delay text-sm font-bold text-ink/75 sm:text-base">{WELCOME_CATEGORY_LINE}</p>
            <h1 className="welcome-hero-copy-delay mt-2 text-[2.55rem] font-bold font-display leading-[0.98] tracking-tight text-ink sm:text-5xl lg:text-6xl">
              {WELCOME_HEADLINE}
            </h1>
            <p className="welcome-hero-copy-delay mt-4 text-base leading-7 text-ink/62 sm:text-lg">{WELCOME_SUBHEADLINE}</p>

            <HeroCTAGroup className="welcome-hero-cta mt-5" />
            <p className="welcome-hero-cta mt-2 text-sm text-ink/50">WhatsApp first. No setup needed to see if it fits.</p>
          </div>

          <HeroProductComposition />
        </div>
      </section>

      <EarlyTrustStrip />
      <ProductProofSection />
      <TrustProofSection />

      <section id="pricing" className="scroll-mt-24 px-4 py-8 sm:px-6 sm:py-10">
        <div className="mx-auto max-w-6xl">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-accent">Pricing</p>
            <h2 className="mt-3 text-3xl font-bold font-display text-ink sm:text-4xl">
              Pick the setup that matches how your business runs today.
            </h2>
          </div>
          <WelcomePricingPreview plans={planPreview} />
          <div className="mt-6 text-center">
            <p className="text-sm text-ink/55">
              Not sure which fits? Message us on WhatsApp and we&apos;ll tell you honestly — including if TillFlow is not
              right for you yet.
            </p>
            <div className="mt-3 flex justify-center">
              <WhatsAppDemoButton size="sm" />
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-accent/20 bg-accent px-4 py-8 text-white sm:px-6 sm:py-12">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-3xl font-bold font-display sm:text-4xl">Stop guessing what is in the till.</h2>
          <p className="mt-3 text-white/70">
            WhatsApp us for a 15-minute walkthrough. We will show the counter, the stockroom, cash close and owner reports.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <WhatsAppDemoButton />
            <LiveDemoButton className="border-white/20 bg-white/10 text-white hover:border-white/30 hover:bg-white/15" />
          </div>
        </div>
      </section>

      <footer className="px-4 py-8 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <Logo variant="lockup" size={22} alt="TillFlow" />
          <p className="mt-2 text-xs leading-5 text-ink/45">
            Built for Ghanaian retail · Works on phone, tablet and laptop
          </p>
          <p className="mt-2 text-[11px] text-muted">© 2026 TillFlow. A Tish Group product.</p>
        </div>
      </footer>
    </div>
  );
}
