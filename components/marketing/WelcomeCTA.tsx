import Link from 'next/link';
import {
  getTillflowWhatsAppPlanFitUrl,
  getTillflowWhatsAppUrl,
  hasTillflowWhatsApp,
} from '@/lib/marketing/whatsapp';

const WHATSAPP_ICON = (
  <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.881 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
  </svg>
);

const EMAIL_DEMO_HREF = 'mailto:hello@tishgroup.com?subject=TillFlow%20demo%20request';

type CtaSize = 'sm' | 'md' | 'nav';

const sizeClasses: Record<CtaSize, string> = {
  sm: 'rounded-xl px-4 py-2.5 text-sm',
  md: 'rounded-2xl px-6 py-3.5 text-sm sm:px-8 sm:py-4 sm:text-base',
  nav: 'rounded-xl px-3 py-2 text-xs sm:px-4 sm:py-2.5 sm:text-sm',
};

const primaryWhatsAppClass =
  'inline-flex min-h-11 items-center justify-center gap-2 bg-accent font-bold text-white shadow-lg shadow-accent/25 transition duration-150 hover:-translate-y-0.5 hover:bg-accent/90 hover:shadow-xl hover:shadow-accent/30 active:translate-y-0 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2';

/** High-contrast primary for use on the accent final-CTA band. */
const primaryWhatsAppOnAccentClass =
  'inline-flex min-h-11 items-center justify-center gap-2 bg-white font-bold text-accent shadow-lg shadow-black/20 transition duration-150 hover:-translate-y-0.5 hover:bg-white/95 hover:shadow-xl hover:shadow-black/25 active:translate-y-0 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-accent';

const secondaryLiveDemoClass =
  'inline-flex min-h-11 items-center justify-center gap-2 border-2 border-accent/25 bg-white font-bold text-accent shadow-sm transition duration-150 hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-md active:translate-y-0 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2';

const secondaryTextLinkClass =
  'rounded-md text-sm font-semibold text-ink/55 underline-offset-4 transition duration-150 hover:text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2';

export function WhatsAppDemoButton({
  size = 'md',
  className = '',
  pulseOnce = false,
  label = 'Book demo on WhatsApp',
  href,
  tone = 'default',
}: {
  size?: CtaSize;
  className?: string;
  pulseOnce?: boolean;
  label?: string;
  /** Override URL (e.g. plan-fit message). Defaults to standard demo URL. */
  href?: string | null;
  /** Use onAccent on the blue final CTA band so WhatsApp stays visually primary. */
  tone?: 'default' | 'onAccent';
}) {
  const url = href === undefined ? getTillflowWhatsAppUrl() : href;
  if (!url) return null;

  const toneClass = tone === 'onAccent' ? primaryWhatsAppOnAccentClass : primaryWhatsAppClass;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={`${toneClass} ${pulseOnce ? 'welcome-cta-pulse-once' : ''} ${sizeClasses[size]} ${className}`}
    >
      {WHATSAPP_ICON}
      {label}
    </a>
  );
}

/** Local/adaptive primary when WhatsApp env is missing — never silently promote live demo. */
export function DemoBookingFallbackButton({
  size = 'md',
  className = '',
}: {
  size?: CtaSize;
  className?: string;
}) {
  return (
    <a
      href={EMAIL_DEMO_HREF}
      className={`${primaryWhatsAppClass} ${sizeClasses[size]} ${className}`}
    >
      Book a demo
    </a>
  );
}

export function LiveDemoButton({
  size = 'md',
  className = '',
  variant = 'button',
}: {
  size?: CtaSize;
  className?: string;
  variant?: 'button' | 'text';
}) {
  if (variant === 'text') {
    return (
      <Link href="/demo" className={`${secondaryTextLinkClass} ${className}`}>
        See live demo
      </Link>
    );
  }

  return (
    <Link href="/demo" className={`${secondaryLiveDemoClass} ${sizeClasses[size]} ${className}`}>
      <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
      </svg>
      See live demo
    </Link>
  );
}

export function FreeTrialLink({ className = '' }: { className?: string }) {
  return (
    <Link
      href="/register"
      className={`rounded-md font-semibold text-ink/55 underline-offset-4 transition duration-150 hover:text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ${className}`}
    >
      Start free trial
    </Link>
  );
}

export function HeroCTAGroup({ className = '' }: { className?: string }) {
  const whatsappReady = hasTillflowWhatsApp();

  return (
    <div className={`flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center ${className}`}>
      {whatsappReady ? (
        <WhatsAppDemoButton className="w-full sm:w-auto" pulseOnce />
      ) : (
        <DemoBookingFallbackButton className="w-full sm:w-auto" />
      )}
      <LiveDemoButton className="w-full sm:w-auto" />
    </div>
  );
}

export function MidFunnelCTAGroup({ className = '' }: { className?: string }) {
  const whatsappReady = hasTillflowWhatsApp();

  return (
    <div className={`flex flex-col items-center gap-3 ${className}`}>
      {whatsappReady ? <WhatsAppDemoButton size="md" /> : <DemoBookingFallbackButton size="md" />}
      <LiveDemoButton variant="text" />
    </div>
  );
}

export function PricingPrimaryCTA({ className = '' }: { className?: string }) {
  const planFitUrl = getTillflowWhatsAppPlanFitUrl();
  if (planFitUrl) {
    return (
      <WhatsAppDemoButton
        size="md"
        label="See which plan fits your business"
        href={planFitUrl}
        className={className}
      />
    );
  }

  return <DemoBookingFallbackButton size="md" className={className} />;
}

export { hasTillflowWhatsApp };
