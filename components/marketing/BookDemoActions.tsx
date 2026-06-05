import { getTillflowWhatsAppUrl } from '@/lib/marketing/whatsapp';

const EMAIL_HREF = 'mailto:hello@tishgroup.com?subject=TillFlow%20demo%20request';

type BookDemoActionsProps = {
  layout?: 'hero' | 'compact';
  /** When false, only WhatsApp is shown (hero secondary CTA). */
  showEmail?: boolean;
};

export default function BookDemoActions({ layout = 'hero', showEmail = true }: BookDemoActionsProps) {
  const whatsappUrl = getTillflowWhatsAppUrl();
  const isHero = layout === 'hero';

  const emailClass = isHero
    ? 'flex items-center gap-2 rounded-2xl border-2 border-accent/30 bg-white px-8 py-4 text-base font-bold text-accent shadow-lg transition-all hover:border-accent/40 hover:shadow-xl hover:-translate-y-0.5'
    : 'inline-flex items-center gap-2 rounded-xl border border-accent/25 bg-white px-4 py-2.5 text-sm font-semibold text-accent transition hover:border-accent/40';

  const whatsappClass = isHero
    ? 'flex w-full max-w-xs items-center justify-center gap-2 rounded-2xl border-2 border-emerald-500/30 bg-emerald-50 px-8 py-4 text-base font-bold text-emerald-800 shadow-lg transition-all hover:border-emerald-500/50 hover:shadow-xl hover:-translate-y-0.5 sm:w-auto'
    : 'inline-flex items-center gap-2 rounded-xl border border-emerald-500/25 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-800 transition hover:border-emerald-500/40';

  return (
    <>
      {whatsappUrl ? (
        <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className={whatsappClass}>
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.881 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
          </svg>
          Book demo on WhatsApp
        </a>
      ) : null}
      {showEmail ? (
        <a href={EMAIL_HREF} className={emailClass}>
          {whatsappUrl ? 'Book demo by email' : 'Book a demo'}
        </a>
      ) : null}
    </>
  );
}
