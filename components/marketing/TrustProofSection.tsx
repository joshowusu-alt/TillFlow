import RevealOnScroll from '@/components/marketing/RevealOnScroll';
import { TRUST_PROOF, TRUST_PROOF_THEMES } from '@/lib/marketing/welcome-content';

export default function TrustProofSection() {
  return (
    <section id="trust" className="scroll-mt-24 px-4 py-6 sm:px-6 sm:py-9">
      <RevealOnScroll>
        <div className="mx-auto max-w-6xl rounded-[2rem] border border-slate-200/80 bg-white p-5 shadow-card sm:p-6 lg:p-7">
          <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-accent">Trusted in Ghana</p>
              <h2 className="mt-3 text-3xl font-bold font-display text-ink sm:text-4xl">{TRUST_PROOF.headline}</h2>
              <p className="mt-4 text-base leading-7 text-ink/58">{TRUST_PROOF.intro}</p>
              <p className="mt-3 text-sm font-semibold text-ink/70">
                {TRUST_PROOF.person}, {TRUST_PROOF.business}
              </p>
            </div>

            <div className="grid gap-3">
              {TRUST_PROOF_THEMES.map((item) => (
                <div
                  key={item.title}
                  className={`rounded-[1.25rem] border p-4 ${
                    item.featured
                      ? 'border-blue-100 bg-gradient-to-br from-blue-50 via-white to-blue-50/70'
                      : 'border-slate-200/80 bg-surfaceMuted'
                  }`}
                >
                  <h3 className="text-base font-semibold font-display text-ink">{item.title}</h3>
                  <p className="mt-1 text-sm leading-6 text-ink/70">{item.quote}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </RevealOnScroll>
    </section>
  );
}
