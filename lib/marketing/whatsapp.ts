const DEFAULT_DEMO_MESSAGE = "Hello, I'd like to book a TillFlow demo for my business.";
const PLAN_FIT_MESSAGE =
  "Hello, I'd like help choosing the right TillFlow plan for my business.";

export const TILLFLOW_WHATSAPP_ENV_KEY = 'NEXT_PUBLIC_TILLFLOW_WHATSAPP';

export type TillflowWhatsAppResolution =
  | { configured: true; url: string; digits: string }
  | { configured: false; reason: 'missing' | 'invalid' };

/**
 * Strict production = a real Vercel production deployment URL, or an explicit require flag.
 * Pulled-down Vercel env files often set VERCEL=1 locally with an empty VERCEL_URL —
 * those builds stay adaptive so the primary CTA can fall back safely.
 */
export function isTillflowWhatsAppRequired(): boolean {
  if (process.env.TILLFLOW_REQUIRE_WHATSAPP === 'true') return true;
  if (process.env.TILLFLOW_REQUIRE_WHATSAPP === 'false') return false;
  return (
    process.env.VERCEL === '1' &&
    process.env.VERCEL_ENV === 'production' &&
    Boolean(process.env.VERCEL_URL?.trim())
  );
}

function readWhatsAppRaw(): string | null {
  const raw = process.env.NEXT_PUBLIC_TILLFLOW_WHATSAPP?.trim();
  return raw || null;
}

export function resolveTillflowWhatsApp(message = DEFAULT_DEMO_MESSAGE): TillflowWhatsAppResolution {
  const raw = readWhatsAppRaw();
  if (!raw) return { configured: false, reason: 'missing' };

  const digits = raw.replace(/\D/g, '');
  if (!digits) return { configured: false, reason: 'invalid' };

  return {
    configured: true,
    digits,
    url: `https://wa.me/${digits}?text=${encodeURIComponent(message)}`,
  };
}

export function getTillflowWhatsAppUrl(message = DEFAULT_DEMO_MESSAGE): string | null {
  const resolved = resolveTillflowWhatsApp(message);
  return resolved.configured ? resolved.url : null;
}

export function getTillflowWhatsAppPlanFitUrl(): string | null {
  return getTillflowWhatsAppUrl(PLAN_FIT_MESSAGE);
}

export function hasTillflowWhatsApp(): boolean {
  return resolveTillflowWhatsApp().configured;
}

/**
 * Call from the public welcome page (and any production validation).
 * Throws in strict production when WhatsApp is missing/invalid so the primary
 * CTA cannot silently disappear from a live deploy.
 */
export function assertTillflowWhatsAppConfiguredForProduction(): void {
  if (!isTillflowWhatsAppRequired()) return;

  const resolved = resolveTillflowWhatsApp();
  if (resolved.configured) return;

  throw new Error(
    `[TillFlow] ${TILLFLOW_WHATSAPP_ENV_KEY} is required in production (reason: ${resolved.reason}). ` +
      'Set a WhatsApp business number so “Book demo on WhatsApp” cannot disappear from the welcome page.',
  );
}
