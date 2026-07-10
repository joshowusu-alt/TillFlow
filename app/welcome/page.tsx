import Link from 'next/link';
import './welcome-marketing.css';
import WelcomePricingPreview, { type WelcomePlanPreview } from '@/components/WelcomePricingPreview';
import ProductProofSection from '@/components/marketing/ProductProofSection';
import TrustProofSection from '@/components/marketing/TrustProofSection';
import RetailRealityBelt from '@/components/marketing/RetailRealityBelt';
import RevealOnScroll from '@/components/marketing/RevealOnScroll';
import {
  HeroCTAGroup,
  LiveDemoButton,
  MidFunnelCTAGroup,
  PricingPrimaryCTA,
  WhatsAppDemoButton,
  hasTillflowWhatsApp,
} from '@/components/marketing/WelcomeCTA';
import HeroProductComposition from '@/components/marketing/visuals/HeroProductComposition';
import { Logo } from '@/components/Logo';
import { PLAN_MONTHLY_PRICES, ADDON_ONLINE_STOREFRONT_MONTHLY } from '@/lib/plan-pricing';
import {
  CONTROL_POINTS,
  CONTROL_SECTION,
  EARLY_NAMED_PROOF,
  FINAL_CTA,
  HOPE_STRIP,
  MICRO_PRIMES,
  MID_FUNNEL_CTA,
  OBJECTION_PLAN_FIT_FALLBACK,
  OBJECTION_PLAN_FIT_WHATSAPP,
  OBJECTION_REASSURANCES_CORE,
  OWNER_MOMENTS,
  PRICING_SECTION,
  WELCOME_ANCHOR,
  WELCOME_CATEGORY_LINE,
  WELCOME_HEADLINE,
  WELCOME_HERO_SUPPORT_FALLBACK,
  WELCOME_HERO_SUPPORT_WHATSAPP,
  WELCOME_SUBHEADLINE,
} from '@/lib/marketing/welcome-content';
import { assertTillflowWhatsAppConfiguredForProduction } from '@/lib/marketing/whatsapp';

assertTillflowWhatsAppConfiguredForProduction();

const planPreview: WelcomePlanPreview[] = [
  {
    name: 'Starter',
    monthlyPrice: PLAN_MONTHLY_PRICES.STARTER,
    maturity: 'Getting organised',
    note: 'For getting your business under control — clean records from day one.',
    bullets: ['Sell and record every transaction', 'Products, customers and basic stock', 'Offline-ready selling'],
  },
  {
    name: 'Growth',
    monthlyPrice: PLAN_MONTHLY_PRICES.GROWTH,
    maturity: 'Owner visibility',
    note: 'For owners who want to see what is happening without standing at the counter all day.',
    featured: true,
    bullets: [
      'Know before you count — expected cash and closing confidence',
      'Margins, reorder support and Owner View',
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
    maturity: 'Complete business control',
    note: 'For larger businesses that need complete control across a multi-branch operation.',
    bullets: ['Multi-branch stock transfers', 'Audit log and cashflow forecast', 'Online storefront included'],
  },
];

const NAV_LINKS = [
  { href: '#control', label: 'Control' },
  { href: '#product-proof', label: 'Proof' },
  { href: '#stories', label: 'Stories' },
  { href: '#pricing', label: 'Pricing' },
] as const;

function MicroPrime({ children }: { children: string }) {
  return (
    <div className="px-4 py-3 sm:px-6 sm:py-4">
      <p className="mx-auto max-w-2xl text-center text-sm font-medium leading-6 text-ink/70 sm:text-base sm:leading-7">
        {children}
      </p>
    </div>
  );
}

function HopeStrip() {
  return (
    <section className="px-4 pb-3 sm:px-6 sm:pb-4" aria-label="Retail recognition">
      <div className="mx-auto max-w-6xl rounded-[1.4rem] border border-blue-100 bg-white p-4 shadow-card sm:p-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-accent">{HOPE_STRIP.eyebrow}</p>
        <h2 className="mt-2 text-xl font-display font-bold text-ink sm:text-2xl">{HOPE_STRIP.headline}</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-ink/60 sm:text-base">{HOPE_STRIP.body}</p>
      </div>
    </section>
  );
}

function OwnerMomentsStrip() {
  return (
    <section className="px-4 pb-4 sm:px-6 sm:pb-5" aria-label="Owner moments">
      <div className="mx-auto max-w-6xl">
        <p className="text-center text-[11px] font-semibold uppercase tracking-[0.2em] text-accent">A normal day</p>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {OWNER_MOMENTS.map((moment) => (
            <li
              key={moment}
              className="rounded-xl border border-slate-200/80 bg-white px-3 py-2.5 text-sm leading-5 text-ink/65 shadow-sm"
            >
              {moment}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function EarlyNamedProof() {
  return (
    <section className="px-4 pb-4 sm:px-6 sm:pb-5" aria-label="Named business proof">
      <div className="mx-auto max-w-4xl border-l-2 border-accent/45 px-4 py-1 sm:px-5">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">
          {EARLY_NAMED_PROOF.eyebrow}
        </p>
        <p className="mt-1.5 text-sm leading-6 text-ink/65 sm:text-base">{EARLY_NAMED_PROOF.line}</p>
        <p className="mt-1 text-sm font-semibold leading-6 text-ink sm:text-base">{EARLY_NAMED_PROOF.hook}</p>
      </div>
    </section>
  );
}

function ControlSection() {
  return (
    <section id="control" className="scroll-mt-32 px-4 py-6 sm:px-6 sm:py-9">
      <RevealOnScroll>
        <div className="mx-auto max-w-6xl">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-accent">{CONTROL_SECTION.eyebrow}</p>
            <h2 className="mt-3 text-3xl font-bold font-display text-ink sm:text-4xl">{CONTROL_SECTION.headline}</h2>
            <p className="mt-3 text-base leading-7 text-ink/58">{CONTROL_SECTION.intro}</p>
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {CONTROL_POINTS.map((point) => (
              <div
                key={point}
                className="rounded-2xl border border-slate-200/80 bg-white px-4 py-4 text-left shadow-sm"
              >
                <p className="text-sm font-semibold leading-6 text-ink">{point}</p>
              </div>
            ))}
          </div>
        </div>
      </RevealOnScroll>
    </section>
  );
}

function MidFunnelBridge() {
  const whatsappReady = hasTillflowWhatsApp();
  return (
    <section className="px-4 py-5 sm:px-6 sm:py-6" aria-label="Book a demo">
      <div className="mx-auto max-w-xl rounded-[1.5rem] border border-accent/20 bg-white px-5 py-6 text-center shadow-card sm:px-8">
        <h2 className="text-xl font-display font-bold text-ink sm:text-2xl">{MID_FUNNEL_CTA.headline}</h2>
        <p className="mt-2 text-sm leading-6 text-ink/55">
          {whatsappReady ? MID_FUNNEL_CTA.support : MID_FUNNEL_CTA.supportFallback}
        </p>
        <div className="mt-5">
          <MidFunnelCTAGroup />
        </div>
      </div>
    </section>
  );
}

function ObjectionStrip() {
  return (
    <section className="mt-5" aria-label="Quick reassurances">
      <ul className="mx-auto flex max-w-4xl flex-wrap items-center justify-center gap-2">
        {OBJECTION_REASSURANCES_CORE.map((item) => (
          <li
            key={item}
            className="rounded-full border border-slate-200/80 bg-white px-3 py-1.5 text-xs font-medium text-ink/60"
          >
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function WelcomePage() {
  const whatsappReady = hasTillflowWhatsApp();

  return (
    <div className="welcome-page min-h-screen overflow-x-clip bg-paper">
      <header
        className="sticky top-0 z-50 border-b border-border bg-white/[0.98]"
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
              className="inline-flex min-h-11 items-center whitespace-nowrap rounded-xl px-2.5 py-2 text-xs font-semibold text-ink/60 transition hover:text-ink sm:px-3 sm:text-sm"
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
              For owners tired of guessing
            </div>
            <p className="welcome-hero-copy-delay text-sm font-bold text-ink/75 sm:text-base">{WELCOME_CATEGORY_LINE}</p>
            <h1 className="welcome-hero-copy-delay mt-2 text-[2.2rem] font-bold font-display leading-[1.08] tracking-tight text-ink sm:text-5xl lg:text-6xl">
              {WELCOME_HEADLINE}
            </h1>
            <p className="welcome-hero-copy-delay mt-3 text-base leading-7 text-ink/62 sm:text-lg">{WELCOME_SUBHEADLINE}</p>
            <p className="welcome-hero-copy-delay mt-3 text-base font-semibold text-ink sm:text-lg">{WELCOME_ANCHOR}</p>

            <HeroCTAGroup className="welcome-hero-cta mt-5" />
            <p className="welcome-hero-cta mt-2 text-sm text-ink/60">
              {whatsappReady ? WELCOME_HERO_SUPPORT_WHATSAPP : WELCOME_HERO_SUPPORT_FALLBACK}
            </p>
          </div>

          <HeroProductComposition />
        </div>
      </section>

      <EarlyNamedProof />
      <HopeStrip />
      <OwnerMomentsStrip />
      <RetailRealityBelt />
      <MicroPrime>{MICRO_PRIMES.beforeControl}</MicroPrime>
      <ControlSection />
      <MicroPrime>{MICRO_PRIMES.beforeProof}</MicroPrime>
      <ProductProofSection />
      <MidFunnelBridge />
      <TrustProofSection />
      <MicroPrime>{MICRO_PRIMES.beforePricing}</MicroPrime>

      <section id="pricing" className="scroll-mt-32 px-4 py-8 sm:px-6 sm:py-10">
        <div className="mx-auto max-w-6xl">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-accent">{PRICING_SECTION.eyebrow}</p>
            <h2 className="mt-3 text-3xl font-bold font-display text-ink sm:text-4xl">{PRICING_SECTION.headline}</h2>
          </div>
          <div className="mt-6 flex flex-col items-center gap-2 text-center">
            <PricingPrimaryCTA />
            <p className="max-w-xl text-sm text-ink/55">
              {whatsappReady ? PRICING_SECTION.support : PRICING_SECTION.supportFallback}
            </p>
            <p className="rounded-full border border-accent/20 bg-accentSoft/60 px-3 py-1.5 text-xs font-medium text-accent">
              {whatsappReady ? OBJECTION_PLAN_FIT_WHATSAPP : OBJECTION_PLAN_FIT_FALLBACK}
            </p>
          </div>
          <WelcomePricingPreview plans={planPreview} />
          <ObjectionStrip />
        </div>
      </section>

      <RevealOnScroll>
        <section className="border-y border-accent/20 bg-accent px-4 py-8 text-white sm:px-6 sm:py-12">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-3xl font-bold font-display sm:text-4xl">{FINAL_CTA.headline}</h2>
            <p className="mt-3 text-white/70">{FINAL_CTA.body}</p>
            <div className="mt-8 flex flex-col items-center justify-center gap-4">
              {whatsappReady ? <WhatsAppDemoButton tone="onAccent" className="w-full max-w-sm sm:w-auto" /> : null}
              {!whatsappReady ? (
                <a
                  href="mailto:hello@tishgroup.com?subject=TillFlow%20demo%20request"
                  className="inline-flex min-h-11 w-full max-w-sm items-center justify-center gap-2 rounded-2xl bg-white px-6 py-3.5 text-sm font-bold text-accent shadow-lg shadow-black/20 transition duration-150 hover:-translate-y-0.5 hover:bg-white/95 active:translate-y-0 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-accent sm:w-auto sm:px-8 sm:py-4 sm:text-base"
                >
                  Book a demo
                </a>
              ) : null}
              <LiveDemoButton
                variant="text"
                className="text-white/75 hover:text-white focus-visible:ring-white focus-visible:ring-offset-accent"
              />
            </div>
          </div>
        </section>
      </RevealOnScroll>

      <RevealOnScroll>
        <footer className="px-4 py-8 sm:px-6">
          <div className="mx-auto max-w-6xl">
            <Logo variant="lockup" size={22} alt="TillFlow" />
            <p className="mt-2 text-xs leading-5 text-ink/45">
              Built for Ghanaian retail · Works on phone, tablet and laptop
            </p>
            <p className="mt-2 text-[11px] text-muted">© 2026 TillFlow. A Tish Group product.</p>
          </div>
        </footer>
      </RevealOnScroll>
    </div>
  );
}
