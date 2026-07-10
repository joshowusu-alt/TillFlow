import RevealOnScroll from '@/components/marketing/RevealOnScroll';
import { PosCheckoutPreview } from '@/components/marketing/visuals/PosCheckoutPreview';
import { ReportsAnalyticsPreview } from '@/components/marketing/visuals/ReportsAnalyticsPreview';
import { ShiftClosePreview } from '@/components/marketing/visuals/ShiftClosePreview';
import { StockSuppliersPreview } from '@/components/marketing/visuals/StockSuppliersPreview';
import { PRODUCT_PROOF_PANELS, PRODUCT_PROOF_SECTION } from '@/lib/marketing/welcome-content';

function ProofVisual({ panel }: { panel: (typeof PRODUCT_PROOF_PANELS)[number] }) {
  if (panel.visual === 'pos') {
    return <PosCheckoutPreview />;
  }

  if (panel.visual === 'stock-suppliers') {
    return <StockSuppliersPreview />;
  }

  if (panel.visual === 'shift-close') {
    return <ShiftClosePreview />;
  }

  if (panel.visual === 'reports-analytics') {
    return <ReportsAnalyticsPreview />;
  }

  return null;
}

function PanelCopy({ panel }: { panel: (typeof PRODUCT_PROOF_PANELS)[number] }) {
  return (
    <>
      {'moment' in panel && panel.moment ? (
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">{panel.moment}</p>
      ) : null}
      <h3 className={`text-lg font-display font-bold text-ink ${'moment' in panel && panel.moment ? 'mt-2' : ''}`}>
        {panel.title}
      </h3>
      <p className="mt-1 text-sm leading-6 text-ink/58">{panel.benefit}</p>
    </>
  );
}

function PanelProofLine({ panel }: { panel: (typeof PRODUCT_PROOF_PANELS)[number] }) {
  if (!('proofLine' in panel) || !panel.proofLine) return null;
  return <p className="mt-3 text-sm font-medium leading-6 text-ink/70">{panel.proofLine}</p>;
}

export default function ProductProofSection() {
  return (
    <section id="product-proof" className="scroll-mt-32 px-4 py-6 sm:px-6 sm:py-9">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-accent">{PRODUCT_PROOF_SECTION.eyebrow}</p>
          <h2 className="mt-3 text-3xl font-bold font-display text-ink sm:text-4xl">{PRODUCT_PROOF_SECTION.headline}</h2>
          <p className="mt-3 text-base leading-7 text-ink/58">{PRODUCT_PROOF_SECTION.intro}</p>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {PRODUCT_PROOF_PANELS.map((panel, index) => {
            const visualFirst = panel.rhythm === 'outcome-visual-quote' || panel.rhythm === 'prime-visual-explain';

            return (
              <RevealOnScroll key={panel.id} delayMs={index * 60}>
                <article className="overflow-hidden rounded-[1.5rem] border border-slate-200/80 bg-white shadow-card">
                  {visualFirst ? (
                    <>
                      <div className="border-b border-slate-200/80 p-4 sm:p-5">
                        {'moment' in panel && panel.moment ? (
                          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-accent">{panel.moment}</p>
                        ) : null}
                        <ProofVisual panel={panel} />
                      </div>
                      <div className="px-4 py-3 sm:px-5 sm:py-4">
                        <h3 className="text-lg font-display font-bold text-ink">{panel.title}</h3>
                        <p className="mt-1 text-sm leading-6 text-ink/58">{panel.benefit}</p>
                        <PanelProofLine panel={panel} />
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="border-b border-slate-200/80 px-4 py-3 sm:px-5 sm:py-4">
                        <PanelCopy panel={panel} />
                      </div>
                      <div className="p-4 sm:p-5">
                        <ProofVisual panel={panel} />
                        <PanelProofLine panel={panel} />
                      </div>
                    </>
                  )}
                </article>
              </RevealOnScroll>
            );
          })}
        </div>
      </div>
    </section>
  );
}
