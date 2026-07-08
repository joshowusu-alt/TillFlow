import RevealOnScroll from '@/components/marketing/RevealOnScroll';
import { PosCheckoutPreview } from '@/components/marketing/visuals/PosCheckoutPreview';
import { ReportsAnalyticsPreview } from '@/components/marketing/visuals/ReportsAnalyticsPreview';
import { ShiftClosePreview } from '@/components/marketing/visuals/ShiftClosePreview';
import { StockSuppliersPreview } from '@/components/marketing/visuals/StockSuppliersPreview';
import { PRODUCT_PROOF_PANELS } from '@/lib/marketing/welcome-content';

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

function visualFrameClass(panel: (typeof PRODUCT_PROOF_PANELS)[number]) {
  if (panel.visual === 'shift-close') {
    return 'p-4 sm:p-5';
  }

  return 'max-h-[360px] overflow-hidden p-4 sm:max-h-none sm:p-5';
}

export default function ProductProofSection() {
  return (
    <section id="product-proof" className="scroll-mt-24 px-4 py-6 sm:px-6 sm:py-9">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-accent">Product proof</p>
          <h2 className="mt-3 text-3xl font-bold font-display text-ink sm:text-4xl">
            Four things owners need under control.
          </h2>
          <p className="mt-3 text-base leading-7 text-ink/58">
            Checkout, stock, cash and reports are connected, so closing day is not guesswork.
          </p>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {PRODUCT_PROOF_PANELS.map((panel) => (
            <RevealOnScroll key={panel.id}>
              <article className="overflow-hidden rounded-[1.5rem] border border-slate-200/80 bg-white shadow-card">
                <div className="border-b border-slate-200/80 px-4 py-3 sm:px-5 sm:py-4">
                  <h3 className="text-lg font-display font-bold text-ink">{panel.title}</h3>
                  <p className="mt-1 text-sm leading-6 text-ink/58">{panel.benefit}</p>
                </div>
                <div className={visualFrameClass(panel)}>
                  <ProofVisual panel={panel} />
                </div>
              </article>
            </RevealOnScroll>
          ))}
        </div>
      </div>
    </section>
  );
}
