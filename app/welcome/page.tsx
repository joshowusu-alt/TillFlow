import Link from 'next/link';
import WelcomePricingPreview, { type WelcomePlanPreview } from '@/components/WelcomePricingPreview';
import { FreeTrialLink, HeroCTAGroup, LiveDemoButton, WhatsAppDemoButton } from '@/components/marketing/WelcomeCTA';
import { Logo } from '@/components/Logo';
import { PLAN_MONTHLY_PRICES, ADDON_ONLINE_STOREFRONT_MONTHLY } from '@/lib/plan-pricing';
import {
  FEATURE_LIST,
  GHANA_REALITY_BULLETS,
  OUTCOME_CARDS,
  PRODUCT_PROOF_POINTS,
  ROLE_CARDS,
  TESTIMONIALS,
  TRUST_BADGES,
  WELCOME_HEADLINE,
  WELCOME_SUBHEADLINE,
} from '@/lib/marketing/welcome-content';

const planPreview: WelcomePlanPreview[] = [
  {
    name: 'Starter',
    monthlyPrice: PLAN_MONTHLY_PRICES.STARTER,
    note: 'For a small single-branch business starting clean.',
    bullets: [
      'POS, products and customers',
      'Inventory basics and receipts',
      'Offline-ready selling',
    ],
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
      description: 'Public online storefront with mobile-money checkout for pickup orders. Speak to TillFlow to enable.',
    },
  },
  {
    name: 'Pro',
    monthlyPrice: PLAN_MONTHLY_PRICES.PRO,
    note: 'For larger or multi-branch businesses that need more control.',
    bullets: [
      'Multi-branch stock transfers',
      'Audit log and cashflow forecast',
      'Online storefront included',
    ],
  },
];

const NAV_LINKS = [
  { href: '#product-proof', label: 'Product' },
  { href: '#ghana', label: 'Built for Ghana' },
  { href: '#pricing', label: 'Pricing' },
] as const;

function CheckIcon() {
  return (
    <svg className="h-4 w-4 shrink-0 text-accent" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
      <path
        fillRule="evenodd"
        d="M16.704 5.29a1 1 0 010 1.414l-7.25 7.25a1 1 0 01-1.414 0L3.296 9.21A1 1 0 014.71 7.796l4.037 4.036 6.543-6.543a1 1 0 011.414 0z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function OutcomeIcon({ icon }: { icon: string }) {
  const path =
    icon === 'pos'
      ? 'M5 6h14M5 12h8M5 18h5M17 12h2v6h-4v-4a2 2 0 012-2z'
      : icon === 'stock'
        ? 'M4 7l8-4 8 4-8 4-8-4zm0 5l8 4 8-4M4 17l8 4 8-4'
        : 'M6 5h12v14H6zM9 9h6M9 13h6M9 17h3';

  return (
    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accentSoft text-accent ring-1 ring-accent/10">
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d={path} />
      </svg>
    </div>
  );
}

const metricToneClasses = {
  accent: 'border-accent/15 bg-accentSoft',
  success: 'border-success/15 bg-successSoft',
  amber: 'border-amber-200 bg-amber-50',
} as const;

function MetricCard({ label, value, tone = 'accent' }: { label: string; value: string; tone?: keyof typeof metricToneClasses }) {
  return (
    <div className={`rounded-2xl border px-4 py-3 ${metricToneClasses[tone]}`}>
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">{label}</div>
      <div className="mt-1 text-xl font-bold font-display text-ink">{value}</div>
    </div>
  );
}

function HeroProductComposition() {
  return (
    <div data-testid="hero-product-composition" className="relative mx-auto w-full max-w-xl lg:max-w-none">
      <div className="absolute -inset-4 rounded-[2rem] bg-gradient-to-br from-accent/10 via-accent/5 to-accentSoft blur-2xl" />
      <div className="relative overflow-hidden rounded-[2rem] border border-white/70 bg-white/85 p-3 shadow-floating ring-1 ring-border backdrop-blur">
        <div className="rounded-[1.5rem] bg-ink p-4 text-white sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-accentSoft">Owner view</div>
              <div className="mt-1 text-lg font-bold font-display">Adom Retail Demo</div>
            </div>
            <div className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold text-white/75">Main Branch</div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 sm:gap-3">
            <MetricCard label="Today revenue" value="GH₵8,420" />
            <MetricCard label="Expected cash" value="GH₵3,185" tone="success" />
            <MetricCard label="Transactions" value="126" />
            <MetricCard label="Low stock items" value="14" tone="amber" />
          </div>

          <div className="mt-3 rounded-2xl bg-white px-4 py-3 text-ink">
            <div className="text-xs font-semibold text-muted">Needs attention today</div>
            <div className="mt-2 space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-ink/60">2 supplier payments due</span>
                <span className="rounded-full bg-amber-50 px-2 py-0.5 font-semibold text-amber-700">Follow up</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-ink/60">GH₵960 customer credit to collect</span>
                <span className="rounded-full bg-accentSoft px-2 py-0.5 font-semibold text-accent">3 customers</span>
              </div>
            </div>
          </div>
        </div>

        <div className="relative -mt-4 grid gap-3 px-2 pb-2 sm:-mt-5 sm:grid-cols-[0.88fr_0.62fr] sm:items-end">
          <div className="rounded-[1.5rem] border border-border bg-white p-3 shadow-raised sm:p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-accent">POS checkout</div>
                <div className="mt-1 text-sm font-bold text-ink">Counter sale</div>
              </div>
              <div className="rounded-full bg-accentSoft px-3 py-1 text-xs font-semibold text-accent">MoMo + Cash</div>
            </div>
            <div className="mt-3 rounded-2xl border border-border bg-surfaceMuted p-3">
              {[
                { name: 'Royal Aroma Rice 5kg', price: 82 },
                { name: 'Frytol Oil 1L', price: 45 },
                { name: 'Peak Milk Sachet', price: 12 },
              ].map((item) => (
                <div key={item.name} className="flex items-center justify-between border-b border-border py-1.5 last:border-0">
                  <span className="text-xs font-medium text-ink/60">{item.name}</span>
                  <span className="text-xs font-bold text-ink">GH₵{item.price}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-accentSoft px-3 py-2">
                <div className="text-[10px] font-semibold uppercase text-accent/70">Amount due</div>
                <div className="text-lg font-bold text-ink">GH₵139</div>
              </div>
              <div className="rounded-xl bg-successSoft px-3 py-2">
                <div className="text-[10px] font-semibold uppercase text-success/70">Change</div>
                <div className="text-lg font-bold text-ink">GH₵11</div>
              </div>
            </div>
            <div className="mt-3 rounded-xl bg-accent px-4 py-3 text-center text-sm font-bold text-white">Complete sale</div>
          </div>

          <div className="rounded-[1.5rem] border border-border bg-white p-3 shadow-raised sm:p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">Shift close</div>
            <div className="mt-2 text-xl font-bold font-display text-ink">Expected cash</div>
            <div className="mt-1 text-2xl font-bold text-accent">GH₵3,185</div>
            <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs sm:block sm:space-y-2">
              {[
                { label: 'Opening float', value: '+500' },
                { label: 'Cash sales', value: '+2,940' },
                { label: 'Supplier payments', value: '−180' },
                { label: 'Till expenses', value: '−75' },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between text-xs">
                  <span className="text-ink/50">{item.label}</span>
                  <span className={`font-semibold ${item.value.startsWith('−') ? 'text-rose' : 'text-ink'}`}>{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <p className="mt-2 text-center text-[11px] text-muted">Product illustration with example data</p>
    </div>
  );
}

function ProductProofVisual() {
  return (
    <div className="rounded-[2rem] border border-border bg-gradient-to-br from-ink to-accent p-4 text-white shadow-floating sm:p-5">
      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-[1.5rem] bg-white p-4 text-ink">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-accent">Owner dashboard</div>
              <div className="mt-1 text-lg font-bold font-display">Today at a glance</div>
            </div>
            <div className="rounded-full bg-accentSoft px-3 py-1 text-xs font-semibold text-accent">Example</div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <MetricCard label="Revenue" value="GH₵8,420" />
            <MetricCard label="Gross profit" value="GH₵2,105" tone="success" />
          </div>
          <div className="mt-4 h-20 rounded-2xl bg-gradient-to-r from-accentSoft via-successSoft to-accentSoft p-3 sm:h-24">
            <div className="flex h-full items-end gap-2">
              {[38, 54, 42, 68, 58, 82, 74].map((height, index) => (
                <div key={index} className="flex-1 rounded-t-lg bg-accent/80" style={{ height: `${height}%` }} />
              ))}
            </div>
          </div>
        </div>
        <div className="grid gap-3">
          {PRODUCT_PROOF_POINTS.map((item) => (
            <div key={item.title} className="rounded-2xl bg-white/10 p-3 ring-1 ring-white/10 sm:p-4">
              <div className="flex gap-3">
                <CheckIcon />
                <div>
                  <h3 className="font-semibold text-white">{item.title}</h3>
                  <p className="mt-1 text-sm leading-6 text-white/65">{item.desc}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function GhanaRetailVisual() {
  return (
    <div className="relative min-h-[220px] overflow-hidden rounded-[1.75rem] bg-gradient-to-br from-accentSoft via-paper to-accentSoft/60 p-4 sm:min-h-[260px] sm:p-5">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.75),transparent_40%),radial-gradient(circle_at_80%_10%,rgba(16,185,129,0.18),transparent_35%)]" />
      <div className="relative grid h-full gap-3">
        <div className="rounded-2xl bg-white/80 p-4 shadow-card ring-1 ring-white/80">
          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">Counter ready</div>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {['Cash', 'MoMo', 'Credit'].map((item) => (
              <div key={item} className="rounded-xl bg-accent px-3 py-2 text-center text-xs font-bold text-white">
                {item}
              </div>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-white/70 p-4 shadow-card">
            <div className="text-xs font-semibold text-muted">Stock units</div>
            <div className="mt-2 text-base font-bold text-ink sm:text-lg">Pieces · packs · cartons</div>
          </div>
          <div className="rounded-2xl bg-white/70 p-4 shadow-card">
            <div className="text-xs font-semibold text-muted">Network drops?</div>
            <div className="mt-2 text-base font-bold text-ink sm:text-lg">Keep selling</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function WelcomePage() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-paper">
      {/* Trust strip */}
      <div className="border-b border-accent/20 bg-accent text-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-4 gap-y-1 px-4 py-2 text-center text-[11px] font-medium text-white/85 sm:justify-between sm:text-left sm:text-xs">
          <span>Built for Ghanaian retail</span>
          <span className="hidden sm:inline">Works on phone, tablet and laptop</span>
          <span>WhatsApp demo available</span>
        </div>
      </div>

      {/* Navigation */}
      <header
        className="sticky top-0 z-50 border-b border-border bg-white/95 backdrop-blur-xl"
        style={{ paddingTop: 'max(0px, env(safe-area-inset-top, 0px))' }}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2.5 sm:px-6 sm:py-3">
          <Logo variant="lockup" size={28} alt="TillFlow" />
          <nav className="hidden items-center gap-5 md:flex" aria-label="Primary">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="text-sm font-semibold text-ink/55 transition hover:text-accent"
              >
                {link.label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="hidden rounded-xl px-3 py-2 text-sm font-semibold text-ink/60 transition hover:text-ink sm:inline-flex"
            >
              Sign in
            </Link>
            <WhatsAppDemoButton size="nav" className="hidden sm:inline-flex" />
            <Link
              href="/login"
              className="inline-flex rounded-xl px-3 py-2 text-sm font-semibold text-ink/60 sm:hidden"
            >
              Sign in
            </Link>
            <WhatsAppDemoButton size="nav" className="sm:hidden" />
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative px-4 pb-8 pt-6 sm:px-6 sm:pb-12 sm:pt-10">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-40 right-0 h-96 w-96 rounded-full bg-accentSoft blur-3xl" />
          <div className="absolute bottom-0 left-0 h-80 w-80 rounded-full bg-accent/10 blur-3xl" />
        </div>

        <div className="relative mx-auto grid max-w-6xl items-center gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:gap-12">
          <div className="max-w-xl">
            <div className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-accent/20 bg-accentSoft px-3 py-1 text-xs font-semibold text-accent">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              Running live in Ghanaian retail
            </div>
            <h1 className="text-4xl font-bold font-display tracking-tight text-ink sm:text-5xl lg:text-6xl">
              {WELCOME_HEADLINE}
            </h1>
            <p className="mt-5 text-base leading-8 text-ink/62 sm:text-lg">{WELCOME_SUBHEADLINE}</p>

            <HeroCTAGroup className="mt-6" />
            <p className="mt-3 text-sm text-ink/50">
              <FreeTrialLink /> · No signup required for the live demo
            </p>

            <div className="mt-6 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted sm:text-sm">
              {TRUST_BADGES.map((item) => (
                <span key={item} className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                  {item}
                </span>
              ))}
            </div>
          </div>

          <HeroProductComposition />
        </div>
      </section>

      {/* Outcomes */}
      <section className="px-4 py-6 sm:px-6 sm:py-8">
        <div className="mx-auto grid max-w-6xl gap-4 md:grid-cols-3">
          {OUTCOME_CARDS.map((card) => (
            <div key={card.title} className="rounded-[1.5rem] border border-border bg-white p-5 shadow-card">
              <OutcomeIcon icon={card.icon} />
              <h2 className="mt-4 text-lg font-bold font-display text-ink">{card.title}</h2>
              <p className="mt-2 text-sm leading-6 text-ink/55">{card.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Product proof */}
      <section id="product-proof" className="scroll-mt-24 px-4 py-6 sm:px-6 sm:py-10">
        <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-accent">The full picture</p>
            <h2 className="mt-3 text-3xl font-bold font-display text-ink sm:text-4xl">
              Everything between the first sale and the closing count.
            </h2>
            <p className="mt-4 text-base leading-7 text-ink/58">
              Every sale updates stock and money in the same system — so what the cashier sells, the stockroom holds and the owner expects always agree.
            </p>
            <div className="mt-6 grid grid-cols-2 gap-2">
              {FEATURE_LIST.map((feature) => (
                <div key={feature} className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm font-medium text-ink/60 shadow-sm ring-1 ring-border">
                  <CheckIcon />
                  {feature}
                </div>
              ))}
            </div>
          </div>

          <div className="hidden md:block">
            <ProductProofVisual />
          </div>
        </div>

        <div className="mx-auto mt-6 max-w-6xl rounded-[1.5rem] border border-border bg-white px-4 py-4 shadow-card">
          <div className="grid gap-3 text-sm sm:grid-cols-3">
            {ROLE_CARDS.map((role) => (
              <div key={role.role} className="flex items-center justify-between gap-3 rounded-2xl bg-surfaceMuted px-4 py-3">
                <span className="font-bold text-ink">{role.role}</span>
                <span className="text-right text-ink/50">{role.desc}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Ghana retail reality */}
      <section id="ghana" className="scroll-mt-24 px-4 py-6 sm:px-6 sm:py-10">
        <div className="mx-auto max-w-6xl overflow-hidden rounded-[2rem] border border-border bg-white shadow-card">
          <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[0.85fr_1.15fr] lg:items-center lg:p-8">
            <GhanaRetailVisual />
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-accent">Ghana retail reality</p>
              <h2 className="mt-3 text-3xl font-bold font-display text-ink sm:text-4xl">
                Built for Ghanaian retail reality.
              </h2>
              <p className="mt-4 text-base leading-8 text-ink/58">
                From supermarkets and pharmacies to wholesalers and provision shops, TillFlow is designed for cash, MoMo, credit customers, supplier payments, expenses, staff shifts and unstable internet.
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                {GHANA_REALITY_BULLETS.map((bullet) => (
                  <span key={bullet} className="rounded-full border border-border bg-surfaceMuted px-3 py-2 text-xs font-semibold text-ink/55">
                    {bullet}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pilot feedback */}
      <section className="px-4 py-6 sm:px-6 sm:py-10">
        <div className="mx-auto max-w-6xl rounded-[2rem] border border-border bg-white p-5 shadow-card sm:p-6 lg:p-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-accent">In daily use</p>
              <h2 className="mt-3 text-3xl font-bold font-display text-ink sm:text-4xl">
                What a live pilot told us.
              </h2>
              <p className="mt-3 text-sm text-ink/55">
                A Ghanaian supermarket running 1,000+ products, daily shifts and multiple cashiers on TillFlow. Name withheld at their request.
              </p>
            </div>
          </div>
          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            {TESTIMONIALS.map((item) => (
              <div key={item.title} className="rounded-2xl border border-border bg-surfaceMuted p-5">
                <h3 className="text-base font-semibold font-display text-ink">{item.title}</h3>
                <p className="mt-3 text-sm leading-6 text-ink/58">&ldquo;{item.quote}&rdquo;</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="scroll-mt-24 px-4 py-6 sm:px-6 sm:py-10">
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
              Not sure which fits? Message us on WhatsApp and we&rsquo;ll tell you honestly — including if TillFlow isn&rsquo;t right for you yet.
            </p>
            <div className="mt-3 flex justify-center">
              <WhatsAppDemoButton size="sm" />
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="border-y border-accent/20 bg-accent px-4 py-10 text-white sm:px-6 sm:py-14">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-3xl font-bold font-display sm:text-4xl">See TillFlow on your own counter.</h2>
          <p className="mt-3 text-white/70">
            A 15-minute WhatsApp walkthrough with a real person — no commitment, no setup needed. Or try the live demo yourself first.
          </p>
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
            <p className="mt-2 text-xs leading-5 text-ink/45">
              Built for Ghanaian retail · Works on phone, tablet and laptop
            </p>
            <p className="mt-2 text-[11px] text-muted">© 2026 Tish Group. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
