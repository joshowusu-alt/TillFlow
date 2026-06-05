const DEFAULT_DEMO_MESSAGE = "Hello, I'd like to book a TillFlow demo for my business.";

export function getTillflowWhatsAppUrl(message = DEFAULT_DEMO_MESSAGE): string | null {
  const raw = process.env.NEXT_PUBLIC_TILLFLOW_WHATSAPP?.trim();
  if (!raw) return null;

  const digits = raw.replace(/\D/g, '');
  if (!digits) return null;

  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

export function hasTillflowWhatsApp(): boolean {
  return getTillflowWhatsAppUrl() !== null;
}
