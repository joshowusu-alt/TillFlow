'use client';

import { useMemo, useState } from 'react';
import SubmitButton from '@/components/SubmitButton';
import BrandAssetUploaderCard from '@/components/BrandAssetUploaderCard';
import MerchantBrandBadge from '@/components/MerchantBrandBadge';
import {
  deriveMerchantInitials,
  getMerchantCompactBrandGuidance,
  resolveMerchantBrandPresentation,
  type MerchantBrandProfile,
  type MerchantBrandPresentation,
} from '@/lib/merchant-branding';

type Props = {
  businessName: string;
  initialBranding: Omit<MerchantBrandProfile, 'businessName'>;
  action: (formData: FormData) => void | Promise<void>;
};

function PreviewCard({
  title,
  subtitle,
  renderingNote,
  children,
}: {
  title: string;
  subtitle: string;
  renderingNote?: { text: string; wasFallback: boolean } | null;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-[17.5rem] snap-start rounded-2xl border border-black/5 bg-white p-3.5 shadow-[0_12px_28px_-24px_rgba(15,23,42,0.45)] sm:min-w-0 sm:p-4">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-black/45">{title}</div>
      <div className="mt-1 text-xs leading-5 text-black/55">{subtitle}</div>
      <div className="mt-3">{children}</div>
      {renderingNote && (
        <div
          className={`mt-3 flex items-start gap-2 rounded-xl px-3 py-2 text-[11px] leading-5 ${
            renderingNote.wasFallback ? 'bg-amber-50 text-amber-800' : 'bg-slate-50 text-slate-600'
          }`}
        >
          <span
            className={`mt-px shrink-0 font-bold uppercase tracking-widest text-[9px] ${
              renderingNote.wasFallback ? 'text-amber-500' : 'text-slate-400'
            }`}
          >
            {renderingNote.wasFallback ? 'Smart fallback' : 'Render choice'}
          </span>
          <span>{renderingNote.text}</span>
        </div>
      )}
    </div>
  );
}

export default function MerchantBrandManager({ businessName, initialBranding, action }: Props) {
  const [logoUrl, setLogoUrl] = useState(initialBranding.logoUrl);
  const [brandCompactLogoUrl, setBrandCompactLogoUrl] = useState(initialBranding.brandCompactLogoUrl);
  const [brandSquareLogoUrl, setBrandSquareLogoUrl] = useState(initialBranding.brandSquareLogoUrl);
  const [primaryPreviewUrl, setPrimaryPreviewUrl] = useState<string | null>(null);
  const [compactPreviewUrl, setCompactPreviewUrl] = useState<string | null>(null);
  const [squarePreviewUrl, setSquarePreviewUrl] = useState<string | null>(null);
  const [brandInitials, setBrandInitials] = useState(initialBranding.brandInitials ?? '');
  const [brandPrimaryColor, setBrandPrimaryColor] = useState(initialBranding.brandPrimaryColor ?? '#2563eb');
  const [brandCompactMode, setBrandCompactMode] = useState(initialBranding.brandCompactMode ?? 'AUTO');
  const [brandLogoBackground, setBrandLogoBackground] = useState(initialBranding.brandLogoBackground ?? 'AUTO');
  const fallbackInitials = useMemo(
    () => deriveMerchantInitials(businessName, brandInitials),
    [brandInitials, businessName],
  );

  const branding = useMemo<MerchantBrandProfile>(
    () => ({
      businessName,
      logoUrl: primaryPreviewUrl ?? logoUrl,
      logoWidth: primaryPreviewUrl ? null : initialBranding.logoWidth,
      logoHeight: primaryPreviewUrl ? null : initialBranding.logoHeight,
      brandCompactLogoUrl: compactPreviewUrl ?? brandCompactLogoUrl,
      brandCompactLogoWidth: compactPreviewUrl ? null : initialBranding.brandCompactLogoWidth,
      brandCompactLogoHeight: compactPreviewUrl ? null : initialBranding.brandCompactLogoHeight,
      brandSquareLogoUrl: squarePreviewUrl ?? brandSquareLogoUrl,
      brandSquareLogoWidth: squarePreviewUrl ? null : initialBranding.brandSquareLogoWidth,
      brandSquareLogoHeight: squarePreviewUrl ? null : initialBranding.brandSquareLogoHeight,
      receiptLogoUrl: initialBranding.receiptLogoUrl,
      storefrontLogoUrl: initialBranding.storefrontLogoUrl,
      storefrontPrimaryColor: initialBranding.storefrontPrimaryColor,
      storefrontTagline: initialBranding.storefrontTagline,
      brandInitials,
      brandPrimaryColor,
      brandCompactMode,
      brandLogoBackground,
    }),
    [
      brandCompactLogoUrl,
      brandCompactMode,
      brandInitials,
      brandLogoBackground,
      brandPrimaryColor,
      brandSquareLogoUrl,
      businessName,
      compactPreviewUrl,
      initialBranding.brandCompactLogoHeight,
      initialBranding.brandCompactLogoWidth,
      initialBranding.brandSquareLogoHeight,
      initialBranding.brandSquareLogoWidth,
      initialBranding.logoHeight,
      initialBranding.logoWidth,
      initialBranding.receiptLogoUrl,
      initialBranding.storefrontLogoUrl,
      initialBranding.storefrontPrimaryColor,
      initialBranding.storefrontTagline,
      logoUrl,
      primaryPreviewUrl,
      squarePreviewUrl,
    ],
  );

  const compactGuidance = getMerchantCompactBrandGuidance(branding);

  const presentations = useMemo(
    () => ({
      adminShell: resolveMerchantBrandPresentation(branding, 'admin-shell'),
      storefrontHero: resolveMerchantBrandPresentation(branding, 'storefront-hero'),
      receipt: resolveMerchantBrandPresentation(branding, 'receipt'),
      compactChip: resolveMerchantBrandPresentation(branding, 'compact-chip'),
    }),
    [branding],
  );
  const renderingNotes = useMemo(
    () => ({
      adminShell: describeRenderChoice(presentations.adminShell, 'admin header'),
      storefrontHero: describeRenderChoice(presentations.storefrontHero, 'storefront hero'),
      receipt: describeRenderChoice(presentations.receipt, 'receipt header'),
      compactChip: describeRenderChoice(presentations.compactChip, 'compact chip'),
    }),
    [presentations],
  );

  return (
    <div className="space-y-5 rounded-[28px] border border-black/5 bg-gradient-to-br from-white to-slate-50/80 p-4 shadow-sm sm:p-5 lg:p-6">
      <div>
        <div className="text-xs uppercase tracking-[0.24em] text-black/45">Brand identity</div>
        <h2 className="mt-1 text-xl font-display font-semibold text-ink">Merchant branding kit</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-black/60">
          Upload your source assets once. TillFlow chooses the clearest presentation for compact app surfaces,
          the storefront, and receipts.
        </p>
      </div>

      {compactGuidance ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
          <span className="font-semibold">TillFlow recommendation:</span> {compactGuidance}
        </div>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-3">
        <BrandAssetUploaderCard
          assetKey="PRIMARY"
          title="Primary logo"
          description="Your main logo for spacious, trust-building surfaces."
          recommendation="Best for wide or full logos. Compact app surfaces use safer alternatives unless you allow otherwise."
          currentUrl={logoUrl}
          businessName={businessName}
          fallbackInitials={fallbackInitials}
          fallbackColor={brandPrimaryColor}
          onChange={setLogoUrl}
          onPendingChange={setPrimaryPreviewUrl}
        />
        <BrandAssetUploaderCard
          assetKey="COMPACT"
          title="Compact logo / mark"
          description="Optional mark for headers, chips, and tighter app moments."
          recommendation="Best for short wordmarks or symbols. TillFlow prefers this over the primary logo in compact views."
          currentUrl={brandCompactLogoUrl}
          businessName={businessName}
          fallbackInitials={fallbackInitials}
          fallbackColor={brandPrimaryColor}
          onChange={setBrandCompactLogoUrl}
          onPendingChange={setCompactPreviewUrl}
        />
        <BrandAssetUploaderCard
          assetKey="SQUARE"
          title="Square logo / icon"
          description="Optional square icon for the smallest TillFlow surfaces."
          recommendation="Best for app-style marks and square badges. TillFlow prefers this on the most compact surfaces."
          currentUrl={brandSquareLogoUrl}
          businessName={businessName}
          fallbackInitials={fallbackInitials}
          fallbackColor={brandPrimaryColor}
          previewTone="square"
          onChange={setBrandSquareLogoUrl}
          onPendingChange={setSquarePreviewUrl}
        />
      </div>

      <form action={action} className="grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <div className="space-y-4 rounded-2xl border border-black/5 bg-white p-4 shadow-[0_14px_30px_-24px_rgba(15,23,42,0.45)] sm:p-5">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-black/45">Brand settings</div>
            <h3 className="mt-1 text-lg font-display font-semibold text-ink">How TillFlow should render you</h3>
            <p className="mt-1 text-xs leading-5 text-black/50">
              TillFlow protects compact surfaces automatically and falls back gracefully when an asset is missing
              or unreadable.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label">Fallback initials</label>
              <input
                className="input"
                name="brandInitials"
                value={brandInitials}
                onChange={(event) => setBrandInitials(event.target.value.toUpperCase())}
                placeholder="ES"
                maxLength={3}
              />
              <div className="mt-1 text-[11px] leading-5 text-black/50">
                Leave blank and TillFlow will derive them from your business name.
              </div>
            </div>

            <div>
              <label className="label">Brand primary colour</label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={brandPrimaryColor}
                  onChange={(event) => setBrandPrimaryColor(event.target.value)}
                  className="h-11 w-14 shrink-0 cursor-pointer rounded-xl border border-black/10 bg-white"
                />
                <input
                  className="input flex-1 font-mono text-sm"
                  name="brandPrimaryColor"
                  value={brandPrimaryColor}
                  onChange={(event) => setBrandPrimaryColor(event.target.value)}
                  pattern="^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$"
                />
              </div>
              <div className="mt-1 text-[11px] leading-5 text-black/50">
                Used for initials tiles and compact identity surfaces across TillFlow.
              </div>
            </div>
          </div>

          <div className="grid gap-3">
            <div>
              <label className="label">Compact surface strategy</label>
              <select
                className="input"
                name="brandCompactMode"
                value={brandCompactMode}
                onChange={(event) => setBrandCompactMode(event.target.value)}
              >
                <option value="AUTO">Smart fallback (Recommended)</option>
                <option value="INITIALS">Always use initials</option>
                <option value="LOGO">Allow primary logo in compact views</option>
              </select>
              <div className="mt-1 text-[11px] leading-5 text-black/50">
                Smart fallback uses your square or compact mark first, then switches to initials when needed.
              </div>
            </div>

            <div>
              <label className="label">Logo background style</label>
              <select
                className="input"
                name="brandLogoBackground"
                value={brandLogoBackground}
                onChange={(event) => setBrandLogoBackground(event.target.value)}
              >
                <option value="AUTO">Auto frame (Recommended)</option>
                <option value="NEUTRAL">White tile</option>
                <option value="SOFT_TILE">Soft tile</option>
                <option value="TINTED_TILE">Tinted tile</option>
                <option value="OUTLINE_TILE">Outline tile</option>
                <option value="TRANSPARENT">Transparent</option>
              </select>
              <div className="mt-1 text-[11px] leading-5 text-black/50">
                Auto keeps logos clear on both calm app surfaces and bolder storefront backgrounds.
              </div>
            </div>
          </div>

          <SubmitButton className="btn-primary w-full sm:w-fit" loadingText="Saving brand settings…">
            Save brand settings
          </SubmitButton>
        </div>

        <div className="space-y-3">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-black/45">Preview surfaces</div>
            <h3 className="mt-1 text-lg font-display font-semibold text-ink">How TillFlow will present you</h3>
            <p className="mt-1 text-xs leading-5 text-black/50">
              Preview the live render choice before you save settings or confirm a new asset.
            </p>
          </div>
          <div className="-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:grid sm:px-0 xl:grid-cols-2">
          <PreviewCard
            title="Admin header"
            subtitle="Compact surfaces stay clean and controlled."
            renderingNote={{ text: renderingNotes.adminShell, wasFallback: presentations.adminShell.wasFallbackUsed }}
          >
            <div className="rounded-2xl border border-slate-200/80 bg-white p-3 shadow-sm">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-sm font-black text-white">
                    TF
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-ink">TillFlow</div>
                    <div className="text-[11px] uppercase tracking-[0.18em] text-black/45">
                      Premium operations
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 rounded-full border border-black/5 bg-slate-50 px-2.5 py-1.5">
                  <MerchantBrandBadge branding={branding} surface="admin-shell" />
                  <div className="min-w-0">
                    <div className="truncate text-xs font-semibold text-ink">{businessName}</div>
                    <div className="text-[11px] text-black/45">Compact app identity</div>
                  </div>
                </div>
              </div>
            </div>
          </PreviewCard>

          <PreviewCard
            title="Storefront hero"
            subtitle="Larger trust-building surfaces can show the fuller brand."
            renderingNote={{ text: renderingNotes.storefrontHero, wasFallback: presentations.storefrontHero.wasFallbackUsed }}
          >
            <div
              className="overflow-hidden rounded-[24px] p-3.5 text-white shadow-sm"
              style={{ backgroundColor: branding.storefrontPrimaryColor || brandPrimaryColor || '#2563eb' }}
            >
              <div className="flex items-start gap-3">
                <MerchantBrandBadge branding={branding} surface="storefront-hero" />
                <div className="min-w-0">
                  <div className="inline-flex items-center rounded-full bg-white/15 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.18em]">
                    TillFlow online store
                  </div>
                  <div className="mt-2 text-base font-bold leading-tight sm:text-lg">{businessName}</div>
                  <div className="mt-1 text-xs leading-5 text-white/80">
                    {branding.storefrontTagline || 'Fresh pickup, trusted pricing, and a premium storefront feel.'}
                  </div>
                  <div className="mt-2 inline-flex items-center rounded-full bg-white/12 px-2.5 py-1 text-[11px] font-semibold text-white/90">
                    Pickup and payment details stay clear
                  </div>
                </div>
              </div>
            </div>
          </PreviewCard>

            <PreviewCard
              title="Receipt header"
              subtitle="Receipts prioritise legibility over literal logo fidelity."
              renderingNote={{ text: renderingNotes.receipt, wasFallback: presentations.receipt.wasFallbackUsed }}
            >
              <div className="rounded-2xl border border-black/10 bg-white p-3 text-center shadow-sm">
                <MerchantBrandBadge branding={branding} surface="receipt" className="mx-auto" />
                <div className="mt-3 text-sm font-semibold text-ink">{businessName}</div>
                <div className="mt-1 text-[11px] text-black/50">24 Oxford Street, Accra</div>
              </div>
            </PreviewCard>

            <PreviewCard
              title="Compact chip"
              subtitle="Small identity chips always protect clarity first."
              renderingNote={{ text: renderingNotes.compactChip, wasFallback: presentations.compactChip.wasFallbackUsed }}
            >
              <div className="rounded-2xl border border-black/10 bg-white p-3 shadow-sm">
                <div className="inline-flex items-center gap-2 rounded-full border border-black/5 bg-slate-50 px-3 py-2">
                  <MerchantBrandBadge branding={branding} surface="compact-chip" />
                  <div className="text-left">
                    <div className="text-xs font-semibold text-ink">{businessName}</div>
                    <div className="text-[11px] text-black/45">
                      {presentations.compactChip.source === 'initials' ? 'TillFlow smart fallback' : 'Compact merchant asset'}
                    </div>
                  </div>
                </div>
              </div>
            </PreviewCard>
          </div>
        </div>
      </form>
    </div>
  );
}

function describeRenderChoice(presentation: MerchantBrandPresentation, surfaceLabel: string) {
  switch (presentation.source) {
    case 'storefront-override':
      return 'Storefront logo used for the hero.';
    case 'receipt-override':
      return 'Receipt logo used for print layouts.';
    case 'primary-logo':
      return `Primary logo used for the ${surfaceLabel}.`;
    case 'compact-logo':
      return presentation.wasFallbackUsed
        ? `Compact logo used to protect the ${surfaceLabel}.`
        : `Compact logo used for the ${surfaceLabel}.`;
    case 'square-logo':
      return surfaceLabel === 'storefront hero'
        ? 'Square logo used because it is the strongest available hero asset.'
        : 'Square logo used — best for compact surfaces.';
    case 'initials':
    default:
      return surfaceLabel === 'storefront hero'
        ? 'Fallback initials used because no suitable hero asset is available.'
        : 'Fallback initials used because no suitable compact asset is available.';
  }
}
