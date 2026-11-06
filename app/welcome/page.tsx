import HomepageDemo from '@/components/marketing/HomepageDemo';
import GettingStarted from '@/components/marketing/GettingStarted';
import PlanComparison from '@/components/marketing/PlanComparison';
import Link from 'next/link';
import './welcome-marketing.css';
import WelcomePricingPreview, { type WelcomePlanPreview } from '@/components/WelcomePricingPreview';
import TrustProofSection from '@/components/marketing/TrustProofSection';
import RevealOnScroll from '@/components/marketing/RevealOnScroll';
import {
  HeroCTAGroup,
  PricingPrimaryCTA,
  WhatsAppDemoButton,
  hasTillflowWhatsApp,
} from '@/components/marketing/WelcomeCTA';
import HeroProductComposition from '@/components/marketing/visuals/HeroProductComposition';
import { Logo } from '@/components/Logo';
import { PLAN_MONTHLY_PRICES, ADDON_ONLINE_STOREFRONT_MONTHLY } from '@/lib/plan-pricing';
import {
  FINAL_CTA,
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
    note: 'For a single shop getting organised.',
    bullets: ['Sell and record every transaction', 'Products, customers and basic stock', 'Offline-ready selling'],
  },
  {
    name: 'Growth',
    monthlyPrice: PLAN_MONTHLY_PRICES.GROWTH,
    maturity: 'Owner visibility',
    note: 'For owners who need a clearer view of their money.',
    featured: true,
    bullets: [
      'Expected cash and shift closing',
      'Margins, reorder support and Owner View',
      'Financial and advanced reports',
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
    note: 'For businesses running multiple branches.',
    bullets: ['Multi-branch stock transfers', 'Audit log and cashflow forecast', 'Online storefront included'],
  },
];

const NAV_LINKS = [
  { href: '#stories', label: 'Customer' },
  { href: '#product-proof', label: 'Demo' },
  { href: '#pricing', label: 'Pricing' },
] as const;

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
        <nav aria-label="Mobile navigation" className="flex gap-1 overflow-x-auto border-t border-slate-100 px-3 md:hidden">
          {NAV_LINKS.map(link => <a key={link.href} href={link.href} className="inline-flex min-h-11 shrink-0 items-center px-3 text-sm font-semibold text-slate-700">{link.label}</a>)}
        </nav>
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

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        '@context': 'https://schema.org', '@type': 'SoftwareApplication', name: 'TillFlow',
        applicationCategory: 'BusinessApplication', operatingSystem: 'Web', url: 'https://www.tillflow.app/welcome',
        description: 'POS, inventory and financial management for Ghanaian retailers.',
        offers: Object.entries(PLAN_MONTHLY_PRICES).map(([plan, price]) => ({ '@type': 'Offer', name: `${plan} monthly`, price, priceCurrency: 'GHS', url: `https://www.tillflow.app/register?plan=${plan}` })),
      }).replace(/</g, '\u003c') }} />
      <TrustProofSection />
      <HomepageDemo />

      <section id="pricing" className="scroll-mt-32 px-4 py-8 sm:px-6 sm:py-10">
        <div className="mx-auto max-w-6xl">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-accent">Pricing</p>
            <h2 className="mt-3 text-3xl font-bold font-display text-ink sm:text-4xl">A plan for your next stage.</h2>
          </div>
          <WelcomePricingPreview plans={planPreview} />
          <PlanComparison />
          <div className="mt-4 text-center"><PricingPrimaryCTA /></div>
        </div>
      </section>

      <GettingStarted />

      <RevealOnScroll>
        <section className="border-y border-accent/20 bg-accent px-4 py-8 text-white sm:px-6 sm:py-12">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-3xl font-bold font-display sm:text-4xl">{FINAL_CTA.headline}</h2>
            <p className="mt-3 text-white/90">A 15-minute walkthrough. No setup needed.</p>
            <div className="mt-5 flex flex-col items-center justify-center gap-3">
              {whatsappReady ? <WhatsAppDemoButton tone="onAccent" className="w-full max-w-sm sm:w-auto" /> : null}
              {!whatsappReady ? (
                <a
                  href="mailto:hello@tishgroup.com?subject=TillFlow%20demo%20request"
                  className="inline-flex min-h-11 w-full max-w-sm items-center justify-center gap-2 rounded-2xl bg-white px-6 py-3.5 text-sm font-bold text-accent shadow-lg shadow-black/20 transition duration-150 hover:-translate-y-0.5 hover:bg-white/95 active:translate-y-0 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-accent sm:w-auto sm:px-8 sm:py-4 sm:text-base"
                >
                  Book a demo
                </a>
              ) : null}
              <Link href="/demo" className="inline-flex min-h-11 items-center rounded-md text-sm font-semibold text-white underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-accent">
                See live demo
              </Link>
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
            <nav aria-label="Footer" className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm font-semibold text-accent">
              <Link href="/demo" className="inline-flex min-h-11 items-center">Explore demo</Link>
              <a href="#pricing" className="inline-flex min-h-11 items-center">Plans and pricing</a>
              <Link href="/register" className="inline-flex min-h-11 items-center">Get started</Link>
              <a href="tel:+233547016160" className="inline-flex min-h-11 items-center">+233 54 701 6160</a>
              <a href="https://www.facebook.com/share/1F2NDE5Zp2/?mibextid=wwXIfr" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center">Facebook</a>
              <a href="https://www.tiktok.com/@tillflowapp" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center">TikTok</a>
            </nav>
            <p className="mt-2 text-[11px] text-muted">© 2026 TillFlow. A Tish Group product.</p>
          </div>
        </footer>
      </RevealOnScroll>
    </div>
  );
}
